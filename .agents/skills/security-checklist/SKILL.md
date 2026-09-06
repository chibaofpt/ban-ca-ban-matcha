---
name: security-checklist
description: >
  Comprehensive Security Checklist for Next.js 16 + Supabase + Prisma before Production deployment.
  Trigger on: "security check", "security audit", "pre-production check", "checklist bảo mật", "audit security".
---

# BÁN CÁ BÁN MATCHA — COMPREHENSIVE SECURITY CHECKLIST

> Dành cho Next.js 16 · Supabase PostgreSQL · Prisma · Custom Auth (Jose).
> Đây là checklist chuẩn để rà soát bảo mật trước khi deploy lên Production.
> Developer (hoặc Agent) cần đảm bảo tất cả các hạng mục đều đạt (PASS) trước khi merge vào nhánh `main`.
>
> **Format mỗi item**: Risk → Check → Note (nếu có ngoại lệ được chấp nhận).

---

## CATEGORY 1 — Secrets & API Keys

- [ ] **S1: Supabase Service Role Key Exposed**
  - **Risk**: Lộ `service_role` key ra phía client → bypass toàn bộ RLS, chiếm quyền DB.
  - **Check**: Đảm bảo không có prefix `NEXT_PUBLIC_` cho key này. Tìm kiếm `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE`.

- [ ] **S2: .env Files In Git History**
  - **Risk**: Lộ key vĩnh viễn nếu đã lỡ commit.
  - **Check**: File `.env` và `.env.local` phải nằm trong `.gitignore` (pattern `.env*`) và chưa từng xuất hiện trong git history (`git log --all -- .env`).

- [ ] **S3: SMS API Key Client-side Leak (Phase 5)**
  - **Risk**: Key eSMS bị lộ ở client → Hacker dùng spam tin nhắn tốn tiền.
  - **Check**: Key `ESMS_API_KEY` và `ESMS_SECRET_KEY` tuyệt đối không được import vào các file `.tsx` (Client Components).

- [ ] **S4: Hardcoded Secrets**
  - **Risk**: Mật khẩu, JWT token, Bearer token bị gõ cứng vào source code.
  - **Check**: Search string `eyJhbGciOi` (JWT header), `Bearer ` xem có bị hardcode không. Tất cả phải qua `process.env`.

- [ ] **S5: Audit NEXT_PUBLIC_ Variables**
  - **Risk**: Những biến này bị compile vào JS ở browser — bất kỳ ai cũng đọc được.
  - **Check**: Rà soát các biến `NEXT_PUBLIC_GOONG_MAPTILES_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`. Cần whitelist domain trên provider để tránh bị lạm dụng.

- [ ] **S6: VAPID Keys (Push Notification)**
  - **Risk**: `NEXT_PUBLIC_VAPID_PUBLIC_KEY` bị dùng bởi domain lạ để subscribe push.
  - **Check**: VAPID public key chỉ hoạt động với origin của app. Đảm bảo Push subscription endpoint (`POST /api/push/subscribe`) chỉ nhận được endpoint từ browser của app (check `origin` header nếu cần). `VAPID_PRIVATE_KEY` tuyệt đối không được có prefix `NEXT_PUBLIC_`.

- [ ] **S7: CRON_SECRET**
  - **Risk**: Ai cũng có thể trigger cron job thủ công → spam DB operation hoặc cancel orders sai.
  - **Check**: `CRON_SECRET` phải được set và đủ mạnh (≥32 bytes random, dùng `openssl rand -base64 32`). Tất cả cron routes phải validate `Authorization: Bearer ${CRON_SECRET}` trước khi xử lý.

- [ ] **S8: Goong API Key Server-side Isolation**
  - **Risk**: `GOONG_API_KEY` (server-side) bị lộ → bị lạm dụng gọi API tốn quota/tiền.
  - **Check**: `GOONG_API_KEY` không được có prefix `NEXT_PUBLIC_`. Chỉ dùng trong `app/api/delivery/*`. Phân biệt rõ với `NEXT_PUBLIC_GOONG_MAPTILES_KEY` (map tiles — khác quota, cần domain restriction).

