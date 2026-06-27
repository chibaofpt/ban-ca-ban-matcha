---
name: security-checklist
description: >
  Comprehensive Security Checklist for Next.js 16 + Supabase + Prisma before Production deployment.
  Trigger on: "security check", "security audit", "pre-production check", "checklist bảo mật", "audit security".
---

# BÁN CÁ BÁN MATCHA — COMPREHENSIVE SECURITY CHECKLIST

> Dành cho Next.js 16 · Supabase PostgreSQL · Prisma · Custom Auth (Jose).
> Tệp này được sử dụng làm checklist chuẩn để rà soát bảo mật hệ thống trước khi deploy lên môi trường Production.
> Developer (hoặc Agent) cần đảm bảo tất cả các hạng mục dưới đây đều đạt (PASS) trước khi merge vào nhánh `main`.

---

## CATEGORY 1 — Secrets & API Keys
- [ ] **S1: Supabase Service Role Key Exposed**
  - **Risk**: Lộ `service_role` key ra phía client cho phép bypass toàn bộ RLS, chiếm quyền DB.
  - **Check**: Đảm bảo không có prefix `NEXT_PUBLIC_` cho key này. Tìm kiếm `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE`.
- [ ] **S2: .env Files In Git History**
  - **Risk**: Lộ key vĩnh viễn nếu đã lỡ commit.
  - **Check**: File `.env` và `.env.local` phải nằm trong `.gitignore` và chưa từng xuất hiện trong lịch sử git.
- [ ] **S3: SMS API Key Client-side Leak (Dành cho Phase 5)**
  - **Risk**: Key eSMS bị lộ ở client → Hacker dùng spam tin nhắn tốn tiền.
  - **Check**: Key `ESMS_API` hoặc `SPEEDSMS` tuyệt đối không được import vào các file `.tsx` (Client Components).
- [ ] **S4: Hardcoded Secrets**
  - **Risk**: Mật khẩu, JWT token, Bearer token bị gõ cứng vào source code.
  - **Check**: Search string `eyJhbGciOi` (JWT header), `Bearer ...` xem có bị hardcode không. Tất cả phải qua `process.env`.
- [ ] **S5: Audit NEXT_PUBLIC_ Variables**
  - **Risk**: Những biến này bị compile vào JS ở browser.
  - **Check**: Rà soát các biến `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `NEXT_PUBLIC_GOONG_MAPTILES_KEY`. Cần whitelist domain trên provider để tránh bị lạm dụng.

## CATEGORY 2 — Authentication, Authorization & Session
- [ ] **A1: Missing Auth Check Trên Protect Routes**
  - **Risk**: Gọi API nhạy cảm không cần đăng nhập.
  - **Check**: Mọi API mutation (POST, PUT, DELETE) trong `app/api/` phải có bước gọi `getSession()` hoặc verify JWT đầu tiên.
- [ ] **A2: Role Verification (Staff / Admin)**
  - **Risk**: Customer gọi được API của Staff/Admin.
  - **Check**: Phải có logic `if (session.role !== "ADMIN") return 403` trong mọi route của Admin.
- [ ] **A3: Session Revocation (Thu hồi quyền)**
  - **Risk**: Tài khoản bị khóa hoặc đổi mật khẩu nhưng thiết bị cũ vẫn dùng được.
  - **Check**: Khi user đổi mật khẩu/logout, bắt buộc phải xóa bản ghi `refresh_token` tương ứng trong bảng `sessions` ở database.
- [ ] **A4: Supabase RLS Bypass**
  - **Risk**: Attacker chọc thẳng vào Supabase REST API không qua Next.js.
  - **Check**: Dùng cURL gọi thẳng vào Supabase REST API kèm anon_key. Đảm bảo Row Level Security (RLS) trả về array rỗng `[]` thay vì lộ data.
- [ ] **A5: Insecure Direct Object Reference (IDOR)**
  - **Risk**: Customer A có thể xem/hủy đơn hàng của Customer B.
  - **Check**: Endpoint lấy/cập nhật đơn hàng phải luôn query kèm điều kiện `user_id = session.id`.

## CATEGORY 3 — CSRF & Data Input Validation
- [ ] **I1: Cross-Site Request Forgery (CSRF)**
  - **Risk**: Hệ thống dùng HTTP-only Cookie Auth, dễ bị tấn công CSRF nếu user bị dụ bấm link lạ.
  - **Check**: Đảm bảo cookie được set `SameSite=Lax` hoặc `Strict`. Các API route state-changing nên verify header Origin hoặc Referer.
- [ ] **I2: Price & Negative Quantity Injection**
  - **Risk**: Client gửi order với giá 1đ hoặc quantity -10 để phá logic tính tiền.
  - **Check**: Server TUYỆT ĐỐI KHÔNG nhận field `price` từ client. Số lượng (`quantity`) phải được validate `> 0` bằng Zod.
- [ ] **I3: XSS qua dangerouslySetInnerHTML**
  - **Risk**: Chèn mã độc hiển thị lên màn hình người khác.
  - **Check**: Chỉ dùng cho data an toàn (như JSON-LD). Data từ database do Staff nhập không được render bằng `dangerouslySetInnerHTML`.
- [ ] **I4: SQL Injection qua Prisma raw query**
  - **Risk**: Nối chuỗi string trực tiếp vào câu lệnh SQL thay vì bind tham số.
  - **Check**: Nếu có dùng `$queryRaw`, bắt buộc phải dùng syntax Tagged Template (`$queryRaw\`SELECT...\``), không dùng phép cộng chuỗi `+`.
