# Bạn Cá Bán Matcha — Project Structure

> Read this file before creating or moving any file or directory.

---

## Folder Layout

```
app/                              # Next.js App Router — entry points only, zero logic
  (public)/
    page.tsx                      # → src/views/HomePage
    menu/
      page.tsx                    # → src/views/MenuPage
  (auth)/
    login/
      page.tsx                    # → src/views/LoginPage
    register/
      page.tsx                    # → src/views/RegisterPage
  (customer)/                     # Phase 3+ — CUSTOMER role required
    profile/page.tsx
    history/page.tsx              # → src/views/customer/HistoryPage
    orders/page.tsx
    orders/[id]/page.tsx
    points/page.tsx
    vouchers/page.tsx
  (admin-public)/
    admin/
      login/
        page.tsx                  # → src/views/admin/AdminLoginPage
  (admin-shell)/
    layout.tsx                    # Shared shell: top bar + bottom tab bar
    admin/                        # ADMIN only
      menu/
        layout.tsx                # MenuSubTabs wrapper (renders sub-tab bar)
        page.tsx                  # → src/views/admin/AdminMenuPage
        powders/page.tsx          # → src/views/admin/AdminPowderPage
        addons/page.tsx           # → src/views/admin/AdminAddonsPage
        milk-types/page.tsx       # → src/views/admin/AdminMilkTypesPage
        voucher-packages/page.tsx # → src/views/admin/AdminVoucherPackagesPage
      points-log/page.tsx         # → src/views/admin/AdminPointsLogPage
    staff/                        # STAFF or ADMIN
      orders/page.tsx             # → src/views/staff/StaffOrdersPage
      orders-list/page.tsx        # → src/views/staff/StaffOrdersListPage
      scan/page.tsx               # → src/views/staff/StaffScanPage
  api/                            # Route handlers — delegate business logic to lib/
    auth/
      check-phone/route.ts
      register/route.ts
      login/route.ts
      logout/route.ts
      me/route.ts
      refresh/route.ts
    menu/route.ts
    powders/route.ts              # Public — full powder catalogue
    orders/route.ts
    orders/[id]/route.ts
    delivery/
      autocomplete/route.ts        # Validated/rate-limited Goong proxy
      estimate/route.ts
      geocode/route.ts
      reverse-geocode/route.ts
    cron/cancel-expired-orders/route.ts
    cron/clean-sessions/route.ts
    cron/cleanup-menu-images/route.ts
    push/
      subscribe/route.ts
      unsubscribe/route.ts         # No production push test route
    profile/route.ts
    profile/points/route.ts
    profile/vouchers/route.ts
    profile/vouchers/exchange/route.ts
    profile/vouchers/refund/route.ts
    staff/orders/route.ts
    staff/orders/[id]/route.ts
    staff/scan/route.ts
    staff/scan-fallback/route.ts   # Privacy-safe manual QR short-code recovery
    staff/users/route.ts
    staff/users/[id]/vouchers/route.ts
    staff/users/[id]/vouchers/exchange/route.ts
    staff/vouchers/[id]/redeem/route.ts
    admin/points/add/route.ts
    admin/orders/[id]/status/route.ts
    admin/menu/route.ts
    admin/menu/[id]/route.ts
    admin/addon-groups/route.ts
    admin/addon-groups/[id]/route.ts
    admin/voucher-packages/route.ts
    admin/voucher-packages/[id]/route.ts
    admin/points-log/route.ts
    admin/points-log/[id]/reverse/route.ts
    admin/matcha-powders/route.ts
    admin/matcha-powders/[id]/route.ts
    admin/milk-types/route.ts
    admin/milk-types/[id]/route.ts
    admin/default-size-config/route.ts
    admin/fusion-powders/route.ts
    admin/store-schedule/route.ts     # GET + PUT weekly schedule
    admin/store-closure/route.ts      # POST close/open
    store-status/route.ts             # Public — current open/closed state
    admin/promotions/route.ts         # Phase 5 only

src/                              # Frontend — never import lib/ from here
  views/
    HomePage.tsx
    MenuPage.tsx
    LoginPage.tsx
    RegisterPage.tsx
    ProfilePage.tsx               # Phase 3
    CustomerQRDisplay.tsx         # Phase 4
    OrdersPage.tsx                # Phase 3
    PointsPage.tsx                # Phase 4
    VouchersPage.tsx              # Phase 4
    customer/
      AddressBookSheetContainer.tsx # Address query/mutation orchestration for profile sheet
      HistoryPage.tsx             # Orders + grouped points tabs
      ProfilePage.tsx
    admin/
      AdminLoginPage.tsx
      AdminMenuPage.tsx
      AdminVoucherPackagesPage.tsx
      AdminPointsLogPage.tsx
      AdminMilkTypesPage.tsx
      AdminAddonsPage.tsx
    staff/
      StaffOrdersPage.tsx
      StaffOrdersListPage.tsx
      StaffScanPage.tsx
  components/
    common/
      Button.tsx
      Badge.tsx
      Modal.tsx
      Drawer.tsx
    home/
      Hero.tsx
      IntroSection.tsx
      FeatureCard.tsx
    menu/
      MenuCard.tsx
      MenuPanels.tsx              # Pure latte/fusion/seasonal panel rendering
      CartQuantityButton.tsx      # Reusable add-to-cart / inline quantity stepper
      ExistingCartItemSheet.tsx   # Bottom sheet for items already in cart (per-variant stepper)
      ProductModal.tsx
      CartButton.tsx
      CartDrawer.tsx
      TabBar.tsx
    auth/
      PhoneInput.tsx
      PasswordInput.tsx
    customer/
      AddressBookSheet.tsx        # Address list + add/edit bottom-sheet layers
      OrderHistoryTab.tsx
      OrderHistoryCard.tsx
      OrderHistoryItems.tsx
      PointsHistoryTab.tsx
      ProfileQRSheet.tsx          # Customer loyalty QR bottom sheet
    shared/
      VoucherModalSections.tsx    # Voucher tabs + redeemed/expired history section
      PaymentQrPanel.tsx          # Shared VietQR image, amount, transfer reference + copy action
      PaymentMethodBadge.tsx      # CASH/BANK_TRANSFER audit badge for order lists
    admin/
      AdminMenuPage.tsx
      MenuItemCard.tsx
      MenuItemModal.tsx
      MenuImageSeoField.tsx       # Optional SEO filename input; no DB field
      MenuSubTabs.tsx             # Horizontal sub-tab bar for /admin/menu/*
      VoucherPackageForm.tsx
      PointsLogTable.tsx
      PowderForm.tsx
      MilkTypeForm.tsx
      MilkTypeCard.tsx
      MilkTypeModal.tsx
      AddonGroupForm.tsx
      addonGroupFormModel.ts      # Addon form types + DTO-to-form defaults
      AddonGroupCard.tsx
      AddonGroupModal.tsx
      SizeConfigForm.tsx
      StoreSettingsModal.tsx          # Admin modal: weekly schedule + temporary closure
    staff/
      StaffMenuCard.tsx
      StaffCartDrawer.tsx
      PaymentMethodSelector.tsx   # CASH default + BANK_TRANSFER checkout selector
      CounterTransferPaymentModal.tsx # Locked QR confirmation/cancellation dialog
      CounterTransferOrderAction.tsx # Pending-list QR action + modal ownership
      StaffOrderForm.tsx
      AddonModal.tsx
      QRScannerModal.tsx
      OrderCard.tsx
  services/
    menuService.ts                # GET /api/menu
    powderService.ts              # GET /api/powders
    orderService.ts               # Phase 3
    authService.ts
    profileService.ts             # Phase 3
    pointsService.ts              # GET /api/profile/points
    voucherService.ts             # Phase 4
    adminMenuService.ts
    adminPowderService.ts         # CRUD /api/admin/matcha-powders
    adminMilkTypeService.ts       # CRUD /api/admin/milk-types
    adminAddonService.ts          # CRUD /api/admin/addon-groups
    adminSizeConfigService.ts     # GET/PUT /api/admin/default-size-config
    adminVoucherService.ts
    adminStoreService.ts          # GET/PUT schedule, POST closure toggle
    storeStatusService.ts         # GET /api/store-status (public)
    staffOrderService.ts
  __tests__/                      # Vitest unit & integration tests (Front-end + Backend Logic)
    services/
      staffOrderService.test.ts
    utils/
      pricing.test.ts
    components/
      staff/StaffOrderForm.test.tsx
scratch/                          # Ignored by Git. Scratchpad for quick server scripts & local automation
  test-order.ts
    adminPointsService.ts
    adminOrderService.ts
    staffOrderService.ts
    staffOrdersListService.ts
    staffScanService.ts
  lib/
    api/
      client.ts                   # Single Axios instance — always import from here
    store/
      cartStore.ts                # Zustand cart — v3 migration retains items but clears voucher IDs/credits
      powderStore.ts              # Zustand — powder catalogue cached from /api/powders
      storeStore.ts               # Zustand — store open/closed status (hydrated on HomePage, read in CartDrawer)
    observability.ts              # Browser Sentry adapter, including enum-only map diagnostics
    sentryPrivacy.ts              # Deep browser event/breadcrumb privacy scrubber
    map/
      mapRenderer.ts              # Abortable MapLibre renderer; 30s hard timeout and typed diagnostics
    hooks/
      useCounterTransferPayment.ts # Counter payment recovery and status orchestration
      useScrollProgress.ts
      useBodyScrollLock.ts
      useMapRendererLifecycle.ts  # Strict Mode-safe map ownership, 12s degraded state, queued flyTo
      useWarmMapPicker.ts          # Keeps a hidden map renderer alive for 45s before teardown
    types/
      api.ts                      # ApiResponse<T>, ApiError
      menu.ts
      cart.ts
      order.ts                    # Phase 3
      points.ts                   # Grouped points history DTO
      user.ts
      powder.ts                   # Powder, PowderSizeConfig, MilkType types
    utils/
      addressBookSheet.ts         # Pure list/form state transitions
      counterTransferOrder.ts     # Legacy-safe method fallback + modal snapshot mapping
    validations/
      address.ts                  # Client address form schema
  utils/
    formatPrice.ts                # formatPrice(vnd: number) → "🐟 {vnd/1000} cá"
    pricing.ts                    # Pure pricing functions — NO imports from lib/ or services
                                  # exports: resolveGram(), calcLattePrice(), calcFusionPrice(), ceilTo1000()
                                  # Used by frontend (real-time estimates) and lib/pricing.ts (order time)
    deriveTags.ts
    buildZaloMessage.ts
  constants/
    orderOptions.ts               # SWEETNESS_OPTIONS, ICE_OPTIONS, COLDWHISK_OPTION
                                  # Hardcoded — not fetched from API

public/
  data/
    menu.json                     # Static — replaced by /api/menu in Phase 2
  vendor/maplibre/                # Generated worker + shared module; ignored and synced before dev/build

scripts/
  sync-maplibre-assets.mjs        # Copies version-matched MapLibre worker assets into public/vendor

lib/                              # Backend only — server-side, NEVER import in src/
  prisma.ts
  auth.ts                         # signJwt, verifyJwt, getSession
  cronAuth.ts                     # Timing-safe, fail-closed CRON_SECRET verification
  cleanExpiredSessions.ts         # Bounded, idempotent expired-session cleanup worker
  middlewareSession.ts            # CSP nonce + session/JWT rotation decisions for middleware
  sms.ts
  storage.ts                      # Supabase Storage helpers — bucket: menu-images
  menuImageCleanup.ts             # Finds/deletes unreferenced images after grace period
  cancelExpiredOrders.ts          # Bounded, idempotent auto-cancel worker
  orderLimits.ts                  # 20,000,000 VND server-calculated order ceiling
  staffOrderPayment.ts            # Isolated counter payment preparation + voucher claim rules
  staffOrderTransition.ts         # Pure staff/admin order transition validation
  customerOrderCreation.ts        # Customer order validation + creation orchestration
  customerOrderDelivery.ts        # Authoritative saved/unsaved delivery resolution
  customerOrderDiscounts.ts       # Order-level voucher resolution and totals
  customerOrderItemVouchers.ts    # Per-item voucher resolution and reservation inputs
  customerOrderWrite.ts           # Transactional customer order persistence
  customerOrderHistory.ts         # Customer order list projection and pagination
  orderPublicDto.ts               # Removes user/voucher database identifiers from nested orders
  publicIdentifiers.ts            # qr_token-first lookup + one-release legacy UUID input bridge
  rateLimit.ts                    # Redis fixed-window enforcement + HMAC identifiers
  clientIp.ts                     # Bounded trusted Vercel/proxy client-IP parsing
  rateLimitConfig.ts              # Central registry of every rate-limit rule
  securityHeaders.ts              # Nonce CSP modes, static headers, route-scoped browser permissions
  observability.ts                # Server-side Sentry adapter and cron monitor
  sentryPrivacy.ts                # Server event privacy scrubber
  voucherPublicDto.ts             # Voucher API/UI boundary containing qr_token, never voucher id
  adminMenuDto.ts                 # Shared Prisma include + admin menu response mapper
  adminMenuRequest.ts             # JSON/multipart admin menu update parser
  adminMenuUpdate.ts              # Menu update image/category/powder validation helpers
  pricing.ts                      # Thin wrapper: fetches DB data → calls src/utils/pricing.ts
                                  # exports: resolveOrderItemPrice(), buildPricingContext()
                                  # Zero pricing logic of its own
  pointsHistory.ts                # Groups immutable points_log rows before pagination
  validations/
    auth.ts
    menu.ts
    order.ts
    delivery.ts                   # Bounded delivery proxy coordinates and text inputs
    voucher.ts
    points.ts
    powder.ts                     # Zod schemas for matcha_powder, milk_type, default_size_config
    storeSchedule.ts              # Zod schemas for store schedule + closure toggle

middleware.ts
instrumentation.ts                # Next.js server/edge Sentry bootstrap
instrumentation-client.ts         # Browser Sentry bootstrap
sentry.server.config.ts
sentry.edge.config.ts
prisma/schema.prisma
prisma/migrations/20260804000000_harden_supabase_data_plane/
                                  # RLS/ACL hardening; rollback only with a compensating migration
.env.local
.env.local.example
.agents/skills/nontech-mode/SKILL.md       # Guardrails for co-founder UI/report edits
.agents/skills/nontech-push-code/SKILL.md  # QA/push workflow for the isolated nontech branch
NONTECH_CHANGELOG.md                       # Audit log for nontech-mode changes
```

