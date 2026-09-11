# Bạn Cá Bán Matcha — Current Architecture Specification

> **Authority:** kiến trúc được chấp nhận, dependency direction, shared abstractions và UI consistency.
> **Read when:** lập kiến trúc/plan, thêm shared component, đổi data flow hoặc chọn UI pattern.
> **Update when:** kiến trúc, integration boundary hoặc project-wide UI standard thay đổi.
> **Does not own:** endpoint payload chi tiết, physical DB fields hoặc domain rules pricing/order/voucher.

Tài liệu này mô tả hệ thống đang được hỗ trợ, không phải kiến trúc lý tưởng trong tương lai. Legacy exception được phép tồn tại nhưng không được copy sang code mới.

## Đọc theo phạm vi

| Cần quyết định | Đọc |
|---|---|
| Layer, dependency, integration | Runtime architecture + Business consistency boundaries bên dưới |
| Primitive, overlay stack, form | UI system bên dưới + mobile-ux |
| Menu/editor/upload/ProductModal | [Catalog UI](docs/specs/catalog-ui.md) |
| Wallet, voucher detail/claim, admin wizard | [Voucher UI](docs/specs/voucher-ui.md) |
| Cart source model, BUNDLE setup, POS recovery | [Cart và POS](docs/specs/cart.md) |
| Cách duy trì spec/harness | [Spec registry](docs/specs/README.md) |

## Voucher nhiều lựa chọn

Feature specification nằm tại [Voucher UI](docs/specs/voucher-ui.md); cart transitions và persistence
nằm tại [Cart và POS](docs/specs/cart.md). Chỉ nạp file có behavior đang thay đổi.

## Runtime architecture

Stack: Next.js 16 App Router, React 19, TypeScript strict; Prisma + Supabase PostgreSQL;
custom phone/password auth bằng jose/httpOnly cookies; Axios transport + TanStack Query server-state,
Zustand chỉ cho cart; Supabase Storage `menu-images`; QR qua qrcode/html5-qrcode adapters; Sentry,
Vercel; Upstash cho cache-aside public reads và distributed security rate limits. UI stack nằm ở mục UI system.

```text
Client page/view -> feature container/hook -> frontend service -> API route
                           |                                      |
                           +-> shared UI                           +-> optional Redis cache-aside
                                                                        |
                                                                        +-> lib domain workflow
                                                                             |
                                                                             +-> Prisma data access
                                                                             +-> external adapter

Server page/layout -----------------------> lib read workflow -------> Prisma
```

- `app/` sở hữu routing, layouts, metadata và HTTP entry points.
- `src/views/` sở hữu page composition. Feature container/hook sở hữu state, loading và lifecycle
  phía client; chúng gọi hàm service đã export, không sở hữu URL hoặc HTTP client.
- `src/components/ui/` chỉ chứa primitive dùng chung; không gọi service, không biết API URL và không chứa domain rule.
- `src/services/` là frontend HTTP boundary: sở hữu API URL, Axios calls và DTO mapping. Mọi
  client request đi qua một `apiClient` tại `src/lib/api/client.ts`.
- `app/api/**/route.ts` là HTTP controller mỏng: parse/validate, auth, gọi workflow và map response.
- `lib/` là server-only, sở hữu domain workflow, Prisma data access và adapter cho dịch vụ ngoài.
  Phần giao tiếp database gọi là **data access boundary**; chỉ tách repository/query module khi query
  được dùng lại hoặc việc tách làm transaction và ownership rõ hơn.
- Prisma schema và migrations là physical database truth. `SCHEMA.md` chỉ giải thích semantics/invariants.

Server Component đọc dữ liệu qua `lib/` trực tiếp, không gọi vòng qua HTTP nội bộ. Client code
không import `lib/`, Prisma hoặc server adapter.

Không thực hiện repo-wide layer refactor khi sửa feature. Direct API call ngoài service, oversized route/component và page entry có logic đang tồn tại là legacy exception: giữ nguyên nếu ngoài scope, không dùng làm mẫu cho code mới.
Không tách backend khỏi fullstack Next.js nếu chưa có migration riêng được architect duyệt.

### Data-backed feature path

Một feature có dữ liệu đi qua các ranh giới sau; chỉ tạo hoặc sửa lớp mà behavior thực sự cần:

1. **Persistence:** Prisma schema/migration định nghĩa cách lưu khi data semantics thay đổi.
2. **Data access:** hàm server-only dùng Prisma hoặc transaction client để query/write; không trả
   Prisma model thẳng ra UI.
3. **Domain workflow:** áp dụng business rule, authorization thuộc nghiệp vụ và transaction boundary.
4. **API route:** nhận HTTP input, validate/authenticate, gọi workflow và trả contract trong `API.md`.
5. **Frontend service:** giữ URL, gọi Axios qua `apiClient`, unwrap envelope, map DTO và transport error.
6. **UI orchestration:** TanStack Query quản lý remote server state; `queryFn`/`mutationFn` chỉ gọi
   service, còn view/container/hook quản lý state thuần UI. `useEffect` chỉ gọi service cho lifecycle
   synchronization không phù hợp với query/mutation và vẫn phải xử lý cancel hoặc stale response.
