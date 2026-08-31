import { invariant, prerequisite } from "../errors.mjs";
import { mutateOnce } from "../operations.mjs";

const TOTAL_FIELDS = [
  "subtotal_vnd",
  "total_voucher_discount_vnd",
  "total_vnd",
  "shipping_fee_vnd",
  "freeship_discount_vnd",
  "grand_total_vnd",
];

function assertTotals(actual, expected, code) {
  for (const field of TOTAL_FIELDS) invariant(actual?.[field] === expected[field], `${code}_${field.toUpperCase()}`);
}

function notesMatch(actual, expected) {
  const sorted = values => [...values].map(value => value ?? null).sort((left, right) => String(left).localeCompare(String(right)));
  return JSON.stringify(sorted(actual)) === JSON.stringify(sorted(expected));
}

async function classifyCreatePrerequisite(response, db, catalogFingerprint) {
  if (response.status === 429) prerequisite(false, "SMOKE_ORDER_RATE_LIMITED");
  if (response.status === 503 && response.body?.code === "STORE_CLOSED") prerequisite(false, "SMOKE_STORE_CLOSED");
  if (response.status === 409 && response.body?.code === "PRICE_CHANGED") {
    const current = await db.catalog();
    invariant(catalogFingerprint && current?.fingerprint, "PRICE_CHANGE_CATALOG_EVIDENCE_MISSING");
    invariant(false, current.fingerprint === catalogFingerprint ? "UNEXPECTED_PRICE_CHANGED" : "CATALOG_CHANGED");
  }
}

/** Create one exact-marker customer order and verify API plus database snapshots.
 * @param {{actor: import('./common.mjs').JourneyActor, actorName: string, userId: string,
 * db: {ordersByMarkers: (markers: string[]) => Promise<Array<Record<string, unknown>>>, order: (id: string) => Promise<Record<string, unknown>|null|undefined>,
 * vouchers?: (ids: string[]) => Promise<Array<Record<string, unknown>>>, activeUses?: (ids: string[]) => Promise<Array<Record<string, unknown>>>, catalog?: () => Promise<{fingerprint: string}>},
 * journal: import('./common.mjs').JourneyJournal, runState?: {addMarker: (marker: string) => unknown},
 * pickupCase: ReturnType<typeof import('./common.mjs').buildPickupCase>, voucher?: import('./common.mjs').VoucherSelection|null,
 * onOrderIdentified?: (orderId: string) => void}} options
 */