- [ ] **I5: OTP Format (Phase 5)**
  - **Risk**: Gửi mã OTP chứa ký tự đặc biệt (SQLi) hoặc quá dài gây tốn DB.
  - **Check**: Luôn kiểm tra RegEx `/^\d{6}$/` trước khi check DB.

## CATEGORY 4 — Rate Limiting & Resource Exhaustion
- [ ] **R1: Login / OTP Brute-force Protection**
  - **Risk**: Tool tự động thử mật khẩu hoặc spam gửi SMS liên tục gây tốn kém/lộ account.
  - **Check**: Có cơ chế chặn IP (Upstash Redis Rate Limit) sau N lần thử sai (Ví dụ: 5 lần/10 phút). Không dùng Rate Limit dạng bộ nhớ tạm (In-memory) khi deploy lên Serverless.
- [ ] **R2: Order Creation Spam**
  - **Risk**: Tạo hàng nghìn đơn rác trong 1 giây gây phình DB.
  - **Check**: Rate limit endpoint `POST /api/orders` (Ví dụ: 10 đơn/phút/user).
- [ ] **R3: Unbounded Queries (Denial of Service)**
  - **Risk**: Trả về hàng triệu record gây Out Of Memory (OOM) cho Vercel.
  - **Check**: Tất cả các truy vấn list (như lịch sử đơn, danh sách user) qua Prisma `findMany` đều phải có giới hạn `take` (ví dụ: `take: 50`).

## CATEGORY 5 — Race Conditions & Điểm thưởng (Points)
- [ ] **RC1: Double-spend Voucher**
  - **Risk**: Bắn 2 request dùng voucher cùng 1 mili-giây, cả 2 đều thành công.
  - **Check**: Logic đánh dấu đã dùng voucher phải là update Atomic: `UPDATE vouchers SET used_at = NOW() WHERE id = ? AND used_at IS NULL RETURNING *`.
- [ ] **RC2: Điểm thưởng (Points) Race Condition & Hoàn tiền**
  - **Risk**: Khách spam đổi voucher gây âm điểm, hoặc hủy đơn không bị trừ lại điểm đã nhận.
  - **Check**: Thao tác trừ/cộng điểm trong bảng `points_log` phải tính toán sum atomic. Khi hủy đơn, hệ thống phải sinh ra 1 row âm điểm (reverse) bù lại.
- [ ] **RC3: Multi-step writes ngoài Transaction**
  - **Risk**: Tạo đơn hàng thành công nhưng cập nhật voucher thất bại → DB bị lỗi logic nửa vời.
  - **Check**: Toàn bộ chu trình tạo đơn (Create Order + Add Items + Mark Voucher + Earn Points) phải nằm trong duy nhất 1 `prisma.$transaction()`.

## CATEGORY 6 — Business Logic & File Upload
- [ ] **B1: File Upload Security (Supabase Storage)**
  - **Risk**: Admin tải lên file `.svg` chứa JS độc hại hoặc upload file ảnh nặng 5GB.
  - **Check**: Backend/API phải validate kỹ MIME type (chỉ nhận `image/png, jpeg, webp`) và giới hạn Size (`< 5MB`) trước khi đẩy vào Supabase Storage.
