import type {
  BundleCartDraftCommit,
  CartAddonVoucher,
  CartItem,
  CartLineConfiguration,
  CartLineVoucher,
  CartTransitionState,
} from "@/src/lib/types/cart";
export type CartMutationCode =
  | "ITEM_NOT_FOUND"
  | "INVALID_QUANTITY"
  | "VOUCHER_ALREADY_USED"
  | "VOUCHER_CONFLICT"
  | "BUNDLE_ALLOCATED"
  | "BUNDLE_STALE"
  | "ADDON_NOT_SELECTED"
  | "ADDON_GROUP_FULL";
export type CartMutationResult<T = undefined> =
  | { ok: true; value: T; warning?: { code: "PERSISTENCE_WRITE_FAILED"; message: string } }
  | { ok: false; code: CartMutationCode; message: string };
export type CartCommand =
  | { type: "ADD_LINE"; line: Omit<CartItem, "cartId"> & { cartId?: undefined } }
  | {
      type: "ADD_LINE_WITH_ADDON";
      line: Omit<CartItem, "cartId"> & { cartId?: undefined };
      voucherToken: string;
      addonOptionId: string;
      groupOptionIds: string[];
      maxSelect: number;
      isExtraMatcha: boolean;
      replaceOptionId?: string;
    }
  | { type: "UPDATE_CONFIGURATION"; cartId: string; configuration: CartLineConfiguration }
  | { type: "UPDATE_LINE"; cartId: string; line: Omit<CartItem, "cartId"> }
  | { type: "CHANGE_QUANTITY"; cartId: string; quantity: number }
  | { type: "REMOVE_LINE"; cartId: string }
  | { type: "APPLY_LINE_VOUCHER"; cartId: string; voucher: CartLineVoucher }
  | { type: "REMOVE_LINE_VOUCHER"; cartId: string }
  | {
      type: "APPLY_ADDON_VOUCHER"; cartId: string; voucherToken: string; addonOptionId: string;
      groupOptionIds: string[]; maxSelect: number; isExtraMatcha: boolean; replaceOptionId?: string;
    }
  | { type: "REMOVE_ADDON_VOUCHER"; cartId: string; voucherToken: string }
  | { type: "SET_ORDER_VOUCHERS"; tokens: string[] }
  | { type: "COMMIT_BUNDLE"; draft: BundleCartDraftCommit }
  | { type: "REMOVE_BUNDLE"; voucherToken: string }
  | { type: "REMOVE_VOUCHER_EFFECTS"; voucherToken: string }
  | { type: "DETACH_VOUCHER_OWNER" }
  | { type: "RECONCILE_BUNDLE_OWNER"; ownerKey: string | null }
  | { type: "CLEAR_CART" };
export interface CartTransition<T = undefined> {
  state: CartTransitionState;
  result: CartMutationResult<T>;
}
const success = <T>(state: CartTransitionState, value: T): CartTransition<T> => ({
  state,
  result: { ok: true, value },
});
const failure = (state: CartTransitionState, code: CartMutationCode, message: string): CartTransition => ({
  state,
  result: { ok: false, code, message },
});

const allocatedQuantityFor = (state: CartTransitionState, cartId: string): number =>
  state.bundleApplications.reduce((total, application) => total +
    [...application.qualifier_allocations, ...application.reward_allocations]
      .filter((allocation) => allocation.client_line_id === cartId && allocation.addon_option_id === undefined)
      .reduce((sum, allocation) => sum + allocation.quantity, 0), 0);

function releaseToken(items: CartItem[], token: string): CartItem[] {
  return items.map((item) => ({
    ...item,
    ...(item.lineVoucher?.token === token ? { lineVoucher: undefined } : {}),
    addonVouchers: item.addonVouchers.filter((voucher) => voucher.token !== token),
  }));
}

