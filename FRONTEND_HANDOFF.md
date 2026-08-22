# Frontend Handoff — BUNDLE Flow

## Mục tiêu

Tiếp nhận phần frontend của luồng BUNDLE sau khi API contract đã được chuyển sang grouped DTO và multi-application payload. Audit UI/UX hiện tại, hoàn thiện các điểm còn thiếu và thêm regression tests mà không thay đổi API, schema hay business rules.

## Trạng thái tại thời điểm bàn giao

Các lỗi từ vòng review trước đã được xử lý:

1. Customer checkout gửi `bundle_applications` thay cho các field BUNDLE legacy.
2. Staff checkout gửi `bundle_applications` với qualifier/reward allocations.
3. Admin BUNDLE gửi `qualifier_products`, `reward_products` và `reward_addon_option_ids`.
4. Wallet, cart và setup sheet đọc grouped BUNDLE response DTO.
5. Product reward giữ gross `client_price_vnd`; voucher calculator mới áp dụng discount.
6. `BundleVoucherSetupSheet` không còn gọi hook có điều kiện.
7. Lookup qualifier/reward đã bao gồm category `extras`.
8. Dependency của callback trong `ProductModal` đã có `disableVoucherApplication`.
9. Lịch sử đơn ngắn vẫn hiển thị order-level voucher discount và addon discount.
10. Quantity controls đã khôi phục touch target tối thiểu 44×44 px.

QA đã chạy thành công:

- `npm run lint`: PASS
- `npx tsc --noEmit`: PASS
- `npm run resources:check`: PASS
- Full Vitest: 150 test files pass, 1 skipped; 1.359 tests pass, 4 skipped
- `git diff --check`: không có whitespace error

Chưa thực hiện build, browser test, migration apply, commit, push hoặc deploy.

## Backend/API thay đổi chi tiết — frontend bắt buộc hiểu

Đây là một migration BUNDLE xuyên suốt, không phải chỉ đổi vài tên field ở UI. Backend đã đổi
nguồn dữ liệu, payload checkout, validation, cách server tính tiền, persistence và lifecycle
của voucher. Frontend phải coi section này là contract bắt buộc; không tự suy ra discount hoặc
thay thế bằng dữ liệu legacy.

### 1. Data model nội bộ đã được nhóm lại theo sản phẩm

Trước đây mỗi cấu hình size/powder/milk là một scope riêng. Backend đã migration sang **một
scope cho mỗi `(package, role, menu_item)`**, bao gồm:

```ts
type BundleProduct = {
  menu_item_id: string;
  default_powder_id: string | null;
  default_base_liquid_id: string | null;
  allowed_sizes: Array<"SMALL" | "MEDIUM" | "LARGE">;
};
```

- `role` nội bộ vẫn là `QUALIFIER` hoặc `REWARD`, nhưng **không xuất hiện** ở public DTO.
- `allowed_sizes` được lưu ở relation riêng và trả về dưới dạng array đã sắp nhỏ → lớn.
- `extras` là hàng fixed-price: `default_powder_id`, `default_base_liquid_id` là `null`,
  `allowed_sizes` là `[]`.
- Migration đã chuẩn hoá các package cũ sang default powder/Base Liquid. Nếu dữ liệu cũ không
  thể nhóm nhất quán, migration dừng để admin review package đó, không tự chọn cấu hình ngầm.

Frontend admin phải gửi **một default configuration duy nhất** cho mỗi product scope và danh
sách size được phép; không render/tạo nhiều row theo từng cấu hình như DTO cũ.

### 2. Public BUNDLE DTO thống nhất ở mọi endpoint

Các endpoint dưới đây đã map quan hệ Prisma nội bộ sang cùng public DTO grouped:

- `GET/POST /api/admin/voucher-packages`
- `GET /api/voucher-packages`
- `GET /api/profile/vouchers`
- `GET /api/staff/users/[id]/vouchers`

`bundleRule` mà frontend nhận được luôn có dạng:

