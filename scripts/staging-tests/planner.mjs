import { combineStatus } from "./core.mjs";

const requiredTypes = {
  smoke: ["DISCOUNT"],
  full: ["DISCOUNT", "PRODUCT", "PRODUCT_DISCOUNT", "FREESHIP", "ADDON", "BUNDLE", "ITEM"],
};

const effectiveActive = (voucher, now) => voucher.status === "ACTIVE"
  && (!voucher.expires_at || new Date(voucher.expires_at) > now)
  && (!voucher.package?.ends_at || new Date(voucher.package.ends_at) > now);

function packageAvailable(pkg, state, now) {
  const perUser = state.vouchers.filter(voucher => voucher.package_id === pkg.id).length;
  return pkg.is_active && pkg.acquisition_mode === "POINTS_EXCHANGE"
    && (!pkg.ends_at || new Date(pkg.ends_at) > now)
    && (pkg.quantity == null || pkg._count.vouchers < pkg.quantity)
    && perUser < pkg.max_per_user;
}

function chooseVoucher(type, catalog, state, now) {
  const existing = state.vouchers.find(voucher => voucher.voucher_type === type && effectiveActive(voucher, now));
  if (existing) return { type, source: "existing", voucher: existing, points: 0 };
  const packages = catalog.packages.filter(pkg => pkg.voucher_type === type && packageAvailable(pkg, state, now))
    .sort((a, b) => a.points_cost - b.points_cost || String(a.ends_at ?? "z").localeCompare(String(b.ends_at ?? "z")));
  return packages[0] ? { type, source: "exchange", package: packages[0], points: packages[0].points_cost } : null;
}

function actorCoverage(profile, catalog, state, now) {
  const selected = requiredTypes[profile].map(type => chooseVoucher(type, catalog, state, now));
  const missing = requiredTypes[profile].filter((type, index) => !selected[index]);
  const acquisitions = selected.filter(choice => choice?.source === "exchange");
  const pointsNeeded = acquisitions.reduce((sum, choice) => sum + choice.points, 0);
  return { selected: selected.filter(Boolean), missing, acquisitions, pointsNeeded,
    budgetOk: (state.user?.points_balance ?? 0) >= pointsNeeded };
}

/** Build a data-driven execution plan without mutating staging. */
export function buildExecutionPlan({ profile, catalog, actors, now = new Date() }) {
  const cases = [];
  const gaps = [];
  const blockers = [];
  const customerKey = profile === "smoke" ? "customerA" : "customerB";
  const state = actors[customerKey];
  const actor = state?.user;
  const block = code => { gaps.push(code); blockers.push(code); };
  if (catalog.storeStatus?.is_open === false) block("STORE_CLOSED");
  if (!actor || actor.role !== "CUSTOMER") block("CUSTOMER_ROLE_OR_ACCOUNT_MISSING");
  if ((state?.sessions ?? []).filter(session => new Date(session.expires_at) > now).length >= 5) block("SESSION_LIMIT_WOULD_EVICT_EXISTING");
  if ((state?.orders ?? []).length > 0) block("PREEXISTING_NONTERMINAL_ORDER");
  if (profile === "smoke" && (state?.recentOrderCount ?? 0) + 3 > 5) block("CUSTOMER_ORDER_RATE_CAPACITY_INSUFFICIENT");
  const activeAuto = catalog.packages.filter(pkg => pkg.is_active && pkg.acquisition_mode === "AUTO_GRANT"
    && (!pkg.ends_at || new Date(pkg.ends_at) > now));
  const grantPackageIds = new Set((state?.grants ?? []).map(grant => grant.package_id));
  if (activeAuto.some(pkg => !grantPackageIds.has(pkg.id))) block("AUTO_GRANT_PENDING");
  if ((state?.vouchers ?? []).some(voucher => voucher.status === "ACTIVE" && voucher.expires_at && new Date(voucher.expires_at) <= now)) block("LAZY_EXPIRY_PENDING");
  const coverage = state ? actorCoverage(profile, catalog, state, now) : { selected: [], missing: requiredTypes[profile], acquisitions: [], pointsNeeded: 0, budgetOk: false };
  for (const type of coverage.missing) gaps.push(`VOUCHER_TYPE_MISSING_${type}`);
  if (!coverage.budgetOk) gaps.push("POINTS_BUDGET_INSUFFICIENT");
  const availableItems = catalog.items.filter(item => item.is_available);
  if (!availableItems.some(item => item.category === "latte")) block("MENU_LATTE_MISSING");
  const baseRunnable = blockers.length === 0;
  if (profile === "full") {
    if (!availableItems.some(item => item.category === "fusion")) gaps.push("MENU_FUSION_MISSING");
    if (!availableItems.some(item => item.category === "extras")) gaps.push("MENU_EXTRAS_MISSING");
    if (!(state?.addresses ?? []).some(address => address.distance_km != null)) gaps.push("DELIVERY_ADDRESS_MISSING");
    for (const role of ["admin", "staff"]) {
      if (!actors[role]?.user || actors[role].credentialReady === false) gaps.push(`CREDENTIAL_OR_ROLE_MISSING_${role.toUpperCase()}`);
    }
  }
  cases.push({ id: "plain-pickup-cancel", runnable: baseRunnable });
  if (profile === "smoke") cases.push({ id: "discount-cancel-reuse-cancel", runnable: baseRunnable && coverage.selected.some(choice => choice.type === "DISCOUNT") && coverage.budgetOk });
  if (profile === "full") {
    const hasMenuMatrix = availableItems.some(item => item.category === "fusion") && availableItems.some(item => item.category === "extras");
    const voucherComplete = coverage.missing.length === 0 && coverage.budgetOk;
    const adminReady = Boolean(actors.admin?.user) && actors.admin.credentialReady !== false;
    const staffReady = Boolean(actors.staff?.user) && actors.staff.credentialReady !== false;
    const caseRules = {
      "menu-price-matrix": baseRunnable && hasMenuMatrix,
      "price-changed": baseRunnable,
      "voucher-matrix": baseRunnable && voucherComplete,
      "online-lifecycle": baseRunnable && adminReady && staffReady,
      "cancel-reuse": baseRunnable && coverage.selected.length > 0 && coverage.budgetOk,
      "counter-cash": baseRunnable && adminReady && staffReady,
      "counter-transfer": baseRunnable && adminReady && staffReady,
      authorization: baseRunnable && adminReady && staffReady,
      "points-reversal": baseRunnable && adminReady && staffReady && coverage.selected.length > 0,
      concurrency: baseRunnable && coverage.selected.length > 0,
      "payment-expiry": baseRunnable && adminReady,
    };
    for (const [id, runnable] of Object.entries(caseRules)) cases.push({ id, runnable });
  }
  return {
    profile, status: combineStatus(gaps.length ? ["PARTIAL"] : ["PASS"]), gaps, blockers, cases, internal: { customerKey, coverage },
    summary: { pointsNeeded: coverage.pointsNeeded, pointsAvailable: actor?.points_balance ?? 0,
      acquisitions: coverage.acquisitions.map(choice => ({ type: choice.type, points: choice.points, packageName: choice.package.name })),
      voucherTypes: coverage.selected.map(choice => choice.type),
      dataReadyCases: cases.filter(item => item.runnable).map(item => item.id),
      runnableCases: cases.filter(item => item.runnable).map(item => item.id) },
  };
}