---

## CATEGORY 2 — Authentication, Authorization & Session

- [ ] **A1: Missing Auth Check Trên Protected Routes**
  - **Risk**: Gọi API nhạy cảm không cần đăng nhập.
  - **Check**: Mọi API mutation (POST, PUT, DELETE) trong `app/api/` phải có bước gọi `getSession()` hoặc verify JWT đầu tiên. Middleware xử lý tầng page, API routes tự verify.

- [ ] **A2: Role Verification (Staff / Admin)**
  - **Risk**: Customer gọi được API của Staff/Admin.
  - **Check**: Phải có logic `if (session.role !== "ADMIN") return 403` trong mọi route của Admin. Middleware enforce `/api/admin/*` và `/api/staff/*`.

- [ ] **A3: Session Revocation (Thu hồi quyền)**
  - **Risk**: Tài khoản bị khóa hoặc đổi mật khẩu nhưng thiết bị cũ vẫn dùng được.
  - **Check**: Access JWT phải chứa `sid`; mỗi request xác thực `sid + user_id + expires_at` trên DB
    và lấy role hiện tại. Logout xóa session trước khi clear cookie. Redis session key cũ chỉ được
    evict, không được dùng làm bằng chứng đăng nhập. Request đã qua check trước logout có thể hoàn tất.

- [ ] **A4: Supabase RLS Bypass**
  - **Risk**: Attacker chọc thẳng vào Supabase REST API không qua Next.js.
  - **Check**: Dùng cURL với `anon_key` gọi thẳng vào Supabase REST API. Đảm bảo RLS trả về `[]` thay vì lộ data. Procedure: `curl -H "apikey: {anon_key}" https://{project}.supabase.co/rest/v1/users`.

- [ ] **A5: Insecure Direct Object Reference (IDOR)**
  - **Risk**: Customer A có thể xem/hủy đơn hàng của Customer B bằng cách đoán order ID.
  - **Check**: Endpoint lấy/cập nhật đơn hàng phải luôn query kèm điều kiện `user_id = session.id`. Không bao giờ chỉ filter theo `order_id` đơn thuần.

- [ ] **A6: Account Enumeration**
  - **Risk**: Attacker dùng login endpoint để kiểm tra xem số điện thoại nào đã đăng ký.
  - **Check**: Login response cho user không tồn tại và ghost user phải **giống hệt nhau** về message và thời gian phản hồi (bcrypt compare luôn được chạy — timing-safe). **Design note**: Ghost user trả về message "yêu cầu đăng ký" là chấp nhận được vì đây là UX flow, không phải lỗ hổng critical.

- [ ] **A7: Session Limit & Cleanup**
  - **Risk**: Session không hết hạn → tài khoản cũ bị lợi dụng mãi mãi.
  - **Check**: `MAX_ACTIVE_SESSIONS = 5` enforced tại login. Cron `/api/cron/clean-sessions` chạy định kỳ để xóa expired sessions. Refresh token TTL = 7 ngày.

- [ ] **A8: Refresh Token Rotation**
  - **Risk**: Refresh token bị đánh cắp → attacker dùng vô thời hạn.
  - **Check**: Rotate refresh token ngay trên session row hiện có; không tạo session thay thế. Giữ
    đúng một `previous_refresh_token` trong grace/cooldown 30 giây để request đồng thời hội tụ về token
    thắng. Missing/deleted/expired row, binding sai hoặc conditional update không được xác nhận phải
    fail closed và tuyệt đối không làm session sống lại.

---

## CATEGORY 3 — CSRF & Data Input Validation

