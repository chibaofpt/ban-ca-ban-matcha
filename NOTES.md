# Bạn Cá Bán Matcha — Deferred Decisions

> **Authority:** unresolved/deferred scope and dated operational exceptions awaiting follow-up.
> **Read when:** a task may overlap deferred scope or needs a missing business decision.
> **Update when:** a decision is added, resolved, implemented or cancelled.
> **Does not own:** current behavior, env inventory or release runbook. Operational observations are dated evidence, not current-state guarantees.

Không implement nội dung trong file này nếu task hiện tại chưa được user/architect duyệt. Khi một mục được implement, chuyển rule đã chạy sang canonical resource phù hợp và xóa mục khỏi đây.

## Unresolved

- Cron documentation needs an operational check in an authorized infrastructure task: API `Cron`
  requires `clean-sessions` at `15 20 * * *` UTC, while the 2026-08-27 observation below records
  `15 18 * * *`. Preserve the distinction between desired schedule and historical deployment;
  a docs-only audit cannot confirm today's scheduler or silently reschedule it.
- QR scanner and direct redemption are separate contracts: API `GET /api/staff/scan` presents ADDON
  as order-only, while API `Vouchers` preserves singleton ADDON direct redemption. Before changing
  either flow, verify its intended compatibility boundary; do not infer endpoint permission from UI.

- Fresh migration replay previously failed because `0_init` does not create `users.insta_name`.
  The current `20260628100500_remove_insta_name` artifact uses `DROP COLUMN IF EXISTS`, but replay
  and compatibility with already-applied migration checksums remain unverified. Any deployed-history
  reconciliation requires a separately approved baseline strategy; do not rewrite applied history.
  The mock-only suite does not execute migrations or prove historical data transforms, SQL-only
  functions, PostgreSQL constraints or RLS.
- Applying `20260830120000_add_previous_refresh_token` to deployed databases and running the BUNDLE
  repair tool on existing data require a separately approved rollout. No automatic production repair.

- Cascade delete cho `voucher_packages.menu_item_id`: chưa được duyệt. Không thêm cascade.
- Hard delete `menu_item` đang được voucher tham chiếu: chưa được duyệt. Tiếp tục soft delete.

## Approved but deferred

### Staging order/voucher coverage chưa hoàn tất

- Không bổ sung fixture, nạp cá hay đổi voucher ngoài ngân sách để lấp khoảng trống coverage.
  Plan/report phải tách `NOT_IMPLEMENTED` khỏi thiếu inventory/quota/cấu hình; chạy staging vẫn
  cần deployment đã xác minh đúng revision, DB binding và push `log_only`.
- Attestation staging dựa vào Vercel phân loại deployment `source=git`, metadata branch-scoped còn
  nguyên, Git tree đã review và release-window assertion do operator kiểm soát. Đây là trust boundary
  của quy trình release, không chứng minh chống một local process độc hại sửa workspace đồng thời.
  Vercel không cung cấp effective readback cho sensitive `DATABASE_URL`/`DIRECT_URL`; evidence chỉ
  chứng minh configuration provenance, fresh Git deployment và runtime catalog fingerprint, không
  tuyên bố đã đọc lại plaintext secret hay loại trừ mọi platform-side override ngoài evidence đó.

### Compatibility cleanup

- Sau khi client cũ đã hết và staging/production soak đủ, tạo migration riêng để bỏ `addon_groups.is_required`, `addon_groups.min_quantity`, `addon_options.is_default`. Đến lúc đó chúng chỉ là compatibility columns và không được quay lại API/business logic.
- Public user/voucher identifiers đang có token-first legacy UUID lookup bridge. Chỉ xóa bridge sau release window được duyệt và telemetry không còn legacy lookup.
- `SUPABASE_SERVICE_ROLE_KEY` là fallback tạm thời; ưu tiên `SUPABASE_SECRET_KEY`. Xóa fallback bằng release task riêng sau khi môi trường đã migrate.
- Frontend transport còn ba legacy exception gọi `apiClient` ngoài service:
  `app/(admin-shell)/admin/logs/page.tsx`, `src/views/admin/AdminOrdersPage.tsx` và
  `src/views/staff/StaffOrdersListPage.tsx`. Chuyển transport vào domain service bằng cleanup task
  tập trung; không nhân bản pattern này.

### Phase 5+

- OTP khách hàng và order-ready SMS/Zalo ZNS qua ESMS vẫn thuộc Phase 5. Trang `/test-sms`
  chỉ thử tài khoản ABENLA trên staging; kết quả xác minh ở đó không xác thực khách hàng và
  chưa quyết định provider cho luồng vận hành sau này.