7. **Leaf UI:** nhận data và callback qua props; không biết URL, Axios, API envelope hay Prisma.

Luồng đọc đi từ UI xuống các boundary rồi response đi ngược lên. Luồng ghi cũng đi cùng đường và
server luôn revalidate dữ liệu; customer/staff có thể dùng route khác nhau nhưng dùng chung domain
workflow khi cùng business rule.

### Client server-state

Root layout cung cấp một shared TanStack Query client. Cache, loading/error, retry/refetch và mutation
invalidation của dữ liệu từ server thuộc Query; Axios/service chỉ sở hữu HTTP transport và DTO.
Query key phải ổn định, có prefix theo audience/domain và tái sử dụng constant hiện có. Auth transition
xóa private customer/staff/admin query caches nhưng giữ public menu/catalog caches. Inline key và direct
`apiClient` đang tồn tại là legacy exception; không dùng làm mẫu cho code mới.

### Server cache boundary

Upstash Redis đang chạy cache-aside cho bốn public reads: menu, powders, store status và voucher
packages. `lib/redis.ts` là adapter duy nhất; `lib/cache.ts` sở hữu key/TTL; admin writes gọi
`lib/cacheInvalidation.ts` sau khi database write thành công. Cache miss hoặc Redis failure đọc từ
database; database vẫn là source of truth và TTL là safety net nếu invalidation thất bại.

Redis rate-limit counters dùng namespace riêng và policy trong `API.md`. Legacy session keys chỉ được
evict; PostgreSQL session state vẫn là authorization authority. Không thêm cache cho route khác hoặc
đặt business correctness phụ thuộc Redis nếu chưa có task kiến trúc duyệt scope và invalidation.

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
- Redis-backed reads fallback database và security rate limits giữ fail-open khi hạ tầng lỗi theo
  quyết định sản phẩm; không bảo đảm chống DDoS tuyệt đối. Auth/session checks vẫn fail-closed; logs
  chỉ chứa metadata đã loại secret.
- GET handlers are read-only. Scheduled lifecycle work runs through authenticated cron routes;
  customer voucher reconciliation is an explicit POST before a wallet read.
- External SDK luôn nằm sau wrapper/adapter để UI và business logic không phụ thuộc trực tiếp nhà cung cấp.

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

Flow cần điều phối nhiều surface có thể opt-in bằng `OverlayStackProvider` tại composition boundary.
Provider giữ registration ổn định trong lúc surface mở; surface có layer `critical` đứng trên
`nested`, rồi `base`, và cùng layer ưu tiên registration mở sau cùng. Chỉ surface trên cùng được
xử lý Escape, backdrop, swipe và nút đóng. `ResponsiveOverlay` truyền parent scope qua content và
footer (React portal vẫn giữ context), để `AdaptiveSelect` trong overlay dùng `Drawer.NestedRoot`
trên mobile và nested layer popover trên desktop. Flow ngoài provider tiếp tục chạy standalone như
trước; không dùng Zustand hoặc history thủ công để điều phối stack.

Authentication dùng centered Radix dialog ở layer `critical` trên mọi breakpoint. Dialog đăng nhập được mount toàn cục, phủ lên nhưng không đóng page, cart hoặc voucher sheet đang hoạt động và sở hữu focus trên cùng. Hủy chỉ đóng auth, còn đăng nhập thành công trả quyền điều khiển cho surface nền để tiếp tục intent đã yêu cầu.

Overlay layer chỉ có `base`, `nested`, `critical`. Không tạo z-index tùy ý cho overlay mới.

Button dùng variants `primary`, `secondary`, `outline`, `ghost`, `destructive`. Option card/tab có thể là specialized control nhưng vẫn phải có semantic button và focus state.

## Legacy UI migration policy

- Existing direct Radix/Vaul imports và manual overlays là legacy, không phải API mẫu.
- Migrate theo từng flow có kiểm tra contract liên quan và nghiệm thu UI thủ công; không mass-replace modal, button hoặc form.
- Low-risk trước: local toast, adaptive select và simple admin/auth overlays.
- High-risk tách riêng: product, cart/staff cart, QR, menu editor, map, crop và report.
- Sau mỗi batch, thu hẹp legacy allowlist. Chỉ bật guard cứng khi batch tương ứng đã hoàn thành.

## Automated testing strategy

[tdd](.agents/skills/tdd/SKILL.md) sở hữu test lane, mock boundary, oracle và claims proved/not proved.
[AGENTS](AGENTS.md#verification) sở hữu load predicate và final verification gate.
UI/UX cần manual acceptance; không thêm DOM runner hoặc live DB harness cho bộ test dự án.

Báo cáo cũ trong `.staging-test-runs/` vẫn được bỏ Git, không dùng làm fixture hay bằng chứng mới.
Chiến lược test không xóa database staging hoặc thay quy trình deploy/migration.

## Resource registry

[AGENTS — Completion resource gate](AGENTS.md#completion-resource-gate) sở hữu quy tắc cập nhật.
Feature specs được định tuyến ở đầu file; không thêm bản sao domain/API/schema ở đây.
