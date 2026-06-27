---
name: push-to-dev
description: >
  QA/QC review code thay đổi, kiểm tra an toàn trước khi đẩy lên branch dev cho tester.
  Trigger on: "deploy dev", "đưa lên dev", "test staging", "push dev", "qa review".
---

# Push to dev (Staging Deployment)

> Skill này định nghĩa quy trình QA/QC review code thay đổi trước khi đẩy lên nhánh `dev` cho môi trường staging.

## Section 1 — QA/QC Review

Chạy lệnh `git diff` (hoặc kiểm tra các thay đổi gần đây) để xem xét code.
Đóng vai trò QA/QC Engineer, kiểm tra an toàn hệ thống:
- **Type errors**: `npx tsc --noEmit`
- **Test suite**: `npm run test` (Vitest)
- **Build simulation**: `npx prisma generate && npx next build`

Dựa trên Context dự án để phân tích thay đổi:
- **Database Schema**: Kiểm tra nếu có bất kỳ thay đổi nào trong `prisma/schema.prisma` (ví dụ: bảng `users`, `orders`, `vouchers`, `menu_items`, `matcha_powder`, `points_log`, `voucher_packages`... hay các enums `OrderStatus`, `OrderType`, `Size`, `VoucherType`...). Nếu có thay đổi, **nhắc developer phải chạy** đồng bộ DB thay vì dùng `migrate dev` (vì migrate dev không tương thích với pgBouncer). Có thể tạo migration SQL bằng `prisma migrate diff` hoặc tiện lợi nhất là gợi ý developer dùng lệnh PowerShell nội tuyến trỏ vào Staging: `$env:DATABASE_URL="<staging_url>"; $env:DIRECT_URL="<staging_direct_url>"; npx prisma db push --accept-data-loss`.
- **Critical API Routes**: Kiểm tra xem thay đổi có tác động tới các route cốt lõi trong `app/api/` hay không, như `app/api/auth`, `app/api/orders`, `app/api/delivery`, `app/api/menu`, `app/api/staff`, `app/api/voucher-packages`.
- **Known pitfalls**: 
  - Image hostname: remotePatterns hiện tại cover *.supabase.co (staging: mnklsbzkefuefpqvghrr, production: nqwfbmghziubdhvtgyao). Nếu dùng hostname ngoài 2 domains này → phải add thủ công vào next.config.ts
  - SSL/TLS: Không dùng axios trên backend để upload file lên Supabase. Dùng client `supabase-js`.
  - Sharp crash: Không import thư viện `sharp` trên backend.
  - Prisma cache: Luôn giữ build config là `prisma generate && next build`.
  - Async Params Next.js 15+: Dynamic route `params` luôn là Promise (`Promise<{ id: string }>`).
  - Scratch pollution: Đảm bảo code nháp bỏ trong folder `scratch/` đã được exclude ở `tsconfig.json`.

> **Ví dụ output mẫu báo cáo QA/QC:**
> Báo cáo đánh giá QA/QC:
> - [x] Type/Test/Build: PASS
> - [ ] Cảnh báo Schema: Phát hiện thay đổi tại bảng `users` (thêm trường `otp_enabled`), yêu cầu chạy `npx prisma db push` hoặc generate SQL migration.
> - [ ] API ảnh hưởng: `app/api/orders/route.ts` thay đổi logic `total_vnd`.
> Kết luận: PHÁT HIỆN RỦI RO DỪNG. Chờ xác nhận từ Developer.

**Nếu phát hiện rủi ro**: DỪNG lập tức, báo cáo hoàn toàn bằng tiếng Việt và chờ xác nhận.

## Section 2 — Push to dev

**Chỉ thực hiện** khi Section 1 QA/QC PASS hoặc user xác nhận bỏ qua.
- Thực hiện đồng bộ DB (nếu có thay đổi schema) bằng `npx prisma db push` (có thể dùng biến môi trường `$env:DATABASE_URL="..."` để trỏ thẳng vào Staging DB) hoặc apply file SQL được sinh từ `migrate diff` trước khi push.
- Thực thi các lệnh Git:
```powershell
git add .
git commit -m "chore: prepare staging deployment"
git push origin dev
```
- Sau push, thông báo URL của môi trường Staging (preview branch `dev`) cho tester.

## Section 3 — Verify staging deployment

- Sử dụng Vercel MCP (nếu có access) để kiểm tra branch `dev` xem deployment status có là READY hay không.
- Kiểm tra runtime logs của môi trường preview trong 5 phút gần nhất.
- Nếu có error → liệt kê ngay lập tức cho developer.

> **Ví dụ output mẫu verify staging:**
> - Trạng thái: READY ✅
> - Runtime Logs (5 phút): Không tìm thấy Error ✅

---

**Hard rules**:
- **KHÔNG** merge vào nhánh `main`.
- **KHÔNG** chạy lệnh `prisma migrate dev` trên môi trường dự án vì nó không tương thích với pgBouncer.
- **KHÔNG** chạy lệnh `db push` thẳng lên production DB.
- Báo cáo QA/QC **PHẢI** viết hoàn toàn bằng tiếng Việt.
- Mỗi bước (Section) phải được confirm kết quả trước khi sang bước tiếp.
