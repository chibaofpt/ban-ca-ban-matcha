# Bundle Voucher Rules

Apply these allocation rules with the canonical application order and money terms in
[the voucher entrypoint](../SKILL.md#canonical-application-order-and-totals).

## BUNDLE Voucher Details

- A BUNDLE voucher package owns one immutable BUNDLE rule directly. There is no Promotion layer.
  Deactivation stops new issuance; it does not invalidate vouchers already issued.
- Packages are effective immediately. `ends_at` is optional; there is no `starts_at`. Admin picks
  the final usable Vietnam calendar date; store it as the exclusive next-day 00:00 at UTC+7 and
  require `now < ends_at`.
- Acquisition modes are `POINTS_EXCHANGE`, `FREE_CLAIM`, and `AUTO_GRANT`. Free/auto modes cost
  zero points. `voucher_grants` makes free issuance idempotent under concurrent requests.
- Registration attempts AUTO_GRANT immediately. Wallet and authenticated order entry points retry
  lazily, covering accounts created while a campaign is active. Anonymous orders never receive or
  use BUNDLE vouchers; ghost users are eligible after their user row exists.
- Customer acquisition lists expose the live global `remaining_quantity`, exclude `AUTO_GRANT`,
  and use one shared FREE_CLAIM / POINTS_EXCHANGE catalog in the wallet and cart. A points exchange
  always requires confirmation; BUNDLE vouchers use an in-cart CTA instead of offline QR redemption.
- Accept multiple distinct BUNDLE voucher instances per order through `bundle_applications`. Each
  application owns explicit qualifier and reward allocations keyed by stable `client_line_id`.
  A token appears once, and product/addon unit quantities cannot overlap across applications.
  The server re-resolves products, configuration, addons, and prices before evaluating them.
- Resolve voucher ownership through an explicit `voucher_owner_id`, never by assuming the order
  host owns every line. This boundary is required for future group orders.
- Product scopes may target drinks or `extras`. Extras have null configuration for all reward modes.
- `SAME_CONFIG` means the qualifier and reward use the same menu item. Qualifiers may use any
  configured allowed size; reward baseline is the current server price of the smallest selected
  qualifier size/configuration. `FIXED_CONFIG` has exactly one configured reward product;
  `ALLOWED_SCOPE` has one or more selectable reward products. Both use the current server price of
  the stored default powder/Base Liquid snapshot at the actual reward size as baseline.
- Customer powder/Base Liquid changes remain allowed. Charge only `max(actual reward drink price -
  baseline, 0)`; a cheaper configuration has zero payable difference and creates no surplus.
  Product BUNDLE benefits never cover addons.
- A unit participating as any BUNDLE qualifier or reward cannot carry a personal PRODUCT,
  PRODUCT_DISCOUNT, ITEM, or ADDON voucher. Link/token presence blocks overlap even at zero
  benefit; multiple addon vouchers on one cup block one unit, not multiple cups. The policy is
  symmetric: remove the existing selection explicitly before using another benefit on that unit.
  Separate units of the same menu item outside BUNDLE may use personal vouchers. Split cart
  quantities when needed; voucher-bearing order lines remain quantity one. Paid addons remain
  allowed, while Extra Matcha is never a BUNDLE reward. Order-level DISCOUNT/FREESHIP are unchanged.
- Addon rewards may scale per bundle, once per order, or per qualifying item. Pool allocations
  across eligible items, reject Extra Matcha, and never overlap PRODUCT/ADDON voucher benefits.
- Reward units never count again as qualifiers, including when the same menu item appears in both
  roles. Qualifier and reward allocations may overlap only up to distinct paid units.
- `min_order_vnd` is evaluated from paid merchandise: exclude units covered by ITEM/PRODUCT/BUNDLE
  and exclude voucher-covered addon units and shipping. Retain the remaining paid value of
  partially discounted items outside BUNDLE and paid addons exactly once. Eligibility capacity
  and paid subtotal are separate: a unit blocked from qualifying does not automatically lose
  its paid contribution. A drink carrying an ADDON voucher cannot qualify or receive BUNDLE.
- Qualifier and reward products are grouped by menu item: one default powder, one default Base
  Liquid, and multiple allowed sizes. Qualifier eligibility matches menu item + allowed size only.
  One BUNDLE package has exactly one reward kind: PRODUCT or ADDON.
- Admin new BUNDLE creation uses shared allowed sizes and one default Base Liquid per qualifier
  group, with a separate shared configuration for reward products when present. Each Fusion keeps
  its own default powder; Latte keeps its fixed powder; extras have no drink configuration and
  are excluded from shared intersections. Shared controls serialize into existing per-product
  immutable scopes. Require explicit nonempty drink sizes and compatible defaults; never silently
  replace choices when the selected products have no common configuration. Existing heterogeneous
  scopes remain readable and unchanged. Customers may still choose allowed milk/powder swaps;
  shared size scope is not a requirement that every cup have the same size. Prices are never
  entered or stored as BUNDLE reference credit.
- The application limit applies per voucher instance within an order; distinct instances may use
  separate units. Free/auto creation uses zero points and one grant per customer/package; admin
  locks max_per_user to one for those modes, preserving existing issuance idempotency. The actual
  expiry is the earlier of ends_at and acquisition time plus expires_after_days when provided.
- Reserve at order creation, redeem both the voucher and its order application on payment
  confirmation/completion, and restore/cancel both sides on cancellation.
  Direct offline QR redemption of BUNDLE vouchers is forbidden.
