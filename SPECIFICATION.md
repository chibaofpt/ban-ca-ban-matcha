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
- Server luôn đọc lại giá từ DB và ceil giá cuối lên 1.000 VND. Customer và Staff checkout giữ
  menu/pricing, eligibility của voucher được dùng và order writes trong cùng Serializable transaction.
  Retry đọc lại dữ liệu qua transaction mới, clone input riêng và giữ nguyên mốc tiếp nhận để xét hạn
  voucher. Fulfillment/Goong và auto-grant issuance preflight ở ngoài; voucher đã cấp ở preflight có thể
  còn tồn tại nếu checkout thất bại. Không coi toàn bộ HTTP request là một transaction duy nhất.
- Pure formula nằm ở `src/utils/pricing.ts`; DB wrapper nằm ở `lib/pricing.ts`.
- Order, voucher và pricing rules chỉ có canonical owner trong domain skill tương ứng.
- Voucher catalog, owned wallet DTO, issuance, checkout và refund dùng cùng server-side live
  availability resolver; UI không tự suy luận lifecycle của menu configuration.
- Cấu hình Base Liquid theo món có một nguồn dữ liệu hai chiều: editor món và editor Base Liquid
  cùng đọc/ghi `menu_item_allowed_base_liquid`. Default Latte toàn hệ thống và default Fusion theo
  món là availability ngầm, không tạo row trùng trong bảng nối.
- API response và field compatibility thuộc `API.md`; không đổi tên chỉ vì muốn làm sạch thuật ngữ.
- Auth middleware treats PostgreSQL session state as authoritative. Legacy Redis session keys are
  only evicted, never trusted for authorization. Refresh rotates the existing row and re-reads the
  winning token; a missing row, failed update or invalid grace/binding fails closed.
- Access JWT `sid` giữ nguyên qua refresh. Mỗi authoritative check đọc session còn hạn và role hiện
  tại từ DB; logout xóa session trước khi clear cookie. In-flight request đã qua check có thể hoàn tất.
- QR user/voucher sinh cục bộ bằng adapter `qrcode` lazy-loaded; không gửi bearer content tới QR
  service bên ngoài. Hook loại bỏ kết quả cũ khi nội dung đổi hoặc component đã đóng.
- Báo cáo đếm và đọc trang trong một RepeatableRead snapshot có timeout; chặn phạm vi quá lớn trước
  khi aggregate, không trả tổng của dữ liệu bị cắt. Chi tiết giới hạn thuộc `API.md`.
- Redis security rate limits giữ fail-open khi hạ tầng lỗi theo quyết định sản phẩm; không bảo đảm
  chống DDoS tuyệt đối. Auth/session checks vẫn fail-closed; logs chỉ chứa metadata đã loại secret.
- GET handlers are read-only. Scheduled lifecycle work runs through authenticated cron routes;
  customer voucher reconciliation is an explicit POST before a wallet read.
- External SDK luôn nằm sau wrapper/adapter để UI và business logic không phụ thuộc trực tiếp nhà cung cấp.
- Ảnh catalog đi qua Storage adapter: menu/powder chuẩn hóa WebP tối đa 800px quality 75; milk type, addon group và từng addon option tối đa 320px quality 70, cùng cache một năm. Addon option chỉ hiển thị ảnh riêng; khi không có ảnh riêng thì để trống, không fallback ảnh group. Ảnh Supabase hiển thị qua Next/Vercel Image Optimization với `sizes` theo container; thumbnail sữa/add-on/powder dùng quality 60 và ảnh powder lớn chỉ tải khi mở chi tiết. Menu card giữ khung skeleton ổn định và fade ảnh vào sau khi tải xong.

## UI system