```ts
type PublicBundleRule = {
  buy_quantity: number;
  reward_quantity: number;
  reward_kind: "PRODUCT" | "ADDON";
  reward_mode: "SAME_CONFIG" | "FIXED_CONFIG" | "ALLOWED_SCOPE";
  benefit_scaling: "PER_BUNDLE" | "ONCE_PER_ORDER" | "PER_QUALIFYING_ITEM";
  max_applications_per_order: number;
  max_reward_units_per_order: number | null;
  qualifier_products: Array<BundleProduct & {
    menu_item: { name: string; category: "latte" | "fusion" | "extras"; is_available: boolean };
  }>;
  reward_products: Array<BundleProduct & {
    menu_item: { name: string; category: "latte" | "fusion" | "extras"; is_available: boolean };
  }>;
  reward_addon_option_ids: string[];
};
```

Ý nghĩa theo reward mode:

| Mode | `reward_products` | UI phải làm gì |
| --- | --- | --- |
| `SAME_CONFIG` | `[]` | Quà dùng chính product/config đã chọn cho qualifier; lấy option từ `qualifier_products`. |
| `FIXED_CONFIG` | đúng 1 product | Không cho đổi sang product ngoài scope này. |
| `ALLOWED_SCOPE` | ít nhất 1 product | Cho chọn 1 reward product trong danh sách hợp lệ. |

Với `reward_kind: "ADDON"`, `reward_products` luôn rỗng; quà được xác định bằng
`reward_addon_option_ids`. DTO chỉ trả ID addon để giữ response gọn; UI muốn label phải resolve
từ `menuData.addon_groups`, không yêu cầu backend thêm label convenience field.

### 3. Admin create BUNDLE là strict contract

`POST /api/admin/voucher-packages` nhận `bundle_rule` với chính field grouped ở trên.
Backend Zod strict, từ chối key ngoài contract. Các invariant server đã kiểm tra:

- Không trùng `menu_item_id` trong cùng `qualifier_products` hoặc `reward_products`.
- Không trùng size trong `allowed_sizes`.
- `PRODUCT` reward chỉ được `PER_BUNDLE`, không có addon reward IDs.
- `SAME_CONFIG` không có `reward_products`; `FIXED_CONFIG` có đúng một; `ALLOWED_SCOPE` có ít
  nhất một.
- `ADDON` phải có `reward_addon_option_ids`, không có `reward_products`.
- Rule package bất biến sau khi tạo; màn edit package chỉ được name, description và active state.

Không có `reference_price_vnd`: admin không nhập giá BUNDLE. Baseline của reward được backend
resolve từ menu/config hiện hành lúc checkout. Đây là lý do UI không được chứa, hiển thị như
nguồn truth, hoặc gửi field này.

### 4. Checkout payload đã đổi từ một voucher sang nhiều application tường minh

Cả hai endpoint `POST /api/orders` và `POST /api/staff/orders` nhận cùng shape:

```ts
type BundleApplication = {
  voucher_qr_token: string; // public voucher ID, không gửi vouchers.id
  qualifier_allocations: Array<{
    client_line_id: string;
    quantity: number;
  }>;
  reward_allocations: Array<{
    client_line_id: string;
    quantity: number;
    addon_option_id?: string; // bắt buộc cho ADDON reward, không gửi cho PRODUCT reward
  }>;
};

type CheckoutExcerpt = {
  items: Array<{
    client_line_id: string; // bắt buộc nếu có bundle_applications
    client_price_vnd: number; // giá GROSS trước BUNDLE discount
    // các field item chuẩn khác
  }>;
  bundle_applications: BundleApplication[];
};
```

Các thay đổi quan trọng:

- `bundle_applications` là array, cho phép nhiều **voucher BUNDLE khác nhau** trong một order.
- `client_line_id` là ID ổn định của cart line, cần unique trong toàn bộ `items`; không dùng index
  render, menu item ID hay voucher token thay thế.
- Một `voucher_qr_token` chỉ xuất hiện một lần.
- Mỗi allocation phải tham chiếu một cart line có thật. Tổng product units dùng làm qualifier và
  PRODUCT reward không được vượt quantity của line.
- Server cấm hẳn `bundle_voucher_qr_token` và `bundle_reward_allocations` bằng Zod `never()`.
  Gửi một trong hai field cũ trả `400 VALIDATION_ERROR`, kể cả có field mới đúng.