- [ ] **I1: Cross-Site Request Forgery (CSRF)**
  - **Risk**: Hệ thống dùng HTTP-only Cookie Auth, dễ bị tấn công CSRF nếu user bị dụ bấm link lạ.
  - **Check**: Cookie được set `SameSite=strict` (không phải `Lax`). API routes state-changing có thể verify header `Origin` hoặc `Referer` nếu cần tăng cường.

- [ ] **I2: Price & Negative Quantity Injection**
  - **Risk**: Client gửi order với giá 1đ hoặc quantity -10 để phá logic tính tiền.
  - **Check**: Server TUYỆT ĐỐI KHÔNG nhận field `price` từ client. Số lượng (`quantity`) phải được validate `> 0` bằng Zod. Server luôn re-fetch giá từ DB.

- [ ] **I3: XSS qua dangerouslySetInnerHTML**
  - **Risk**: Chèn mã độc hiển thị lên màn hình người khác.
  - **Check**: Chỉ dùng cho data an toàn (như JSON-LD hardcoded). Data từ database do Staff nhập (tên món, ghi chú) không được render bằng `dangerouslySetInnerHTML`.

- [ ] **I4: SQL Injection qua Prisma raw query**
  - **Risk**: Nối chuỗi string trực tiếp vào câu lệnh SQL thay vì bind tham số.
  - **Check**: Nếu có dùng `$queryRaw`, bắt buộc dùng Tagged Template Literal syntax (`` $queryRaw`SELECT...` ``), không dùng phép cộng chuỗi `+` hoặc `Prisma.sql`.

- [ ] **I5: OTP Format (Phase 5)**
  - **Risk**: Gửi mã OTP chứa ký tự đặc biệt (SQLi) hoặc quá dài gây tốn DB.
  - **Check**: Luôn validate RegEx `/^\d{6}$/` trước khi check DB.

- [ ] **I6: Delivery/Geocoding Input Validation**
  - **Risk**: Proxy Goong API với input không validate → gây lỗi, hoặc attacker inject giá trị sai vào API call.
  - **Check**: Tất cả params của `/api/delivery/*` (lat, lng, query, address) phải được validate bằng Zod trước khi forward đến Goong API. `lat`/`lng` phải là float trong range hợp lệ. `query` phải có `minLength(2)`, `maxLength(200)`.

---

## CATEGORY 4 — Rate Limiting & Resource Exhaustion

- [ ] **R1: Login / Auth Brute-force Protection**
  - **Risk**: Tool tự động thử mật khẩu hoặc spam gửi SMS liên tục gây tốn kém/lộ account.
  - **Check**: Upstash Redis Rate Limit trên `/api/auth/*` (10 req/60s/IP). Không dùng in-memory rate limiter khi deploy Serverless. Account lock sau 5 lần sai liên tiếp (15 phút).

- [ ] **R2: Order Creation Spam**
  - **Risk**: Tạo hàng nghìn đơn rác trong 1 giây gây phình DB.
  - **Check**: Rate limit endpoint `POST /api/orders` (ví dụ: 10 req/phút/user hoặc IP).

- [ ] **R3: Unbounded Queries (Denial of Service)**
  - **Risk**: Trả về hàng triệu record gây Out Of Memory (OOM) cho Vercel.
  - **Check**: Mọi `findMany` phải có `take`. Hai report giới hạn khoảng Gregorian tối đa 366 ngày,
    đọc từng trang 100 row trong RepeatableRead timeout 10 giây và từ chối trên 10.000 row bằng
    `422 REPORT_RANGE_TOO_LARGE`; không tính tổng trên dữ liệu bị cắt.

- [ ] **R4: Voucher Exchange Spam**
  - **Risk**: Spam đổi voucher liên tục gây race condition hoặc phình `points_log`.
  - **Check**: Rate limit `POST /api/profile/vouchers/exchange` (ví dụ: 5 req/phút/user).

- [ ] **R5: Push Subscribe Spam**
  - **Risk**: Attacker đăng ký hàng nghìn push endpoint giả → tốn DB storage, slow down push delivery.
  - **Check**: Rate limit `POST /api/push/subscribe`. Logic `upsert` hiện tại đã giảm thiểu duplicate, nhưng cần rate limit nếu endpoint bị gọi tự động.

