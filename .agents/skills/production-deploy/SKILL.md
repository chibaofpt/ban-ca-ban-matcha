---
name: production-deploy
description: >
  Kiểm tra staging sau khi tester xác nhận ổn để tiến hành merge branch dev vào main.
  Trigger on: "deploy", "production", "release", "merge main", "build vercel", "vercel error", "check production", "ready for prod".
---

# Production Deploy (Merge to Main)

> Skill này thực thi quy trình đẩy code lên production (merge nhánh `dev` vào `main`).
> **ĐIỀU KIỆN TIÊN QUYẾT**: Tester đã kiểm thử kỹ trên staging và xác nhận ok.

## Section 1 — Migration Safety Gate

Sử dụng lệnh `npx prisma migrate diff --from-url $DIRECT_URL --to-schema-datamodel prisma/schema.prisma --script` để generate mã SQL chứa thay đổi cấu trúc trước khi apply lên Production.
Đọc file SQL diff vừa sinh ra để scan tìm các lệnh nguy hiểm (destructive):
- `DROP`
- `TRUNCATE`
- `ALTER COLUMN ... TYPE`
- `RENAME`
- `DELETE FROM`

- Dựa vào `prisma/schema.prisma` thực tế, kiểm tra có enum nào (ví dụ `Role`, `VoucherType`, `OrderStatus`, `OrderType`, `Size`, `SweetnessLevel`, `IceOption`, `PowderType`) bị sửa không.
- Nếu có: cảnh báo về data compatibility.
- Nếu tìm thấy lệnh destructive → **BLOCK**, yêu cầu developer xác nhận tay.

> **Ví dụ output mẫu:**
> Migration safe ✅ (Không phát hiện lệnh destructive) / ❌ (Phát hiện DROP TABLE users)

## Section 2 — Staging Stability Check

- Dùng Vercel MCP → Get runtime logs của Preview environment (branch `dev`) trong 30 phút gần nhất, filter `level=error`.
- Dựa vào danh sách API thực tế, liệt kê và đảm bảo các critical routes sau không có lỗi: `app/api/auth`, `app/api/orders`, `app/api/menu`, `app/api/delivery`, `app/api/voucher-packages`, `app/api/staff`.

> **Ví dụ output mẫu:**
> Staging stable ✅ (Không có error trong 30 phút qua) / ❌ (Có lỗi tại route app/api/orders)

## Section 3 — Env Vars Check

Đọc code diff giữa nhánh `dev` và `main`. Tìm tất cả biến `process.env.*` được sử dụng trong code mới.
Dựa vào danh sách biến môi trường thực tế (từ `.env` / `.env.local.example`):
`DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `ESMS_API_KEY`, `ESMS_SECRET_KEY`, `ESMS_SANDBOX`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SENTRY_DSN`, `BANK_ID`, `BANK_ACCOUNT`, `BANK_ACCOUNT_NAME`, `CRON_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `GOONG_API_KEY`, `NEXT_PUBLIC_GOONG_MAPTILES_KEY`, `STORE_LAT`, `STORE_LNG`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.

Nếu xuất hiện biến `process.env.*` nào là biến mới toanh, chưa có trong danh sách production → **BLOCK**, yêu cầu developer setup trên Vercel Production trước.

> **Ví dụ output mẫu:**
> Env vars ✅ (Không có biến mới) / ❌ [Liệt kê: thiếu biến NEW_PAYMENT_KEY]

## Section 4 — Rollback Plan

- Nếu có sự thay đổi DB → Dùng `npx prisma migrate diff --from-schema-datamodel prisma/schema.prisma --to-url $DIRECT_URL --script > ROLLBACK_[timestamp].sql` để generate SQL rollback và lưu tại root.
- Nếu không có thay đổi DB → Ghi N/A.

> **Ví dụ output mẫu:**
> Rollback plan ✅ FILE: ROLLBACK_1719500000.sql / N/A

## Section 5 — Merge to main

**CHỈ THỰC HIỆN** khi Section 1, 2, 3 đều PASS.
Thực thi các lệnh Git sau:
```powershell
git checkout main
git merge dev
git push origin main
git checkout dev
```
Sau push: Thông báo Vercel đang auto-deploy production.

## Section 6 — Final Report

Xuất báo cáo cuối cùng theo đúng format:
```
=== PRODUCTION GATE REPORT ===
Migration safety:  ✅ / ❌
Staging stability: ✅ / ❌
Env vars:          ✅ / ❌ [liệt kê nếu thiếu]
Rollback plan:     ✅ FILE: ROLLBACK_xxx.sql / N/A

VERDICT: APPROVED / BLOCKED — [lý do nếu blocked]
```

---

**Hard rules**:
- **Không merge** nếu bất kỳ Section 1/2/3 nào FAIL.
- **Không bỏ qua** bước nào dù developer yêu cầu.
- Nếu không đủ tool access để tự động verify (vd không có MCP để check Vercel logs) → ghi `Cannot verify: [lý do]` thay vì assume là OK.
- Vercel rollback **không rollback DB** → luôn nhắc developer điều này trong report.