- Customer/staff anonymous không được dùng BUNDLE. Staff dùng voucher cho customer đã biết vẫn
  cần `customer_qr_token` khi người thao tác có role STAFF; ADMIN được bypass theo policy hiện có.

### 5. Server là nguồn tính giá và quyết định application có hợp lệ

Thứ tự thực tế của server khi tạo order:

1. Zod validate payload và allocation references.
2. Auth/role/store rules.
3. Re-fetch menu item, size, powder, Base Liquid, addon và giá từ DB.
4. So sánh từng `client_price_vnd` với giá server-resolved trước mọi BUNDLE discount.
   Mismatch trả `409 PRICE_CHANGED`.
5. Resolve toàn bộ BUNDLE applications từ voucher owner và các cart line đã server-resolve.
6. Đưa discount BUNDLE vào calculator trước ITEM/PRODUCT, ADDON, DISCOUNT, FREESHIP.
7. Nếu application có benefit, persist order + allocation + reserve voucher trong cùng transaction.

Vì vậy: lúc thêm reward BUNDLE vào cart, `client_price_vnd` phải là **giá đầy đủ trước giảm**.
Không đặt `0`, không trừ trước ở Zustand/UI và không dùng giá cached/reference price. UI chỉ có thể
hiển thị estimate; backend mới là kết quả cuối cùng.

### 6. Quy tắc server evaluate allocation

Frontend phải dựng allocation theo các rule sau; không tự suy luận bằng “tổng số món” mà bỏ qua
cart line/unit cụ thể:

- Qualifier phải thuộc `qualifier_products`: match `menu_item_id` và `allowed_sizes`; extras
  hợp lệ khi size là `null`/scope không có size.
- Product reward phải thuộc scope tương ứng. Unit reward **không được đếm lại** làm qualifier,
  kể cả khi cùng menu item với qualifier.
- Cùng một product unit hoặc addon unit không được được benefit từ nhiều BUNDLE applications,
  ITEM/PRODUCT voucher hoặc ADDON voucher. Server sẽ reject overlap/conflict.
- `SAME_CONFIG`: reward và qualifier phải cùng menu item và có đủ các group buy/reward. Baseline
  được server lấy từ current resolved price của size/config nhỏ nhất trong mỗi qualifier group.
- `FIXED_CONFIG`/`ALLOWED_SCOPE`: reward discount chỉ cover baseline server-resolved từ default
  powder + Base Liquid đã lưu trong rule tại actual reward size. Nếu khách nâng cấu hình đắt hơn,
  họ trả phần chênh; nếu rẻ hơn không phát sinh surplus. BUNDLE PRODUCT không cover addon.
- ADDON reward phải target chính một line đã nằm trong `qualifier_allocations`, addon đó phải có
  mặt trong line, phải thuộc `reward_addon_option_ids`, và không được là Extra Matcha/dynamic gram.
- ADDON scale theo `PER_BUNDLE`, `ONCE_PER_ORDER` hoặc `PER_QUALIFYING_ITEM`; server kiểm tra
  `max_applications_per_order` và `max_reward_units_per_order`.
- `min_order_vnd` dùng paid-merchandise subtotal: loại product units đã được ITEM/PRODUCT/BUNDLE
  cover và addon units đã được ADDON cover. Nếu không đạt, server reject application.

Khi BUNDLE có zero incremental benefit, server không consume voucher đó. API order trả token trong
`skipped_vouchers`; UI phải bỏ/khôi phục selection tương ứng và thông báo rõ cho khách thay vì coi
voucher đã dùng.

### 7. Persistence và voucher lifecycle đã đổi theo application

Backend không còn một `order_bundle_application` duy nhất cho order. Một order có nhiều application;
mỗi application persist:

- voucher BUNDLE, `application_count` và status;
- nhiều qualifier allocations, liên kết tới `order_items` + quantity;
- nhiều reward rows, liên kết tới `order_items` hoặc `order_item_addons`, quantity và discount đã
  server-compute.

Lifecycle:

| Order flow | Voucher BUNDLE | Application row |
| --- | --- | --- |
| Customer online / counter BANK_TRANSFER tạo order | `ACTIVE → RESERVED` | `RESERVED` |
| Xác nhận thanh toán | `RESERVED → REDEEMED` | `REDEEMED` |
| Counter CASH tạo order | `ACTIVE → REDEEMED` (`OFFLINE`) | `REDEEMED` |
| Cancel order | trả về `ACTIVE` nếu còn hạn, nếu không `EXPIRED` | `CANCELLED` |