- [ ] **R6: Delivery/Geocoding Proxy Rate Limit**
  - **Risk**: Mỗi request proxy đến Goong tốn quota. Attacker spam autocomplete gây cạn quota/tiền.
  - **Check**: Rate limit `/api/delivery/*` endpoints. Ít nhất debounce ở frontend (đã có), tốt hơn là rate limit ở backend theo IP.

- [ ] **R7: Report Rate Limit**
  - **Risk**: Cùng một tài khoản spam hai route report để nhân đôi tải database.
  - **Check**: `/api/admin/report` và `/api/report` dùng chung bucket 6 request/phút/account, trả 429
    kèm `Retry-After`. Redis lỗi giữ fail-open theo quyết định sản phẩm; đây không phải bảo đảm chống
    DDoS tuyệt đối.

---

## CATEGORY 5 — Race Conditions & Points

- [ ] **RC1: Double-spend Voucher**
  - **Risk**: Bắn 2 request dùng voucher cùng 1 mili-giây, cả 2 đều thành công.
  - **Check**: Re-fetch eligibility và conditional claim expected state trong cùng Serializable
    transaction với order write; retry `P2034` có giới hạn. Không dựa vào preflight hoặc mock race như
    bằng chứng database thật đã khóa/rollback đúng.

- [ ] **RC2: Points Race Condition & Hoàn tiền**
  - **Risk**: Khách spam đổi voucher gây âm điểm, hoặc hủy đơn không bị trừ lại điểm đã nhận.
  - **Check**: Thao tác trừ/cộng điểm trong `points_log` phải atomic. Khi hủy đơn, hệ thống phải insert row âm (reversal). `points_log` là immutable — never UPDATE, only INSERT.

- [ ] **RC3: Multi-step writes ngoài Transaction**
  - **Risk**: Tạo đơn hàng thành công nhưng cập nhật voucher thất bại → DB lỗi logic nửa vời.
  - **Check**: Customer và Staff phải đọc menu/pricing/user/voucher được tiêu thụ và ghi order, claim
    voucher, điểm trong cùng retryable Serializable transaction. External fulfillment và auto-grant
    issuance được phép là preflight riêng; voucher được cấp có thể tồn tại nếu checkout sau đó lỗi.

---

## CATEGORY 6 — Business Logic & File Upload

- [ ] **B1: File Upload Security (Supabase Storage)**
  - **Risk**: Admin tải lên file `.svg` chứa JS độc hại hoặc upload file nặng 5GB.
  - **Check**: Backend validate MIME type (whitelist: `image/jpeg`, `image/png`, `image/webp`) và giới hạn size (`< 5MB`) trước khi đẩy vào Supabase Storage. Không tin vào `Content-Type` từ client — validate từ file header.

- [ ] **B2: ID sinh mã (QR Token)**
  - **Risk**: Token của voucher/QR dễ đoán, người khác quét trộm được.
  - **Check**: `qr_token` dùng `gen_random_uuid()` DB-generated. Không bao giờ expose `users.id` hay `vouchers.id` raw ra ngoài API response.

- [ ] **B3: Tiền âm & Float Math**
  - **Risk**: Xử lý tiền VND bằng số thập phân (float) dẫn đến sai số làm tròn.
  - **Check**: Mọi phép tính tiền tệ luôn dùng Integer VND. Kết quả cuối ceil đến 1,000 VND gần nhất. Discount phải luôn `>= 0` (không bao giờ negative total).

- [ ] **B4: Max Order Value Cap**
  - **Risk**: Lỗ hổng logic khiến user tạo đơn hàng trị giá hàng Tỷ VND làm tràn kiểu dữ liệu hoặc lỗi business.
  - **Check**: Backend phải chặn giá trị đơn hàng vượt trần đã duyệt và trả stable business error. Xác minh bằng code/test hiện tại, không lưu implementation status trong skill.