export async function createVerifiedPickup({
  actor,
  actorName,
  userId,
  db,
  journal,
  runState,
  pickupCase,
  voucher = null,
  onOrderIdentified = () => {},
}) {
  const baselineOrders = await db.ordersByMarkers([pickupCase.marker]);
  invariant(baselineOrders.length === 0, "SMOKE_MARKER_COLLISION");
  runState?.addMarker(pickupCase.marker);
  const response = await mutateOnce({
    journal,
    type: "create",
    recovery: {
      actor: actorName,
      marker: pickupCase.marker,
      userId,
      baselineOrderIds: baselineOrders.map(order => order.id),
      orderId: null,
      sourceStatuses: ["ABSENT"],
      targetStatus: "PENDING",
    },
    send: () => actor.api.request("/api/orders", {
      method: "POST",
      body: pickupCase.payload,
      mutation: true,
      timeoutMs: 30_000,
    }),
    reconcile: async (failedResponse) => {
      const matches = await db.ordersByMarkers([pickupCase.marker]);
      if (matches.length === 1 && matches[0].user_id === userId) {
        return { state: "APPLIED", data: { id: matches[0].id } };
      }
      if (matches.length === 0 && failedResponse) return "NOT_APPLIED";
      return "AMBIGUOUS";
    },
  });
  if (!response.ok) {
    await classifyCreatePrerequisite(response, db, pickupCase.catalogFingerprint);
    invariant(false, "SMOKE_ORDER_CREATE_REJECTED");
  }
  invariant(response.status === 201 || response.recovered === true, "SMOKE_ORDER_CREATE_STATUS_INVALID");
  const orderId = response.body?.data?.id;
  invariant(typeof orderId === "string" && orderId.length > 0, "SMOKE_ORDER_ID_MISSING");
  onOrderIdentified(orderId);

  const detailResponse = await actor.api.request(`/api/orders/${orderId}`);
  invariant(detailResponse.status === 200, "SMOKE_ORDER_READ_FAILED");
  const detail = detailResponse.body?.data;
  const stored = await db.order(orderId);
  invariant(detail?.id === orderId && stored?.id === orderId, "SMOKE_ORDER_READ_ID_MISMATCH");
  invariant(detail.status === "PENDING" && stored.status === "PENDING", "SMOKE_ORDER_NOT_PENDING");
  const expectedOrderType = pickupCase.payload.order_type ?? "PICKUP";
  invariant(detail.order_type === expectedOrderType && stored.order_type === expectedOrderType, "SMOKE_ORDER_TYPE_MISMATCH");
  invariant(stored.user_id === userId && stored.note === pickupCase.marker, "SMOKE_ORDER_OWNERSHIP_OR_MARKER_MISMATCH");
  invariant(detail.items?.length === pickupCase.payload.items.length
    && stored.items?.length === pickupCase.payload.items.length, "SMOKE_ORDER_ITEM_COUNT_MISMATCH");
  const expectedNotes = pickupCase.payload.items.map(item => item.note);
  invariant(notesMatch(detail.items.map(item => item.note), expectedNotes)
    && notesMatch(stored.items.map(item => item.note), expectedNotes), "SMOKE_ORDER_ITEM_MARKER_MISMATCH");
  if (response.recovered !== true) assertTotals(response.body?.data, pickupCase.expected, "SMOKE_CREATE_TOTAL");
  assertTotals(detail, pickupCase.expected, "SMOKE_READ_TOTAL");
  assertTotals(stored, pickupCase.expected, "SMOKE_DATABASE_TOTAL");

  const discountLinks = stored.discountVouchers ?? [];
  if (voucher) {
    invariant(pickupCase.expected.total_voucher_discount_vnd + pickupCase.expected.item_discount_vnd
      + pickupCase.expected.freeship_discount_vnd > 0,
      "SMOKE_DISCOUNT_EXPECTED_BENEFIT_MISSING");
    invariant(response.body?.data?.skipped_vouchers?.includes(voucher.qr_token) !== true,
      "SMOKE_DISCOUNT_SKIPPED");
    const linked = voucher.voucher_type === "DISCOUNT" ? discountLinks.some(link => link.voucher_id === voucher.id)
      : voucher.voucher_type === "FREESHIP" ? stored.freeship_voucher_id === voucher.id
      : stored.items.some(item => item.product_voucher_id === voucher.id || item.item_voucher_id === voucher.id
        || item.addonVouchers?.some(link => link.voucher_id === voucher.id));
    invariant(linked, "SMOKE_DISCOUNT_LINK_MISSING");
    const [storedVoucher] = await db.vouchers([voucher.id]);
    invariant(storedVoucher?.status === "RESERVED", "SMOKE_DISCOUNT_NOT_RESERVED");
    const activeUses = await db.activeUses([voucher.id]);
    invariant(activeUses.length === 1 && activeUses[0].id === orderId, "SMOKE_DISCOUNT_RESERVATION_SCOPE_INVALID");
  } else {
    invariant(discountLinks.length === 0, "SMOKE_PLAIN_ORDER_HAS_DISCOUNT");
  }
  return { orderId, marker: pickupCase.marker, expected: pickupCase.expected };
}

/** Cancel one exact smoke order and prove its voucher is reusable. */
export async function cancelVerifiedPickup({ actor, actorName, userId, db, journal, marker, orderId, voucher = null }) {
  const before = await db.order(orderId);
  invariant(before?.user_id === userId && before.note === marker && before.status === "PENDING",
    "SMOKE_CANCEL_SOURCE_INVALID");
  const response = await mutateOnce({
    journal,
    type: "cancel",
    recovery: {
      actor: actorName,
      marker,
      userId,
      baselineOrderIds: [orderId],
      baselineVoucherIds: voucher ? [voucher.id] : [],
      orderId,
      sourceStatuses: ["PENDING"],
      targetStatus: "CANCELLED",
    },
    send: () => actor.api.request(`/api/orders/${orderId}`, {
      method: "PATCH",
      body: { status: "CANCELLED" },
      mutation: true,
      timeoutMs: 30_000,
    }),
    reconcile: async (failedResponse) => {
      const stored = await db.order(orderId);
      if (stored?.status === "CANCELLED") return "APPLIED";
      if (stored?.status === "PENDING" && failedResponse) return "NOT_APPLIED";
      return "AMBIGUOUS";
    },
  });
  invariant(response.ok || response.recovered === true, "SMOKE_CANCEL_REJECTED");
  const stored = await db.order(orderId);
  invariant(stored?.status === "CANCELLED", "SMOKE_ORDER_NOT_CANCELLED");
  if (voucher) {
    const [storedVoucher] = await db.vouchers([voucher.id]);
    invariant(storedVoucher?.status === "ACTIVE", "SMOKE_DISCOUNT_NOT_RESTORED");
    invariant((await db.activeUses([voucher.id])).length === 0, "SMOKE_DISCOUNT_RESERVATION_REMAINED");
  }
}