Frontend không được trực tiếp QR redeem BUNDLE; BUNDLE chỉ được reserve/redeem trong order flow.

### 8. Error/response mà frontend cần xử lý

| API result | Ý nghĩa frontend |
| --- | --- |
| `400 VALIDATION_ERROR` | Payload không đúng shape, thiếu/duplicate `client_line_id`, field legacy hoặc allocation reference sai. Giữ cart, yêu cầu refresh/retry sau khi code sửa. |
| `409 PRICE_CHANGED` | Giá gross client gửi không còn khớp server. Refresh menu/cart price, giữ lựa chọn voucher để khách xác nhận lại. |
| `422 BUNDLE_NOT_ELIGIBLE` + `details.reason` | Voucher/qualifier/reward/allocation/min order/overlap không hợp lệ. Không retry mù; bỏ selection lỗi hoặc yêu cầu khách chọn lại. |
| `404 BUNDLE_NOT_ELIGIBLE` | Voucher token không tồn tại. Xoá token khỏi local cart/UI. |
| `data.skipped_vouchers` | Voucher không tạo thêm lợi ích nên không bị consume. Đồng bộ UI selection theo token trả về. |

### 9. Backend files đã thay đổi (để agent đọc khi cần bằng chứng)

- Validation: `lib/validations/order.ts`, `lib/validations/voucherPackage.ts`
- Public DTO mapping: `lib/voucherBundleDto.ts`, `lib/voucherPublicDto.ts`
- Rule resolution/evaluation: `lib/orderBundle.ts`, `lib/promotionBundle.ts`,
  `lib/promotionBundleTypes.ts`, `lib/pricing.ts`
- Transactional persistence/lifecycle: `lib/orderBundleWrite.ts`, `lib/customerOrderCreation.ts`,
  `lib/customerOrderWrite.ts`, `lib/cancelOrder.ts`
- Endpoint handlers: `app/api/orders/route.ts`, `app/api/staff/orders/route.ts`,
  `app/api/admin/orders/[id]/confirm-payment/route.ts`,
  `app/api/staff/orders/[id]/route.ts`, voucher-package/voucher-list routes.
- Schema migration (đã có trong working tree, **không tự apply**):
  `prisma/migrations/20260817213000_group_bundle_products_and_multi_applications/migration.sql`

Nếu frontend cần một field chưa có trong public DTO, trước hết derive từ menu data và DTO hiện hữu.
Không import `lib/` server-only vào client và không đề xuất thêm snapshot/convenience field chỉ để
tránh resolve data ở UI; ghi blocker cụ thể nếu thật sự không thể hoàn tất.

## Contract frontend phải giữ

Request checkout BUNDLE:

```ts
bundle_applications: Array<{
  voucher_qr_token: string;
  qualifier_allocations: Array<{
    client_line_id: string;
    quantity: number;
  }>;
  reward_allocations: Array<{
    client_line_id: string;
    quantity: number;
    addon_option_id?: string;
  }>;
}>;
```

Grouped BUNDLE response/admin contract:

```ts
{
  buy_quantity: number;
  reward_quantity: number;
  reward_kind: "PRODUCT" | "ADDON";
  reward_mode: "SAME_CONFIG" | "FIXED_CONFIG" | "ALLOWED_SCOPE";
  benefit_scaling: "PER_BUNDLE" | "PER_QUALIFYING_ITEM" | "ONCE_PER_ORDER";
  max_applications_per_order: number;
  max_reward_units_per_order: number | null;
  qualifier_products: BundleProduct[];
  reward_products: BundleProduct[];
  reward_addon_option_ids: string[];
}
```

Không khôi phục hoặc gửi lại:

- `bundle_voucher_qr_token`
- `bundle_reward_allocations`
- `qualifier_scopes`
- `reward_product_scopes`
- `productScopes`
- `addonRewards`
- `reference_price_vnd`

## Phạm vi frontend tiếp theo