- [ ] **B5: Soft Delete Integrity**
  - **Risk**: Hard delete menu item trong khi có voucher hoặc order đang active reference đến nó.
  - **Check**: Menu item chỉ được soft-delete (`is_available = false`). Kiểm tra `reference_latte_item_id` trước khi bất kỳ thay đổi nào. Không bao giờ dùng `prisma.menuItem.delete()`.

---

## CATEGORY 7 — HTTP Security Headers & CORS

- [ ] **IN1: X-Frame-Options**
  - **Risk**: Clickjacking — trang bị nhúng vào iframe của trang lạ.
  - **Check**: Xác minh response có chính sách chống framing phù hợp (`X-Frame-Options` hoặc CSP `frame-ancestors`).

- [ ] **IN2: X-Content-Type-Options**
  - **Risk**: Browser đoán MIME type của response → MIME-sniffing attack.
  - **Check**: Header `X-Content-Type-Options: nosniff` phải có mặt.

- [ ] **IN3: Content-Security-Policy (CSP)**
  - **Risk**: Không có CSP → XSS dễ dàng load script từ domain lạ.
  - **Check**: Thêm CSP header tối thiểu vào `next.config.ts`. Cho phép: `self`, Supabase storage domain, Google Fonts (nếu dùng). Chặn: `unsafe-eval`, `unsafe-inline` cho script (dùng nonce nếu cần).
  - **Note**: CSP nonce tích hợp Next.js 15+ — xem docs chính thức. Bắt đầu với `report-only` mode khi triển khai lần đầu.

- [ ] **IN4: Strict-Transport-Security (HSTS)**
  - **Risk**: User bị downgrade từ HTTPS xuống HTTP qua MITM.
  - **Check**: Header `Strict-Transport-Security: max-age=63072000; includeSubDomains` trên production. Chỉ áp dụng khi `NODE_ENV === "production"`.

- [ ] **IN5: Referrer-Policy**
  - **Risk**: URL đầy đủ (kể cả query params chứa token) bị gửi đến bên thứ 3 qua Referer header.
  - **Check**: `Referrer-Policy: strict-origin-when-cross-origin`.

- [ ] **IN6: Permissions-Policy**
  - **Risk**: Browser API không cần thiết (camera, microphone trên desktop) bị kích hoạt.
  - **Check**: `Permissions-Policy: camera=(), microphone=(), geolocation=()`. Ngoại lệ: cho phép camera trên `/staff/*` nếu dùng QR scanner.

- [ ] **IN7: CORS Policy**
  - **Risk**: Cho phép bất kỳ website ngoài nào gọi lấy dữ liệu có xác thực.
  - **Check**: API không được trả về `Access-Control-Allow-Origin: *` với những request có mang cookie xác thực. Next.js App Router mặc định không set CORS — chỉ cần đảm bảo không add `*` thủ công.

---

## CATEGORY 8 — Data Privacy & Logging

- [ ] **DP1: Lộ PII lên Sentry (Data Scrubbing)**
  - **Risk**: Sentry tự động bắt lỗi và gửi nguyên cục request body (chứa password, mã OTP, số điện thoại khách).
  - **Check**: Xác minh cấu hình Sentry hiện hành scrub password, phone, token, cookies, identifiers và vị trí nhạy cảm trước khi gửi.

- [ ] **DP2: Debug Logs trong Production**
  - **Risk**: Lộ PII khách hàng và internal state trên Vercel Runtime Logs.
  - **Check**: Rà soát toàn bộ `console.log` trong `app/api/`. Chỉ được log IDs (`orderId`, `userId`) và trạng thái logic — tuyệt đối không log toàn bộ user object, request body, hay tokens. **Cụ thể**: Xoá các `console.log("[PUT] STEP X...")` trong `admin/menu/[id]/route.ts` trước khi deploy production.