The delivery map uses `maplibre-gl` as the primary renderer and injects the public Goong maptiles
key only for Goong HTTPS tile requests. Autocomplete, forward/reverse geocoding, and distance
estimates stay behind authenticated `/api/delivery/*` proxies. If MapLibre or the tile style cannot
load, the address search/selection flow remains available without the map. The removed
`app/api/push/test/route.ts` is intentionally absent from the production route tree.

---

## Layer Rules

| Layer | Rule |
|---|---|
| `app/**/page.tsx` | Entry only — import view component, export metadata, no logic |
| `src/views/` | Composition — import components + services + hooks. No direct fetch calls. |
| `src/components/` | UI only — receive props, render. No fetching, no importing services/lib. |
| `src/services/` | Only layer that knows API URLs. Use `apiClient` from `src/lib/api/client.ts`. |
| `src/utils/pricing.ts` | Pure functions only. No imports from `lib/`, `src/services/`, or `src/lib/`. Receives plain data objects as params. |
| `src/constants/` | Hardcoded UI constants — no API calls, no imports from `lib/`. |
| `lib/` | Backend only. Never import inside `src/`. Exception: `lib/pricing.ts` may import `src/utils/pricing.ts`. |
| `lib/pricing.ts` | Fetches DB data via Prisma, passes plain objects to `src/utils/pricing.ts`. Zero pricing logic of its own. |
| `app/api/**/route.ts` | Validate with Zod → delegate to `lib/` → return standard shape. |