- [ ] **B2: ID sinh mã (QR Token)**
  - **Risk**: Token của voucher/QR dễ đoán, người khác quét trộm được.
  - **Check**: Phải sử dụng UUID hoặc `crypto.randomBytes` cho cột `qr_token`. Không dùng `users.id` trực tiếp ra ngoài.
- [ ] **B3: Tiền âm & Float Math**
  - **Risk**: Xử lý tiền VND bằng số thập phân (float) dẫn đến sai số làm tròn.
  - **Check**: Mọi phép tính tiền tệ luôn dùng Integer, kết thúc bằng `Math.round` / `Math.ceil`. Discount phải luôn `>= 0`.
- [ ] **B4: Max Order Value Cap**
  - **Risk**: Lỗ hổng khiến user tạo đơn hàng trị giá hàng Tỷ VND làm tràn kiểu dữ liệu.
  - **Check**: Hard-code một mức giá trị đơn hàng tối đa ở Backend (ví dụ `if (total > 20_000_000) throw Error`).

## CATEGORY 7 — Next.js & Vercel Infrastructure
- [ ] **NX1: Mutation bằng GET request**
  - **Risk**: Request GET có thể bị browser/Next.js tự động cache, prefetch hoặc crawler gọi làm thay đổi dữ liệu.
  - **Check**: Mọi hành động làm thay đổi DB (Write, Update, Delete) phải dùng POST, PUT, DELETE.
- [ ] **NX2: Lộ DB Schema qua raw error**
  - **Risk**: Khi server lỗi 500, trả thẳng message của Prisma chứa tên bảng, tên cột ra cho Frontend.
  - **Check**: Bắt lỗi try-catch và chỉ return `{ error: "Internal Server Error" }`. Lỗi thật chỉ in ở `console.error` server.
- [ ] **NX3: Serverless Timeout rủi ro mất đồng bộ**
  - **Risk**: Vercel giới hạn function ở 10s (Hobby) hoặc 60s (Pro). Việc call API bên thứ 3 quá lâu làm đứt gãy giữa chừng transaction.
  - **Check**: Các tác vụ nặng/bên thứ 3 (như push notification, gửi SMS) cần đưa ra chạy ngầm dạng Async (sau khi đã response) thay vì await chặn luồng chính.
- [ ] **IN1: HTTP Security Headers**
  - **Risk**: Thiếu hàng rào bảo vệ căn bản từ trình duyệt dẫn tới Clickjacking, MIME-sniffing.
  - **Check**: `next.config.ts` phải có block `headers()` định nghĩa `X-Frame-Options`, `X-Content-Type-Options: nosniff`.
- [ ] **IN2: CORS Policy**
  - **Risk**: Cho phép bất kỳ website ngoài nào gọi lấy dữ liệu.
  - **Check**: API không được phép trả về `Access-Control-Allow-Origin: *` với những request có mang cookie xác thực.

## CATEGORY 8 — Data Privacy & Tracking
- [ ] **DP1: Lộ PII lên Sentry (Data Scrubbing)**
  - **Risk**: Sentry tự động bắt lỗi và gửi nguyên cục request body lên server (chứa password, mã OTP, số điện thoại khách).
  - **Check**: Cấu hình hàm `beforeSend` trong file `sentry.server.config.ts` để băm/ẩn thông tin mật khẩu, token trước khi submit.
- [ ] **DP2: Data Leak qua Console Logs**
  - **Risk**: Lộ PII khách hàng trên Vercel Runtime Logs.
  - **Check**: Rà soát các dòng `console.log` ở API routes, đảm bảo chỉ log IDs (`orderId`, `userId`), tuyệt đối không log toàn bộ user object hay tokens.

## CATEGORY 9 — Dependencies
- [ ] **D1: Dependency CVEs (Vulnerabilities)**
  - **Risk**: Dùng thư viện npm cũ có chứa lỗ hổng bảo mật đã công bố.
  - **Check**: Chạy `npm audit --production` định kỳ và khắc phục các cảnh báo ở mức High và Critical. (Đặc biệt chú ý Axios, Next.js).
- [ ] **D2: Lockfile Consistency**
  - **Risk**: Môi trường dev cài version thư viện A, Vercel cài version B gây lỗi không đồng bộ.
  - **Check**: Luôn commit `package-lock.json` vào repository. Môi trường production phải dùng lệnh `npm ci` thay vì `npm install`.