- Upload ảnh catalog dùng chung khung bố cục 1:1 cho ảnh có nền và ảnh trong suốt. Mặc định vừa toàn bộ ảnh; admin kéo, thu/phóng nhỏ hơn khung, chọn Vừa khung/Lấp đầy/Đặt lại. Phần ngoài khung bị cắt, vùng trống trong khung giữ alpha; không kéo giãn vật thể hay tự đổ nền. Xem trước chính Blob WebP trên nền thẻ, có Chỉnh lại và Dùng ảnh này trước khi gắn vào form; kích thước/quality theo preset catalog hiện có. Nền caro chỉ dùng trong editor, không ghi vào file.
- Bốn tab con của Menu admin luôn chia đều một hàng và chuyển bằng nhấn; không dùng swipe hoặc thanh cuộn ngang.
- Editor Base Liquid cho phép tìm kiếm, lọc Latte/Fusion và chọn hàng loạt món, kể cả món tạm ngưng
  bán. Các món dùng liquid đó làm default hiển thị đã chọn nhưng khóa; lưu xong phải invalidate dữ
  liệu Menu để editor món phản ánh cùng allow-list.

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

Authentication dùng centered Radix dialog ở layer `critical` trên mọi breakpoint. Dialog đăng nhập được mount toàn cục, phủ lên nhưng không đóng page, cart hoặc voucher sheet đang hoạt động và sở hữu focus trên cùng. Hủy chỉ đóng auth, còn đăng nhập thành công trả quyền điều khiển cho surface nền để tiếp tục intent đã yêu cầu.

Customer voucher list/detail/target/setup dùng chung `ResponsiveOverlay`: mobile là bottom sheet,
desktop là centered dialog. Voucher card giữ content button mở detail độc lập với action; wallet dùng
“Dùng ngay”, cart dùng selection button có `aria-pressed`. Voucher không đủ điều kiện vẫn đọc được
và mở detail, chỉ selection bị khóa kèm lý do. Wallet và cart voucher sheet dùng chung
ba tab Voucher của tôi / Nhận ưu đãi / Lịch sử; history chỉ cho xem detail, không cho chọn.
Wallet và cart dùng chung voucher frame edge-to-edge với một lớp padding; detail thay nội dung
trong cùng frame thay vì mở sheet lồng. Cart voucher sheet dùng layer `nested`; target/setup mở
từ sheet này dùng layer `critical`.

Catalog nhận/đổi của customer wallet và cart ẩn `AUTO_GRANT` và gói có
`(user_redeemed_count ?? 0) >= max_per_user`. Việc ẩn gói không xóa, ẩn hoặc thay đổi voucher đã
sở hữu, quota hay lịch sử đổi. Detail đang mở phải khóa CTA nếu dữ liệu mới cho biết hết lượt.

Footer chi tiết gói chỉ điều phối callbacks hiện có: guest đăng nhập với đúng package intent;
`FREE_CLAIM` dùng “Nhận miễn phí”; `POINTS_EXCHANGE` hiển thị chi phí cá và vẫn cần xác nhận trước
khi trừ cá. Busy, hết hàng, hết lượt, `AUTO_GRANT` hoặc thiếu callback thì không được nhận/đổi.
Thiếu cá khóa đổi và báo đúng số còn thiếu, không thêm điều hướng menu. Eligibility dùng helper
chung, giữ thứ tự kiểm tra hiện có; footer không tự gọi API.

Auth từ voucher sheet mở ngay trên sheet còn mở, không đợi sheet đóng. Hủy auth bỏ intent nhưng
giữ surface nền; đăng nhập thành công tiếp tục intent một lần và giữ bước xác nhận đổi bằng cá.

`ProductModal` dùng dialog desktop và Vaul full-height trên mobile. Browser Back chỉ đóng overlay trên cùng; CTA luôn ghép action với tổng giá bằng ` - `. Add-on giá cố định dùng lưới 3 cột; add-on theo gram (Extra Matcha) dùng lưới 4 cột. Header Base Liquid hiển thị Coldwhisk dạng switch có semantics và vẫn nêu nền mặc định khi selector bị ẩn.

Admin Add-ons hiển thị toàn bộ group cùng toàn bộ option, không dùng expand/collapse. Group là card
bao ngoài với ảnh 64px; option là hàng một cột có ảnh riêng 44px và không fallback ảnh group trong
admin. Nút edit và toggle nằm ở vùng action đầu card/hàng; không hiển thị action delete. Tạo group
và tạo option tiếp tục dùng responsive bottom sheet/dialog, còn chỉnh sửa group/option đã tồn tại
dùng form inline và tại một thời điểm chỉ có một editor. Khi chuyển editor có dữ liệu bẩn phải xác
nhận bỏ thay đổi bằng `ConfirmModal`. Group editor cho sửa ảnh, SEO filename, title, description và
`max_select`; kiểu giá hiển thị bằng segmented buttons nhưng bị khóa sau khi tạo. Group theo gram
luôn giữ `max_select = 1`.