---

## Import Boundaries

| From | Can import | Cannot import |
|---|---|---|
| `src/components/` | `src/lib/types/`, `src/utils/`, `src/constants/` | `src/services/`, `lib/` |
| `src/views/` | `src/components/`, `src/services/`, `src/lib/`, `src/utils/`, `src/constants/` | `lib/` |
| `src/services/` | `src/lib/types/`, `src/lib/api/client` | `lib/` |
| `src/utils/pricing.ts` | nothing — plain params only | everything |
| `src/constants/` | nothing | everything |
| `app/api/**/route.ts` | `lib/`, `src/lib/types/`, `src/utils/pricing.ts` | `src/components/`, `src/views/` |
| `lib/pricing.ts` | `lib/prisma.ts`, `src/utils/pricing.ts` | other `src/` files |
| `lib/` (other files) | other `lib/` files | `src/` |

---

## Import Alias

```json
// tsconfig.json
"@/*" → "./*"
```

```ts
import HomePage                  from '@/src/views/HomePage'
import { fetchMenu }             from '@/src/services/menuService'
import { formatPrice }           from '@/src/utils/formatPrice'
import { calcLattePrice }        from '@/src/utils/pricing'
import { ICE_OPTIONS }           from '@/src/constants/orderOptions'
import { useCartStore }          from '@/src/lib/store/cartStore'
import { apiClient }             from '@/src/lib/api/client'
import { getSession }            from '@/lib/auth'              // server only
import { prisma }                from '@/lib/prisma'            // server only
import { resolveOrderItemPrice } from '@/lib/pricing'           // server only
```

---

## Naming Conventions

| Type | Convention | Example |
|---|---|---|
| Views | PascalCase + Page suffix | `HomePage`, `AdminMenuPage` |
| Components | PascalCase | `MenuCard`, `OrderCard` |
| Services | camelCase + Service suffix | `menuService`, `powderService` |
| Hooks | camelCase + use prefix | `useScrollProgress` |
| Utils | camelCase | `formatPrice`, `pricing` |
| Constants | camelCase + descriptive | `orderOptions` |
| Type files | camelCase | `menu.ts`, `powder.ts` |
| Route handlers | `route.ts` | Next.js convention |
| Zod schemas | camelCase, domain-named | `lib/validations/powder.ts` |
