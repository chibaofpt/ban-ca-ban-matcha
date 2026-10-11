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
| Quà đăng ký, hộp matcha, admin reward campaign | [Reward UI](docs/specs/reward-ui.md) |
| Cart source model, BUNDLE setup, POS recovery | [Cart và POS](docs/specs/cart.md) |
| Order cards/detail, delivery recipient và address form | [Order UI](docs/specs/order-ui.md) |
| Admin Users, customer detail/actions/orders/wallet | [Admin customer management](docs/specs/admin-customer-management.md) |
| Cách duy trì spec/harness | [Spec registry](docs/specs/README.md) |

## Voucher nhiều lựa chọn

Feature specification nằm tại [Voucher UI](docs/specs/voucher-ui.md); cart transitions và persistence
nằm tại [Cart và POS](docs/specs/cart.md). Chỉ nạp file có behavior đang thay đổi.

## Quà chào mừng

Customer reveal, defer/resume và Admin campaign UI nằm tại
[Reward UI](docs/specs/reward-ui.md). Business lifecycle thuộc
[voucher-flow](.agents/skills/voucher-flow/references/lifecycle.md#welcome-reward-and-gacha), API
thuộc [API](API.md#customer-welcome-reward), và dữ liệu thuộc
[SCHEMA](SCHEMA.md#welcome_reward_settings).

## Runtime architecture

Stack: Next.js 16 App Router, React 19, TypeScript strict; Prisma + Supabase PostgreSQL;
custom Google identity + legacy phone/password auth bằng jose/httpOnly cookies; Axios transport + TanStack Query server-state,
Zustand chỉ cho cart; Supabase Storage `menu-images`; QR qua qrcode/html5-qrcode adapters; Sentry,
Vercel; Upstash cho cache-aside public reads và distributed security rate limits. UI stack nằm ở mục UI system.

```text
Client page/view -> feature container/hook -> frontend service -> API route
                           |                     |                |
                           +-> shared UI         +-- contracts/ --+-> optional Redis cache-aside
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
- `contracts/` sở hữu type/schema của API wire shape được frontend service và API route dùng chung;
  nó không sở hữu HTTP transport, service orchestration, persistence hoặc business rule.
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
4. **API route:** nhận HTTP input, validate/authenticate, gọi workflow và trả wire shape được định nghĩa
   trong `contracts/` theo behavior contract tại `API.md`.
5. **Frontend service:** giữ URL, gọi Axios qua `apiClient`, dùng shared wire shape, unwrap envelope,
   map DTO và transport error.
6. **UI orchestration:** TanStack Query quản lý remote server state; `queryFn`/`mutationFn` chỉ gọi
   service, còn view/container/hook quản lý state thuần UI. `useEffect` chỉ gọi service cho lifecycle
   synchronization không phù hợp với query/mutation và vẫn phải xử lý cancel hoặc stale response.
7. **Leaf UI:** nhận data và callback qua props; không biết URL, Axios, API envelope hay Prisma.

Welcome reward đi đúng đường này: account activation tạo entitlement trong transaction; customer và
Admin orchestration dùng TanStack Query qua domain service. Reward reveal nằm trong managed overlay,
và mở voucher wallet bằng callback của composition boundary thay vì gọi transport từ leaf UI.

Luồng đọc đi từ UI xuống các boundary rồi response đi ngược lên. Luồng ghi cũng đi cùng đường và
server luôn revalidate dữ liệu; customer/staff có thể dùng route khác nhau nhưng dùng chung domain
workflow khi cùng business rule.

### Client server-state

Root layout cung cấp một shared TanStack Query client. Cache, loading/error, retry/refetch và mutation
invalidation của dữ liệu từ server thuộc Query; Axios/service chỉ sở hữu HTTP transport và DTO.
Query key phải ổn định, có prefix theo audience/domain và tái sử dụng constant hiện có. Auth transition
xóa private customer/staff/admin query caches nhưng giữ public menu/catalog caches. Inline key và direct
`apiClient` đang tồn tại là legacy exception; không dùng làm mẫu cho code mới.

### Order Realtime

Admin/staff shell owns one private Supabase Broadcast channel `orders:operations` through
`OrderRealtimeProvider` and `orderRealtimeService`. Receive-only capabilities are issued by the
[Realtime token endpoint](API.md#get-apirealtimeorderstoken), using an ES256 key imported into the
same Supabase project. App authentication remains custom cookie auth; no Supabase Auth login.

`lib/orderRealtime.ts` sends an empty `orders_changed` signal through the REST Broadcast API after
committed create, confirm, status/cancel and auto-cancel writes. Route writes use `after()`; cron
emits once per successful batch. No server websocket, row payload, order-table client grants, or
order-table publication is needed for this REST Broadcast path. Platform receive policy is maintained
in [configure-order-realtime.sql](scripts/configure-order-realtime.sql); application schema stays Prisma-owned.

Signals are coalesced and invalidate the admin/staff orders prefixes, including badge queries.
First subscribe, reconnect, returning to the foreground and network restoration refresh via the
existing authorized API/service path. JWT renewal checks the current app session/role; failed renewal
disposes the old connection. Cleanup removes the exact channel, timers and browser listeners.

Healthy subscriptions retain only a 5-minute safety refresh because delivery is best-effort after
commit. Disconnection or missing configuration retains the existing list/badge polling cadence.
Web push remains a separate background notification channel. Per-environment URL, publishable key
and server signing JWK belong to [.env.local.example](.env.local.example).
Rationale: [private order signals](docs/decisions/0005-private-order-realtime.md).

### Server cache boundary

Upstash Redis đang chạy cache-aside cho bốn public reads: menu, powders, store status và voucher
packages. `lib/redis.ts` là adapter duy nhất; `lib/cache.ts` sở hữu key/TTL; admin writes gọi
`lib/cacheInvalidation.ts` sau khi database write thành công. Cache miss hoặc Redis failure đọc từ
database; database vẫn là source of truth và TTL là safety net nếu invalidation thất bại.

Redis rate-limit counters dùng namespace riêng và policy trong `API.md`. Legacy session keys chỉ được
evict; PostgreSQL session state vẫn là authorization authority. Không thêm cache cho route khác hoặc
đặt business correctness phụ thuộc Redis nếu chưa có task kiến trúc duyệt scope và invalidation.

OTP đăng ký khách hàng dùng namespace Redis riêng cho admission, lịch chờ, idempotency và quota
theo môi trường. Redis lỗi thì chặn gửi có phí và
không fallback vào bộ nhớ Function. Prisma sở hữu cấu hình bật/tắt toàn hệ thống và challenge OTP;
consume challenge cùng transaction tạo/claim khách, quà chào mừng và session. Đây là scope state
bảo mật đã duyệt cho đăng ký, không mở rộng Redis cache-aside hoặc nguồn xác thực session.
Policy thuộc [API Google account access](API.md#google-account-access), semantics thuộc
[SCHEMA](SCHEMA.md#otp_attempts--registration-otp). Hostname allowlist do Cloudflare Turnstile widget settings quản lý; server xác minh token/action
qua Siteverify, không giữ một hostname env riêng. Turnstile và ABENLA nằm sau adapter; fallback
Turnstile khi dịch vụ lỗi vẫn bắt buộc qua quota OTP.
Client Upstash vẫn chỉ được tạo trong `lib/redis.ts`. Client riêng cho OTP dùng timeout HTTP
và không retry; client cache/limiter tổng quát giữ policy hiện có. Admission giữ row lock cấu hình
trong transaction không retry khi gọi Redis, rồi chỉ dispatch provider sau transaction commit.
Redis reservation đã xảy ra nhưng transaction lỗi được giữ lại; không tự hoàn quota hoặc gửi lại.
CSP giữ nonce và bổ sung đúng nguồn Google GIS/Cloudflare cần cho widget. Google ID token được xác minh server-side qua jose/JWKS; không lưu Google access/refresh token. OTP chỉ dùng cho trùng legacy ghost đủ điều kiện; admin quản lý công tắc/quota và số dư trong Cài đặt.

Modal login và trang nhận tài khoản chuẩn bị Google bằng signed proof ngắn hạn trước CAPTCHA,
không tạo DB attempt ở bước mở UI. CLAIM còn gắn hash của link/context và actor/session/credentials
nếu đã đăng nhập, không kéo dài hạn link. Proof dùng key tách purpose từ `JWT_SECRET`; exchange consume vào bảng Google
proof hiện có trong cùng transaction với account/session. Contract và compatibility thuộc
[API Google account access](API.md#google-account-access); tương tác widget và form hai bước thuộc
[Account access](docs/specs/account-access.md#login-modal).

Google GIS, tạo challenge và xác minh audience dùng chung `NEXT_PUBLIC_GOOGLE_CLIENT_ID` trong
mỗi môi trường; đây là public identifier. Env inventory thuộc [.env.local.example](.env.local.example).
Đổi Client ID cần build/deploy mới vì Next.js đưa giá trị public vào browser bundle lúc build.

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
- Password change verifies the current bcrypt credential, conditionally replaces the old hash, revokes
  every other session and rotates the current session refresh token in one transaction. The stable
  session ID is retained; the previous token follows the existing 30-second rotation grace policy.
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

### Vietnamese phone input and display

`src/utils/phone.ts` owns shared normalization. Persisted phone numbers and API responses use
`+84xxxxxxxxx`; customer/admin/staff editable fields use ungrouped `0xxxxxxxxx` and display may
group local digits for readability. Accept full local, +84, 84 and legacy +840 formats with
spaces, dots, dashes or parentheses; keep invalid letters visible to validation. Server boundaries
normalize before existing domain-specific validation. Search supports canonical/local full numbers,
explicit local prefixes and existing suffix search without rewriting names/Instagram aliases.

### Account access UI

Google onboarding, legacy claim pages, Profile phone proof and manual acceptance are owned by
[Account access](docs/specs/account-access.md). Auth keeps the existing critical dialog and private
query-cache transition boundary. Admin claim content reuses the selected-customer overlay; provider
SDKs remain behind browser hooks/server adapters. Public phone registration UI is retired.

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

ResponsiveOverlay cho phép `backdropClassName` để giữ màu backdrop của flow; tùy chọn này chỉ đổi presentation, không đổi layer hoặc dismissal.

Flow cần điều phối nhiều surface có thể opt-in bằng `OverlayStackProvider` tại composition boundary.
Provider giữ registration ổn định trong lúc surface mở; surface có layer `critical` đứng trên
`nested`, rồi `base`, và cùng layer ưu tiên registration mở sau cùng. Chỉ surface trên cùng được
xử lý Escape, backdrop, swipe và nút đóng. `ResponsiveOverlay` truyền parent scope qua content và
footer (React portal vẫn giữ context), để `AdaptiveSelect` trong overlay dùng `Drawer.NestedRoot`
trên mobile và nested layer popover trên desktop. Flow ngoài provider tiếp tục chạy standalone như
trước; không dùng Zustand hoặc history thủ công để điều phối stack.

Authentication dùng centered Radix dialog ở layer `critical` trên mọi breakpoint. Dialog đăng nhập được mount toàn cục, phủ lên nhưng không đóng page, cart hoặc voucher sheet đang hoạt động và sở hữu focus trên cùng. Hủy chỉ đóng auth, còn đăng nhập thành công trả quyền điều khiển cho surface nền để tiếp tục intent đã yêu cầu.

Khi đăng ký tạo `GACHA PENDING`, auth dialog giữ layer `critical` và chuyển nội dung sang
[Reward UI](docs/specs/reward-ui.md). Reward mở lại từ wallet dùng nested overlay trong cùng stack;
profile mở standalone critical overlay. Cả hai dùng shared focus/dismiss policy bên trên.

Cart/voucher composition dùng parent scope thực qua content slot; controlled child giữ mounted tới onAfterClose. Khi đóng owner có managed product child, child đóng trước, parent chỉ đóng sau lifecycle child. Managed product child không thêm Browser History entry; legacy product paths giữ behavior hiện có.

Overlay layer chỉ có `base`, `nested`, `critical`. Không tạo z-index tùy ý cho overlay mới.

Button dùng variants `primary`, `secondary`, `outline`, `ghost`, `destructive`. Option card/tab có thể là specialized control nhưng vẫn phải có semantic button và focus state.

Nhãn size đồ uống trong UI dùng `SizeLabel`; khi cần ghép thành chuỗi, dùng `formatSizeLabel`. Enum `SMALL`/`MEDIUM`/`LARGE` chỉ thuộc data contract, không render trực tiếp cho người dùng.

ResponsiveOverlay exposes optional titleClassName and descriptionClassName for flow-specific text presentation; the shared overlay retains ownership of header structure and accessibility semantics.
Optional `bodyClassName` customizes body spacing/overflow for an explicitly bounded feature layout.
The default body remains scrollable. A feature opting out of scrolling must allocate available
height and shrink flexible media, while keeping its controls visible; [Admin claim layout](docs/specs/admin-customer-management.md#account-actions) owns that acceptance.

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