function removeBundleEffects(items: CartItem[], application: CartTransitionState["bundleApplications"][number]): CartItem[] {
  const lineIds = new Set(application.created_reward_effects.flatMap((effect) =>
    effect.kind === "LINE" ? [effect.client_line_id] : [],
  ));
  const addonIds = new Map<string, Set<string>>();
  for (const effect of application.created_reward_effects) {
    if (effect.kind !== "ADDON") continue;
    const ids = addonIds.get(effect.client_line_id) ?? new Set<string>();
    ids.add(effect.addon_option_id);
    addonIds.set(effect.client_line_id, ids);
  }
  return items.flatMap((item) => {
    if (lineIds.has(item.cartId)) return [];
    const removed = addonIds.get(item.cartId);
    if (!removed || item.configuration.size === null) return [item];
    return [{
      ...item,
      configuration: {
        ...item.configuration,
        addonOptionIds: item.configuration.addonOptionIds.filter((id) => !removed.has(id)),
      },
      addonVouchers: item.addonVouchers.filter((voucher) => !removed.has(voucher.addonOptionId)),
    }];
  });
}

/** Apply one cart command atomically and return the original state reference on failure. */
export function applyCartCommand<T = undefined>(
  state: CartTransitionState,
  command: CartCommand,
  createCartId: () => string = () => crypto.randomUUID(),
): CartTransition<T> {
  if (command.type === "ADD_LINE_WITH_ADDON") {
    const line = command.line;
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      return failure(state, "INVALID_QUANTITY", "Số lượng không hợp lệ") as CartTransition<T>;
    }
    if (line.configuration.size === null || command.isExtraMatcha) {
      return failure(state, "ADDON_NOT_SELECTED", "Topping không hợp lệ cho voucher") as CartTransition<T>;
    }
    const selected = line.configuration.addonOptionIds;
    const selectedInGroup = selected.filter((id) => command.groupOptionIds.includes(id));
    if (!selected.includes(command.addonOptionId) && selectedInGroup.length >= command.maxSelect &&
      (!command.replaceOptionId || !selectedInGroup.includes(command.replaceOptionId))) {
      return failure(state, "ADDON_GROUP_FULL", "Nhóm topping đã đủ lựa chọn") as CartTransition<T>;
    }
    const released = releaseToken(state.items, command.voucherToken);
    const configured: Omit<CartItem, "cartId"> = {
      ...line,
      quantity: 1,
      configuration: {
        ...line.configuration,
        addonOptionIds: line.configuration.addonOptionIds
          .filter((id) => id !== command.replaceOptionId && id !== command.addonOptionId)
          .concat(command.addonOptionId),
      },
      addonVouchers: [
        ...line.addonVouchers.filter((entry) => entry.addonOptionId !== command.replaceOptionId && entry.addonOptionId !== command.addonOptionId && entry.token !== command.voucherToken),
        { token: command.voucherToken, addonOptionId: command.addonOptionId },
      ],
    };
    const cartId = createCartId();
    const additions: CartItem[] = [{ ...configured, cartId }];
    if (line.quantity > 1) additions.push({ ...line, cartId: createCartId(), quantity: line.quantity - 1 });
    return success({ ...state, items: [...released, ...additions] }, { cartId } as T);
  }
  if (command.type === "ADD_LINE") {
    if (!Number.isInteger(command.line.quantity) || command.line.quantity < 1) {
      return failure(state, "INVALID_QUANTITY", "Số lượng không hợp lệ") as CartTransition<T>;
    }
    if ((command.line.lineVoucher || command.line.addonVouchers.length > 0) && command.line.quantity > 1) {
      return failure(state, "VOUCHER_CONFLICT", "Món có voucher phải giữ số lượng một") as CartTransition<T>;
    }
    const released = [
      ...(command.line.lineVoucher ? [command.line.lineVoucher.token] : []),
      ...command.line.addonVouchers.map((voucher) => voucher.token),
    ].reduce((items, token) => releaseToken(items, token), state.items);
    const cartId = createCartId();
    return success({ ...state, items: [...released, { ...command.line, cartId }] }, { cartId } as T);
  }
  if (command.type === "CLEAR_CART") {
    return success({ items: [], selectedOrderVoucherTokens: [], bundleApplications: [] }, undefined as T);
  }
  if (command.type === "SET_ORDER_VOUCHERS") {
    return success({ ...state, selectedOrderVoucherTokens: [...new Set(command.tokens)] }, undefined as T);
  }
  if (command.type === "DETACH_VOUCHER_OWNER") {
    const items = state.bundleApplications.reduce(removeBundleEffects, state.items).map((item) => ({
      ...item, lineVoucher: undefined, addonVouchers: [],
    }));
    return success({ items, selectedOrderVoucherTokens: [], bundleApplications: [] }, undefined as T);
  }
  if (command.type === "RECONCILE_BUNDLE_OWNER") {
    if (!command.ownerKey) {
      const items = state.bundleApplications.reduce(removeBundleEffects, state.items);
      return success({ ...state, items, bundleApplications: [] }, undefined as T);
    }
    const removed = state.bundleApplications.filter((application) => application.owner_key !== command.ownerKey);
    if (removed.length === 0) return success(state, undefined as T);
    const items = removed.reduce(removeBundleEffects, state.items);
    return success({ ...state, items, bundleApplications: state.bundleApplications.filter((application) => application.owner_key === command.ownerKey) }, undefined as T);
  }
  if (command.type === "COMMIT_BUNDLE") {
    const previous = state.bundleApplications.find((item) => item.voucher_qr_token === command.draft.application.voucher_qr_token);
    const baseItems = previous ? removeBundleEffects(state.items, previous) : state.items;
    return success({
      ...state,
      items: command.draft.items === state.items ? baseItems : command.draft.items,
      bundleApplications: [...state.bundleApplications.filter((item) => item.voucher_qr_token !== command.draft.application.voucher_qr_token), command.draft.application],
    }, undefined as T);
  }
  if (command.type === "REMOVE_BUNDLE") {
    const application = state.bundleApplications.find((item) => item.voucher_qr_token === command.voucherToken);
    if (!application) return failure(state, "BUNDLE_STALE", "Ưu đãi BUNDLE không còn trong giỏ") as CartTransition<T>;
    return success({ ...state, items: removeBundleEffects(state.items, application), bundleApplications: state.bundleApplications.filter((item) => item !== application) }, undefined as T);
  }
  if (command.type === "REMOVE_VOUCHER_EFFECTS") {
    const application = state.bundleApplications.find((item) => item.voucher_qr_token === command.voucherToken);
    const baseItems = application ? removeBundleEffects(state.items, application) : state.items;
    const items = baseItems.map((item) => ({
      ...item,
      ...(item.lineVoucher?.token === command.voucherToken ? { lineVoucher: undefined } : {}),
      addonVouchers: item.addonVouchers.filter((voucher) => voucher.token !== command.voucherToken),
    }));
    return success({
      items,
      selectedOrderVoucherTokens: state.selectedOrderVoucherTokens.filter((token) => token !== command.voucherToken),
      bundleApplications: state.bundleApplications.filter((item) => item.voucher_qr_token !== command.voucherToken),
    }, undefined as T);
  }

  const index = state.items.findIndex((item) => item.cartId === command.cartId);
  if (index < 0) return failure(state, "ITEM_NOT_FOUND", "Không tìm thấy món trong giỏ") as CartTransition<T>;
  const item = state.items[index]!;
  const allocatedQuantity = allocatedQuantityFor(state, command.cartId);
  const canTargetOutsideBundle = (command.type === "APPLY_LINE_VOUCHER" || command.type === "APPLY_ADDON_VOUCHER")
    && allocatedQuantity < item.quantity;
  if (allocatedQuantity > 0 && !canTargetOutsideBundle) {
    return failure(state, "BUNDLE_ALLOCATED", "Món đang thuộc ưu đãi BUNDLE") as CartTransition<T>;
  }
  const replace = (next: CartItem, source = state.items): CartTransition<T> => {
    const items = [...source];
    items[index] = next;
    return success({ ...state, items }, undefined as T);
  };

  if (command.type === "REMOVE_LINE") {
    return success({ ...state, items: state.items.filter((entry) => entry.cartId !== command.cartId) }, undefined as T);
  }
  if (command.type === "UPDATE_CONFIGURATION") return replace({ ...item, configuration: command.configuration });
  if (command.type === "UPDATE_LINE") {
    if (!Number.isInteger(command.line.quantity) || command.line.quantity < 1) {
      return failure(state, "INVALID_QUANTITY", "Số lượng không hợp lệ") as CartTransition<T>;
    }
    const hasVoucher = Boolean(command.line.lineVoucher || command.line.addonVouchers.length > 0);
    const selectedAddonIds = command.line.configuration.size === null ? [] : command.line.configuration.addonOptionIds;
    if (command.line.addonVouchers.some((voucher) => !selectedAddonIds.includes(voucher.addonOptionId))) {
      return failure(state, "ADDON_NOT_SELECTED", "Voucher topping phải gắn với topping đã chọn") as CartTransition<T>;
    }
    if (hasVoucher && command.line.quantity > 1) {
      return failure(state, "VOUCHER_CONFLICT", "Món có voucher phải giữ số lượng một") as CartTransition<T>;
    }
    const voucherTokens = [...(command.line.lineVoucher ? [command.line.lineVoucher.token] : []), ...command.line.addonVouchers.map((voucher) => voucher.token)];
    const released = voucherTokens.reduce((items, token) => releaseToken(items, token), state.items);
    const target = released[index]!;
    if (hasVoucher && item.quantity > 1 && command.line.quantity === 1) {
      const items = [...released];
      items[index] = { cartId: target.cartId, ...command.line };
      items.splice(index + 1, 0, {
        ...command.line,
        cartId: createCartId(),
        quantity: item.quantity - 1,
        lineVoucher: undefined,
        addonVouchers: [],
      });
      return success({ ...state, items }, undefined as T);
    }
    return replace({ cartId: target.cartId, ...command.line }, released);
  }
  if (command.type === "CHANGE_QUANTITY") {
    if (!Number.isInteger(command.quantity) || command.quantity < 1) return failure(state, "INVALID_QUANTITY", "Số lượng không hợp lệ") as CartTransition<T>;
    if ((item.lineVoucher || item.addonVouchers.length > 0) && command.quantity > 1) return failure(state, "VOUCHER_CONFLICT", "Món có voucher phải giữ số lượng một") as CartTransition<T>;
    return replace({ ...item, quantity: command.quantity });
  }
  if (command.type === "REMOVE_LINE_VOUCHER") return replace({ ...item, lineVoucher: undefined });
  if (command.type === "REMOVE_ADDON_VOUCHER") return replace({ ...item, addonVouchers: item.addonVouchers.filter((voucher) => voucher.token !== command.voucherToken) });
  if (command.type === "APPLY_LINE_VOUCHER") {
    const released = releaseToken(state.items, command.voucher.token);
    const target = released[index]!;
    if (target.quantity === 1) return replace({ ...target, lineVoucher: command.voucher }, released);
    const splitId = createCartId();
    const items = [...released];
    items[index] = { ...target, quantity: target.quantity - 1 };
    items.splice(index + 1, 0, { ...target, cartId: splitId, quantity: 1, lineVoucher: command.voucher });
    return success({ ...state, items }, undefined as T);
  }

  if (item.configuration.size === null || command.isExtraMatcha) return failure(state, "ADDON_NOT_SELECTED", "Topping không hợp lệ cho voucher") as CartTransition<T>;
  const selected = item.configuration.addonOptionIds;
  const selectedInGroup = selected.filter((id) => command.groupOptionIds.includes(id));
  const replaceOptionId = command.replaceOptionId;
  if (!selected.includes(command.addonOptionId) && selectedInGroup.length >= command.maxSelect &&
    (!replaceOptionId || !selectedInGroup.includes(replaceOptionId))) {
    return failure(state, "ADDON_GROUP_FULL", "Nhóm topping đã đủ lựa chọn") as CartTransition<T>;
  }
  const released = releaseToken(state.items, command.voucherToken);
  const target = released[index]!;
  const voucher: CartAddonVoucher = { token: command.voucherToken, addonOptionId: command.addonOptionId };
  const configured = target.configuration.size === null ? target.configuration : {
    ...target.configuration,
    addonOptionIds: target.configuration.addonOptionIds
      .filter((id) => id !== replaceOptionId && id !== command.addonOptionId)
      .concat(command.addonOptionId),
  };
  const next = { ...target, configuration: configured, addonVouchers: [...target.addonVouchers.filter((entry) => entry.addonOptionId !== replaceOptionId && entry.addonOptionId !== command.addonOptionId), voucher] };
  if (target.quantity === 1) return replace(next, released);
  const splitId = createCartId();
  const items = [...released];
  items[index] = { ...target, quantity: target.quantity - 1 };
  items.splice(index + 1, 0, { ...next, cartId: splitId, quantity: 1 });
  return success({ ...state, items }, undefined as T);
}