Group và option có nút Lên/Xuống với touch target tối thiểu 40×40px. Trong filter trạng thái, thao
tác group đổi chỗ với peer đang nhìn thấy nhưng gửi toàn bộ snapshot active + inactive; khi đang tìm
kiếm thì khóa reorder group. Option luôn reorder trong toàn bộ group. Thứ tự group duy nhất này được
`ProductModal` giữ nguyên; từng group vẫn chọn layout 3 cột cho giá cố định hoặc 4 cột cho gram.

Overlay layer chỉ có `base`, `nested`, `critical`. Không tạo z-index tùy ý cho overlay mới.

Button dùng variants `primary`, `secondary`, `outline`, `ghost`, `destructive`; touch target tối thiểu 40×40px. Option card/tab có thể là specialized control nhưng vẫn phải có semantic button, focus state và touch target tương đương.

## Legacy UI migration policy

- Existing direct Radix/Vaul imports và manual overlays là legacy, không phải API mẫu.
- Migrate theo từng flow có kiểm tra contract liên quan và nghiệm thu UI thủ công; không mass-replace modal, button hoặc form.
- Low-risk trước: local toast, adaptive select và simple admin/auth overlays.
- High-risk tách riêng: product, cart/staff cart, QR, menu editor, map, crop và report.
- Sau mỗi batch, thu hẹp legacy allowlist. Chỉ bật guard cứng khi batch tương ứng đã hoàn thành.

## Automated testing strategy

- Backend là trọng tâm: bảo vệ happy path, dữ liệu không hợp lệ, quyền truy cập, tính tiền/điểm,
  lifecycle voucher và các nhánh lỗi khó tái hiện bằng tay. Giữ regression hiện có và bổ sung theo bug
  hoặc rủi ro thực tế; không bắt buộc coverage phần trăm hay test mọi file.
- Chỉ dùng Vitest `node` và `static-contract`. Không chạy test tự động trên staging, database isolated
  hoặc dịch vụ thật; không tự tạo database/harness để lấp khoảng trống bằng chứng.
- Chạy pricing, validation, authorization policy, state transition và domain service thật. Mock chỉ ở
  Prisma/transaction, Redis, nhận session, thời gian và external adapter; dùng fixture tổng hợp cố định,
  không chọn món/voucher từ dữ liệu vận hành.
- Expected dùng ví dụ số hoặc quy tắc độc lập, không gọi chính calculator đang test để tính expected.
- Race test mô phỏng kết quả tranh chấp như `count: 0`, `P2002`, `P2034` để kiểm tra nhánh xử lý,
  retry và response. Fake không chứng minh database thật có lock, isolation, atomic rollback hay
  chống double-spend. Static artifact test cũng không chứng minh migration/RLS/constraint đã thực thi.
- Rate-limit test chạy policy thật với fake Redis có bộ đếm và thời hạn; kiểm tra ngưỡng, tách khóa,
  không gia hạn cửa sổ mỗi request và reset khi hết hạn. Không coi đó là bằng chứng Redis phân tán.
- Frontend chỉ test service gửi đúng payload, nhận/unwrap đúng response và giữ thông tin lỗi backend;
  giữ shared pure calculators và pure security không thuộc UI. Backend quyết định món/voucher có hợp
  lệ hay không; frontend không sao chép validation nghiệp vụ để thay server.
- UI/UX, render, hook/view, thao tác và accessibility kiểm tra tay. Thay đổi UI cần nêu bước nghiệm thu
  cho người dùng, không tự thêm DOM runner.
- Skill `tdd` sở hữu lane, mock boundary, oracle và cách ghi điều đã/chưa được chứng minh.
  Full suite chạy một lần trên final code/test tree theo `AGENTS.md`.
- Báo cáo cũ trong `.staging-test-runs/` vẫn được bỏ Git và không dùng làm fixture hay bằng chứng mới.
  Chiến lược test này không xóa database staging hoặc thay đổi quy trình deploy/migration.

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