- [ ] **DP3: Error Response Không Lộ Schema**
  - **Risk**: Server lỗi 500 trả thẳng Prisma error message chứa tên bảng, tên cột ra frontend.
  - **Check**: Tất cả `catch` blocks trong API routes phải return `{ error: "Internal Server Error", code: "INTERNAL_ERROR" }`. Prisma error chỉ được `console.error` ở server — không bao giờ forward ra client.

---

## CATEGORY 9 — Next.js & Vercel Infrastructure

- [ ] **NX1: Mutation bằng GET request**
  - **Risk**: GET có thể bị browser/Next.js tự động cache, prefetch hoặc crawler gọi làm thay đổi dữ liệu.
  - **Check**: Mọi hành động làm thay đổi DB phải dùng POST, PUT, DELETE. Ngoại lệ: cron route dùng GET là an toàn vì đã có CRON_SECRET guard.

- [ ] **NX2: Serverless Timeout & Transaction Risk**
  - **Risk**: Vercel giới hạn function ở 10s (Hobby) hoặc 60s (Pro). Call API bên thứ 3 quá lâu làm đứt gãy giữa chừng transaction.
  - **Check**: Các tác vụ nặng/bên thứ 3 (push notification, SMS) phải chạy ngầm dạng fire-and-forget sau khi đã response (`.then(...).catch(...)`). Không bao giờ `await` chúng trong luồng chính response.

- [ ] **NX3: Sensitive Routes Không Có Trong Middleware Matcher**
  - **Risk**: Thêm route mới mà quên thêm vào `middleware.ts` matcher → route không được protect.
  - **Check**: Khi thêm route admin/staff mới, phải đồng thời thêm vào `config.matcher` trong `middleware.ts`. Review matcher sau mỗi feature mới.

---

## CATEGORY 10 — Cron & Background Jobs

- [ ] **CR1: CRON_SECRET Enforcement**
  - **Risk**: Cron endpoint bị gọi thủ công hoặc bởi attacker → trigger operations ngoài schedule.
  - **Check**: Mọi route trong `app/api/cron/` phải validate `Authorization: Bearer ${CRON_SECRET}` là bước đầu tiên, trước bất kỳ logic nào. Nếu `CRON_SECRET` không set → trả 500, không trả 200.

- [ ] **CR2: Cron Handler Phải Idempotent**
  - **Risk**: Cron chạy 2 lần (retry sau timeout) → cancel order 2 lần, restore voucher 2 lần.
  - **Check**: Mọi cron handler phải safe khi gọi nhiều lần: check trạng thái hiện tại trước khi update, dùng điều kiện WHERE để tránh double-update.

- [ ] **CR3: Cleanup Debug/Test Endpoints Trước Production**
  - **Risk**: Test endpoints (như `/api/push/test`) tồn tại trong production → attack surface không cần thiết.
  - **Check**: Rà soát tất cả endpoints trong `app/api/`. Xoá hoặc disable (404) mọi endpoint chỉ dùng cho dev/testing.

---

## CATEGORY 11 — Third-party API Proxying

- [ ] **TP1: Server-side Key Isolation**
  - **Risk**: API key bên thứ 3 bị expose qua bundle JS client.
  - **Check**: `GOONG_API_KEY` (geocoding) chỉ dùng trong server-side API routes. Frontend không bao giờ gọi trực tiếp Goong — luôn đi qua `/api/delivery/*` proxy.

- [ ] **TP2: Proxy Input Validation**
  - **Risk**: Attacker inject giá trị bất kỳ vào request proxy → gây lỗi phía Goong hoặc tiêu tốn quota vô ích.
  - **Check**: Validate tất cả input trước khi forward: `lat`/`lng` phải là số trong range hợp lệ, `query` phải có `min(2)` và `max(200)` chars, không có ký tự injection.