- Mở rộng Redis cache-aside ngoài menu, powders, store status và voucher packages cần task kiến trúc
  xác định freshness, invalidation và failure behavior.
- Chưa có ADR ghi lý do hoặc thời điểm duyệt phạm vi Redis cache-aside hiện tại; SPECIFICATION phản
  ánh implementation đang chạy trong code, không phải bằng chứng lịch sử phê duyệt.
- Point-to-draw ngoài welcome reward chưa được thiết kế: cần quyết định giá mỗi lượt, atomic points
  debit, ticket/idempotency, refund khi không thể resolve reward, cùng API request/response. Chưa có
  endpoint hoặc points debit cho flow này; reusable reward-selection core không tự cấp quyền triển khai.

### Product options

- Mix bột Fusion: cần thiết kế blend snapshot; chưa thêm field/table.
- Mix bột Latte: phải giữ tối thiểu 2g fixed powder, khác constraint Fusion.
- Ice option có giá: hiện ice miễn phí. Nếu thu phí phải đi qua addon system sau khi business duyệt.
- Audit log cho `default_size_config`: chưa có yêu cầu lưu người sửa/thời điểm sửa.

### Group orders (design only)

Do not add these tables until group ordering is implemented. The intended extension is:

- `group_orders`: host user, share token, lifecycle, checkout order ID, timestamps.
- `group_order_members`: group order, optional authenticated user, guest name, join token.
- `group_order_items`: draft line ownership by member; finalized lines map to `order_items`.
- Member PRODUCT/ADDON vouchers attach only to that member's lines.
- Host BUNDLE/DISCOUNT/FREESHIP vouchers attach to the whole finalized order. BUNDLE qualifier
  counts exclude line units already using a member PRODUCT voucher.
- The resolver receives the selected voucher's explicit owner ID. Guest members cannot use a
  personal voucher because they have no authenticated voucher owner.
- The host pays and receives order points. Guests can join without an account and cannot own a
  personal voucher. Preserve member ownership when copying draft lines into immutable order rows.

### Product/SEO follow-ups

- Mở lại search top-level cho danh sách Sản phẩm, Bột và Base Liquid trong một task UI riêng. Hiện các control này được chủ động ẩn để giữ giao diện compact; state và filter wiring vẫn được giữ. Search/multi-select bên trong editor Base Liquid không thuộc phần tạm ẩn này.
- SEO sitemap/robots bằng Next.js built-in.
- Product structured data JSON-LD trên menu item pages.

## Refactor policy for existing debt

Theo [AGENTS](AGENTS.md#change-contract), [STRUCTURE](STRUCTURE.md#size-and-movement) và
[SPECIFICATION](SPECIFICATION.md#legacy-ui-migration-policy). Không giữ line-count inventory ở đây.

## Environment and operations

Các ghi nhận dưới đây cần được xác minh lại khi làm release/hạ tầng; không đọc như cấu hình hiện tại
đã được kiểm tra. Desired contract thuộc API `Cron`, quyền release thuộc release skills.

- Env key inventory duy nhất: `.env.local.example`.
- Route `/api/cron/cleanup-menu-images` đã tồn tại nhưng staging và production chưa có `cron.job`; cấu hình lịch cleanup là task hạ tầng riêng sau khi backfill/visual QA hoàn tất.
- Production đã bật `pg_cron`/`pg_net` và cài hai job `cancel-expired-orders` (`*/5 * * * *`) và
  `clean-sessions` (`15 18 * * *`) ngày 2026-08-27. URL cùng `CRON_SECRET` nằm trong Vault; smoke
  test của cả hai route đạt `401` khi thiếu bearer và đạt `200` qua hai lần gọi có bearer liên tiếp.
  `production_app_url` hiện ghim vào deployment Production mới nhất vì alias canonical đang trả
  `DEPLOYMENT_NOT_FOUND`; sau mỗi production release phải refresh Vault sang deployment Production
  mới cho đến khi alias ổn định được khôi phục.
- Follow-up cùng ngày: staging đã bật `pg_cron`/`pg_net` và có hai Vault secret, nhưng smoke test
  xác nhận Vercel staging chưa có runtime `CRON_SECRET` (route fail-closed `500`). Hai job thử
  nghiệm đã được unschedule để không retry lỗi. Production route trả `401` khi thiếu bearer, xác
  nhận production runtime đã có secret. Theo quyết định release ngày 2026-08-27, staging được phép
  thiếu hai job này và không dùng để xác nhận auto-cancel.
- Release/launch checklist duy nhất: `push-to-dev`, `production-deploy` và `security-checklist` skills.
- Prisma migrations là đường duy nhất cho app schema; không dùng `db push`.