Thực hiện audit read-only trước, sau đó đề xuất plan ngắn. Tập trung vào:

1. Kiểm tra UX xuyên suốt admin BUNDLE, customer wallet/cart/setup sheet và staff checkout.
2. Xác định UI hiện đã thực sự cho chọn và gửi nhiều BUNDLE applications hay mới chỉ đóng gói một application trong array.
3. Rà state reset khi đóng/mở hoặc đổi voucher trong `BundleVoucherSetupSheet`.
4. Rà loading, empty, unavailable và error states cho qualifier/reward products.
5. Hiển thị tên addon reward từ menu data khi DTO chỉ cung cấp addon IDs; không yêu cầu backend thêm convenience field.
6. Kiểm tra selection/allocation khi có nhiều qualifier lines, reward lines hoặc nhiều bundle applications.
7. Kiểm tra mobile layout, keyboard focus, accessible labels và touch target tối thiểu 44×44 px.
8. Viết regression/component tests trước mỗi thay đổi behavior đáng kể.

## File đầu mối

- `src/components/shared/BundleVoucherSetupSheet.tsx`
- `src/components/menu/cart/CartBundleVoucherPanel.tsx`
- `src/components/shared/VoucherModal.tsx`
- `src/lib/utils/voucherModalHelpers.ts`
- `src/lib/utils/voucherUseNowHelpers.ts`
- `src/lib/utils/bundleVoucher.ts`
- `src/views/staff/StaffOrdersPage.tsx`
- `src/components/admin/BundleScopeEditor.tsx`
- `src/services/customerVoucherService.ts`
- `src/services/adminVoucherService.ts`
- `src/services/orderService.ts`
- `src/services/staffOrderService.ts`

Regression tests liên quan:

- `src/__tests__/services/orderServiceMultiVoucher.test.ts`
- `src/__tests__/services/staffOrderService.test.ts`
- `src/__tests__/components/customer/bundleVoucher.logic.test.ts`
- `src/__tests__/components/customer/cartBundleVoucherPanel.test.ts`
- `src/__tests__/components/customer/voucherPackage.logic.test.ts`
- `src/__tests__/lib/voucherUseNowHelpers.test.ts`
- `src/__tests__/utils/adminVoucherBundle.test.ts`

## Guardrails bắt buộc

- Đọc `AGENTS.md` trước khi hành động.
- Dùng `mobile-ux`, `voucher-flow`, `api-layer` và `tdd` skills theo routing của repo.
- Ghi change contract trước khi sửa production code.
- Không thay đổi API/schema/business rules trong task frontend này.
- Không dùng các field BUNDLE legacy.
- Không tin giá từ client và không đưa giá reward về `0`.
- Không sửa hoặc xóa các thay đổi đang có trong dirty working tree nếu không thuộc phạm vi.
- Không chạy `npm run dev`, browser hoặc `npm run build` trong agent workflow.
- Không apply migration, commit, push hoặc deploy nếu người dùng chưa yêu cầu rõ ràng.
- Nếu cần backend/API/schema để hoàn tất UX, dừng và báo blocker thay vì tự mở rộng scope.

## Definition of Done

- Frontend không còn dereference DTO legacy.
- Các luồng admin, customer và staff sử dụng cùng grouped BUNDLE contract.
- Multi-application behavior được hỗ trợ đầy đủ hoặc có finding/blocker cụ thể kèm bằng chứng.
- Các trạng thái mobile/accessibility quan trọng có test tương ứng.
- Targeted tests pass.
- `npm run lint` pass.
- `npx tsc --noEmit` pass.
- Full test suite pass.
- `npm run resources:check` pass.
- Completion report nêu rõ production files đã sửa, test đã chạy và Resource Impact.

## Prompt ngắn để giao cho agent

> Đọc toàn bộ `FRONTEND_HANDOFF.md` và `AGENTS.md`. Bắt đầu bằng audit read-only frontend BUNDLE flow, báo findings và change contract trước khi sửa. Hoàn thiện UI/UX theo grouped BUNDLE DTO và multi-application payload, dùng TDD, không thay đổi API/schema/business rules, không đụng thay đổi ngoài phạm vi trong dirty working tree. Cuối task chạy đầy đủ QA gates được liệt kê trong handoff.
