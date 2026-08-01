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
      register/route.ts
      login/route.ts
      logout/route.ts
      refresh/route.ts
    menu/route.ts
    powders/route.ts              # Public — full powder catalogue
    orders/route.ts
    orders/[id]/route.ts
    profile/route.ts
    profile/points/route.ts
    profile/vouchers/route.ts
    profile/vouchers/exchange/route.ts
    profile/vouchers/refund/route.ts
    staff/orders/route.ts
    staff/scan/route.ts
    staff/users/route.ts
    staff/users/[id]/vouchers/route.ts
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
    admin/
      AdminMenuPage.tsx
      MenuItemCard.tsx
      MenuItemModal.tsx
      MenuSubTabs.tsx             # Horizontal sub-tab bar for /admin/menu/*
      VoucherPackageForm.tsx
      PointsLogTable.tsx
      PowderForm.tsx
      MilkTypeForm.tsx
      MilkTypeCard.tsx
      MilkTypeModal.tsx
      AddonGroupForm.tsx
      AddonGroupCard.tsx
      AddonGroupModal.tsx
      SizeConfigForm.tsx
      StoreSettingsModal.tsx          # Admin modal: weekly schedule + temporary closure
    staff/
      StaffMenuCard.tsx
      StaffCartDrawer.tsx
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
      cartStore.ts                # Zustand cart — localStorage persisted
      powderStore.ts              # Zustand — powder catalogue cached from /api/powders
      storeStore.ts               # Zustand — store open/closed status (hydrated on HomePage, read in CartDrawer)
    hooks/
      useScrollProgress.ts
      useBodyScrollLock.ts
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

lib/                              # Backend only — server-side, NEVER import in src/
  prisma.ts
  auth.ts                         # signJwt, verifyJwt, getSession
  sms.ts
  storage.ts                      # Supabase Storage helpers — bucket: menu-images
  pricing.ts                      # Thin wrapper: fetches DB data → calls src/utils/pricing.ts
                                  # exports: resolveOrderItemPrice(), buildPricingContext()
                                  # Zero pricing logic of its own
  pointsHistory.ts                # Groups immutable points_log rows before pagination
  validations/
    auth.ts
    menu.ts
    order.ts
    voucher.ts
    points.ts
    powder.ts                     # Zod schemas for matcha_powder, milk_type, default_size_config
    storeSchedule.ts              # Zod schemas for store schedule + closure toggle

middleware.ts
prisma/schema.prisma
.env.local
.env.local.example
```

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
