# Bạn Cá Bán Matcha — Current Architecture Specification

> **Authority:** kiến trúc được chấp nhận, dependency direction, shared abstractions và UI consistency.
> **Read when:** lập kiến trúc/plan, thêm shared component, đổi data flow hoặc chọn UI pattern.
> **Update when:** kiến trúc, integration boundary hoặc project-wide UI standard thay đổi.
> **Does not own:** endpoint payload chi tiết, physical DB fields hoặc domain rules pricing/order/voucher.

Tài liệu này mô tả hệ thống đang được hỗ trợ, không phải kiến trúc lý tưởng trong tương lai. Legacy exception được phép tồn tại nhưng không được copy sang code mới.

## PRODUCT_DISCOUNT nhiều sản phẩm

Admin cấu hình phạm vi explicit tối đa 100 món Latte/Fusion bằng multi-select có tìm kiếm,
lọc category/không theo mùa, chọn tất cả kết quả lọc và giao của các size đang bán. Các filter
chỉ hỗ trợ chọn; server lưu ID cụ thể. Khách “Dùng ngay” chỉ one-tap khi còn đúng một tổ hợp
món/size hợp lệ, nếu không phải chọn rõ món và size. Staff chỉ áp dụng lên cart item đã chọn.
Customer và staff đều gửi cùng `product_voucher_id` và dùng chung server calculator.

## Runtime architecture

```text
app page/layout ──> view / feature container ──> service ──> API route
                              │                              │
                              └──> shared UI                └──> lib business logic
                                                                  │
                                                                  ├──> Prisma
                                                                  └──> external adapter
```

- `app/` sở hữu routing, layouts, metadata và HTTP entry points.
- `src/views/` sở hữu page composition. Một feature container trong `src/components/<domain>` có thể orchestration và gọi service khi việc đó giữ logic gần feature.
- `src/components/ui/` chỉ chứa primitive dùng chung; không gọi service, không biết API URL và không chứa domain rule.
- `src/services/` sở hữu API URL, Axios calls và DTO mapping. Dùng một `apiClient` tại `src/lib/api/client.ts`.
- `lib/` là server-only, sở hữu business workflow, Prisma access và adapter cho dịch vụ ngoài.
- Prisma schema và migrations là physical database truth. `SCHEMA.md` chỉ giải thích semantics/invariants.

Không thực hiện repo-wide layer refactor khi sửa feature. Direct API call ngoài service, oversized route/component và page entry có logic đang tồn tại là legacy exception: giữ nguyên nếu ngoài scope, không dùng làm mẫu cho code mới.

## Business consistency boundaries

- Customer và staff order phải dùng chung calculator về pricing/voucher.
- Server luôn đọc lại giá từ DB và ceil giá cuối lên 1.000 VND.
- Pure formula nằm ở `src/utils/pricing.ts`; DB wrapper nằm ở `lib/pricing.ts`.
- Order, voucher và pricing rules chỉ có canonical owner trong domain skill tương ứng.
- Voucher catalog, owned wallet DTO, issuance, checkout và refund dùng cùng server-side live
  availability resolver; UI không tự suy luận lifecycle của menu configuration.
- API response và field compatibility thuộc `API.md`; không đổi tên chỉ vì muốn làm sạch thuật ngữ.
- Auth middleware treats PostgreSQL session state as authoritative. Revocation paths await cache
  eviction, refresh rotation fails closed when its compare-and-set/grace update is not confirmed,
  and no positive Redis session cache may outlive a deleted database row.
- GET handlers are read-only. Scheduled lifecycle work runs through authenticated cron routes;
  customer voucher reconciliation is an explicit POST before a wallet read.
- External SDK luôn nằm sau wrapper/adapter để UI và business logic không phụ thuộc trực tiếp nhà cung cấp.
- Ảnh catalog đi qua Storage adapter: menu/powder chuẩn hóa WebP tối đa 800px quality 75; milk type, addon group và từng addon option tối đa 320px quality 70, cùng cache một năm. Option ưu tiên ảnh riêng và fallback ảnh group cho dữ liệu cũ. Ảnh Supabase hiển thị qua Next/Vercel Image Optimization với `sizes` theo container; thumbnail sữa/add-on/powder dùng quality 60 và ảnh powder lớn chỉ tải khi mở chi tiết. Menu card giữ khung skeleton ổn định và fade ảnh vào sau khi tải xong.