- [ ] **TP3: Proxy Error Không Lộ Upstream Details**
  - **Risk**: Khi Goong API trả lỗi, forward nguyên message lên client → lộ upstream URL, key hint, hoặc internal structure.
  - **Check**: Bắt lỗi từ upstream API và chỉ trả về error message generic: `{ error: "Địa chỉ không hợp lệ", code: "GEOCODING_FAILED" }`.

---

## CATEGORY 12 — Operational Readiness

- [ ] **OR1: Sentry Error Monitoring**
  - **Risk**: Lỗi production không được phát hiện → downtime không biết, data loss không hay.
  - **Check**: `sentry.server.config.ts` và `sentry.client.config.ts` phải tồn tại và có `dsn` từ `process.env.SENTRY_DSN`. Cấu hình `beforeSend` để scrub PII. Tích hợp Vercel → Sentry để link deployment với errors.

- [ ] **OR2: npm Dependency Audit**
  - **Risk**: Thư viện npm cũ có chứa lỗ hổng bảo mật đã công bố.
  - **Check**: Chạy `npm audit --production` trước mỗi deploy. Khắc phục tất cả cảnh báo ở mức `high` và `critical`. Chú ý đặc biệt: `axios`, `next`, `jose`, `@upstash/redis`.

- [ ] **OR3: Lockfile Consistency**
  - **Risk**: Dev cài thư viện version A, Vercel build dùng version B → lỗi không đồng bộ.
  - **Check**: Luôn commit `package-lock.json`. Vercel build phải dùng `npm ci` (không phải `npm install`). Kiểm tra Vercel build settings.

- [ ] **OR4: Environment Variables Trên Vercel**
  - **Risk**: Quên set env var → app crash ngay lần deploy đầu.
  - **Check**: Trước khi deploy, đối chiếu tất cả keys trong `.env.local.example` với Vercel Dashboard → Settings → Environment Variables. Đảm bảo staging và production dùng **database riêng biệt** (Upstash Redis, Supabase project riêng).

- [ ] **OR5: Vercel Cron Schedule**
  - **Risk**: `vercel.json` cron schedule sai → orders không được auto-cancel, sessions không được cleanup.
  - **Check**: `vercel.json` phải có đúng cron paths và schedule. Sau deploy, kiểm tra Vercel Dashboard → Cron Jobs để xác nhận các jobs đang active.

---

## PHỤ LỤC — Khi Thêm Tính Năng Mới

> Áp dụng mini-checklist này mỗi khi implement feature mới để không bỏ sót bảo mật.

### New API Route
- [ ] Zod validate input trước bất kỳ DB access nào
- [ ] `getSession()` trước business logic
- [ ] Role check rõ ràng (`CUSTOMER` / `STAFF` / `ADMIN`)
- [ ] Multi-step DB trong `prisma.$transaction()`
- [ ] Response là `{ data: T }` hoặc `{ error, code }` — không expose internal error
- [ ] Thêm route vào `middleware.ts` matcher nếu cần protect
- [ ] Cân nhắc rate limit nếu endpoint có thể bị spam

### New External Service Integration
- [ ] API key ở server-side, không bao giờ `NEXT_PUBLIC_`
- [ ] Wrapper/adapter trong `lib/` — không import SDK trực tiếp vào component
- [ ] Input validation trước khi gọi upstream
- [ ] Error từ upstream không bao giờ forward nguyên văn ra client
- [ ] Thêm key vào `.env.local.example`

### New Cron Job
- [ ] `CRON_SECRET` validation là bước đầu tiên
- [ ] Logic phải idempotent (safe khi chạy nhiều lần)
- [ ] Thêm vào `vercel.json` với schedule đúng
- [ ] Kiểm tra Vercel Dashboard sau deploy

### New File Upload Feature
- [ ] MIME type whitelist server-side (không tin client Content-Type)
- [ ] Size limit enforce server-side
- [ ] Upload qua `lib/storage.ts` wrapper — không dùng Supabase SDK trực tiếp
- [ ] Filename sanitize (tránh path traversal)
