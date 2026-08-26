# Bạn Cá Bán Matcha — Deferred Decisions

> **Authority:** unresolved decisions and approved work that is not implemented yet.
> **Read when:** a task may overlap deferred scope or needs a missing business decision.
> **Update when:** a decision is added, resolved, implemented or cancelled.
> **Does not own:** implemented behavior, current architecture, env inventory or release runbook.

Không implement nội dung trong file này nếu task hiện tại chưa được user/architect duyệt. Khi một mục được implement, chuyển rule đã chạy sang canonical resource phù hợp và xóa mục khỏi đây.

## Unresolved

- Cascade delete cho `voucher_packages.menu_item_id`: chưa được duyệt. Không thêm cascade.
- Hard delete `menu_item` đang được voucher tham chiếu: chưa được duyệt. Tiếp tục soft delete.

## Approved but deferred

### Compatibility cleanup

- Sau khi client cũ đã hết và staging/production soak đủ, tạo migration riêng để bỏ `addon_groups.is_required`, `addon_groups.min_quantity`, `addon_options.is_default`. Đến lúc đó chúng chỉ là compatibility columns và không được quay lại API/business logic.
- Public user/voucher identifiers đang có token-first legacy UUID lookup bridge. Chỉ xóa bridge sau release window được duyệt và telemetry không còn legacy lookup.
- `SUPABASE_SERVICE_ROLE_KEY` là fallback tạm thời; ưu tiên `SUPABASE_SECRET_KEY`. Xóa fallback bằng release task riêng sau khi môi trường đã migrate.

### Phase 5+

- OTP và order-ready SMS/Zalo ZNS qua ESMS.
- Application caching bằng Redis. Upstash hiện chỉ được dùng cho distributed security rate limits.
- Voucher gacha: dùng `VoucherPackage` + `Voucher`; nếu được duyệt sẽ thêm pool/play boundary mà không đổi order calculator.

### Product options

- Mix bột Fusion: cần thiết kế blend snapshot; chưa thêm field/table.
- Mix bột Latte: phải giữ tối thiểu 2g fixed powder, khác constraint Fusion.
- Ice option có giá: hiện ice miễn phí. Nếu thu phí phải đi qua addon system sau khi business duyệt.
- Audit log cho `default_size_config`: chưa có yêu cầu lưu người sửa/thời điểm sửa.

### Product/SEO follow-ups

- SEO sitemap/robots bằng Next.js built-in.
- Product structured data JSON-LD trên menu item pages.

## Refactor policy for existing debt

- Existing files trên 300 dòng, direct API calls ngoài service và manual overlays được grandfathered.
- Không lập danh sách line count cố định tại đây vì nhanh lỗi thời; dùng repository scan khi mở task refactor.
- Mỗi refactor phải là task riêng, có characterization tests, allowlist file và staging regression.
- Không tách backend khỏi fullstack Next.js cho đến khi architect duyệt một migration riêng.

## Environment and operations

- Env key inventory duy nhất: `.env.local.example`.
- Route `/api/cron/cleanup-menu-images` đã tồn tại nhưng staging và production chưa có `cron.job`; cấu hình lịch cleanup là task hạ tầng riêng sau khi backfill/visual QA hoàn tất.
- Release/launch checklist duy nhất: `push-to-dev`, `production-deploy` và `security-checklist` skills.
- Prisma migrations là đường duy nhất cho app schema; không dùng `db push`.