## UI system

### Canonical stack

- Tailwind semantic tokens; không thêm raw hex trong component mới.
- Radix cho dialog, alert dialog và desktop popover semantics.
- Vaul cho mobile sheet/drawer có swipe-to-dismiss.
- Framer Motion chỉ dùng cho animation/gesture có ý nghĩa, không tự dựng lại modal semantics.
- Sonner cho transient feedback; React Hook Form + Zod `onBlur` và inline error cho form.
- Lucide cho structural icons. Ký hiệu 🐟 được phép khi biểu diễn đơn vị thương hiệu.
- `src/utils/cn.ts` là class-name helper canonical.

### Primitive decision matrix

| Tình huống | Primitive bắt buộc |
|---|---|
| Xác nhận hoặc thao tác nguy hiểm | `ConfirmModal` |
| Form/detail thông thường | `ResponsiveOverlay` |
| Mobile cart hoặc long flow | Vaul thông qua project sheet/overlay primitive |
| Camera, map, crop, report | Fullscreen Radix dialog chuyên biệt |
| Static select | Native select |
| Search/multi-select | `AdaptiveSelect`: Popover desktop, Vaul mobile |
| Thông báo tạm thời | Sonner |
| Field validation | Inline error bên dưới field |

Shared overlay sở hữu portal, accessible title/description, focus trap/restore, Escape, scroll lock, backdrop, safe area, dismiss policy và layer. Feature code chỉ cung cấp content và callbacks; không tự viết `fixed inset-0` backdrop.

Customer voucher list/detail/target/setup dùng chung `ResponsiveOverlay`: mobile là bottom sheet,
desktop là centered dialog. Voucher card giữ content button mở detail độc lập với action; wallet dùng
“Dùng ngay”, cart dùng selection button có `aria-pressed`. Voucher không đủ điều kiện vẫn đọc được
và mở detail, chỉ selection bị khóa kèm lý do. Wallet và cart voucher sheet dùng chung
ba tab Voucher của tôi / Nhận ưu đãi / Lịch sử; history chỉ cho xem detail, không cho chọn.
Wallet và cart dùng chung voucher frame edge-to-edge với một lớp padding; detail thay nội dung
trong cùng frame thay vì mở sheet lồng. Cart voucher sheet dùng layer `nested`; target/setup mở
từ sheet này dùng layer `critical`.

Catalog package cards also keep a full-card content button for detail separate from their quick
acquisition action. Package detail renders catalog data directly and keeps the selected raw package
authoritative while catalog filters change. Its footer distinguishes guest login, free claim,
points exchange/deficit, sold-out, per-user limit, busy, automatic grant, and unavailable callback;
points exchange always opens confirmation and never closes detail on cancel.

Guest voucher acquisition opens `AuthModal` above the still-open voucher detail with the exact
package intent. Backdrop/X dismissal clears that intent but leaves the voucher background open.
After successful login, the intent is cleared before acquisition/confirmation and consumed exactly
once, including React StrictMode effect replay; an unavailable package produces no mutation.

`ProductModal` dùng dialog desktop và Vaul full-height trên mobile. Browser Back chỉ đóng overlay trên cùng; CTA luôn ghép action với tổng giá bằng ` - `, còn addon selector dùng lưới 3 cột. Header Base Liquid hiển thị Coldwhisk dạng switch có semantics và vẫn nêu nền mặc định khi selector bị ẩn.

Overlay layer chỉ có `base`, `nested`, `critical`. Không tạo z-index tùy ý cho overlay mới.

Button dùng variants `primary`, `secondary`, `outline`, `ghost`, `destructive`; touch target tối thiểu 40×40px. Option card/tab có thể là specialized control nhưng vẫn phải có semantic button, focus state và touch target tương đương.

## Legacy UI migration policy

- Existing direct Radix/Vaul imports và manual overlays là legacy, không phải API mẫu.
- Migrate theo từng flow có tests; không mass-replace modal, button hoặc form.
- Low-risk trước: local toast, adaptive select và simple admin/auth overlays.
- High-risk tách riêng: product, cart/staff cart, QR, menu editor, map, crop và report.
- Sau mỗi batch, thu hẹp legacy allowlist. Chỉ bật guard cứng khi batch tương ứng đã hoàn thành.

## Resource registry

| Thay đổi | Canonical resource cần cập nhật |
|---|---|
| Business order/pricing/voucher | Domain skill + regression tests |
| API path/method/request/response | `API.md` + consumers/tests |
| Prisma model/migration/semantic | Prisma + `SCHEMA.md` |
| Layer/shared primitive/integration boundary | `SPECIFICATION.md` |
| File placement/import rule | `STRUCTURE.md` |
| Env key | `.env.local.example` |
| Chưa implement/deferred | `NOTES.md` |
| Workflow/release | Skill tương ứng |

Nếu code chỉ được sửa để khớp resource hiện có, Resource Impact là `None`; không chỉnh wording chỉ để tạo diff tài liệu.

## Staging order/voucher verification

Test layers hermetic không chứng minh PostgreSQL hay deployment thật. Live-write chạy standalone
qua `scripts/staging-tests/cli.mjs`, không được collect trong `npm test`; node tests của runner chỉ
chứng minh orchestration bằng HTTP/DB boundary doubles.

Luồng self-service theo thứ tự: release owner chạy
`test:live:staging:configure -- --branch <branch>`, push revision và chờ deployment `READY`; operator
chạy `test:live:staging:attest -- --deployment <dpl-id>`, rồi mới chạy `:plan`, `:smoke`, `:full`
hoặc `:recover -- --run-id <id>`. Configure và attest đều fail closed; chúng không deploy hay push.
Operator yêu cầu cả `.env.staging` và `.env.staging.local`, load stage trước rồi local (local thắng).
`TEST_STAGING_CONFIG_DIR` là optional absolute directory pointer chỉ đọc từ process environment trước
khi mở hai file; đặt key này bên trong một trong hai file không có hiệu lực. Năm nonsecret pins
`TEST_VERCEL_PROJECT_ID`, `TEST_VERCEL_TEAM_ID`, `TEST_VERCEL_GIT_BRANCH`,
`TEST_STAGING_POOLER_HOST`, `TEST_RELEASE_WINDOW_ID` mới được phép process-env overlay lên file config.
Attestation sống tối đa 2 giờ và ghim deployment Vercel `source=git`, exact branch/SHA, release-window
assertion, branch env metadata cùng fingerprint public catalog API/DB. Sensitive DB variables chỉ được
chứng minh bằng configuration provenance + fresh Git deployment (`deploymentSecretReadback=false`).

Các profile `test:live:staging:plan`, `:smoke`, `:full` và `:recover` fail closed và lấy URL,
deployment ID/SHA cùng staging target từ attestation hiện hành, không tin các target pin nhập tay.
`plan` chỉ đọc; `smoke`/`full` không đổi skip hoặc case chưa triển khai thành PASS; `recover` chỉ xử
lý đúng một run đã journal. Target phải là immutable Vercel Preview staging, có deployment ID/SHA,
Supabase ref và DB binding đã attestation; không fallback production hoặc lưu secret trong report.

Staging write còn yêu cầu `PUSH_DELIVERY_MODE=log_only`, `NEXT_PUBLIC_APP_ENV=staging` và
`VERCEL_ENV=preview`. `lib/push.ts` chỉ bỏ subscription read/web-push trong đúng tổ hợp này;
production, biến chưa đặt hoặc môi trường không khớp giữ delivery hiện có. Mỗi mutation phải có
intent durable trước dispatch; outcome mơ hồ dừng ghi để reconciliation/recovery, không tự retry.
