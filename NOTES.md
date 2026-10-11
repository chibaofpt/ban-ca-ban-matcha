# Bạn Cá Bán Matcha — Deferred Decisions

> **Authority:** unresolved/deferred scope and dated operational exceptions awaiting follow-up.
> **Read when:** a task may overlap deferred scope or needs a missing business decision.
> **Update when:** a decision is added, resolved, implemented or cancelled.
> **Does not own:** current behavior, env inventory or release runbook. Operational observations are dated evidence, not current-state guarantees.

Không implement nội dung trong file này nếu task hiện tại chưa được user/architect duyệt. Khi một mục được implement, chuyển rule đã chạy sang canonical resource phù hợp và xóa mục khỏi đây.

## Unresolved

- QR scanner and direct redemption are separate contracts: API `GET /api/staff/scan` presents ADDON
  as order-only, while API `Vouchers` preserves singleton ADDON direct redemption. Before changing
  either flow, verify its intended compatibility boundary; do not infer endpoint permission from UI.

- On 2026-10-04, shadow replay failed with P3006: `0_init` does not create `users.insta_name`,
  but `20260628100500_remove_insta_name` drops it unconditionally. On 2026-10-10 the user confirmed
  production recorded that historical migration and approved preserving history with an additive
  prerequisite; see [schema compatibility](SCHEMA.md#instagram-history-compatibility).
  The new artifact is statically checked, but complete replay has not been executed and production
  migration metadata has not been independently rechecked in this task. Existing migration files
  remain unchanged. Verify environment history under the production-deploy workflow before release.
  The mock-only suite does not execute migrations or prove historical data transforms, SQL-only
  functions, PostgreSQL constraints or RLS.
- Applying `20260830120000_add_previous_refresh_token` to deployed databases and running the BUNDLE
  repair tool on existing data require a separately approved rollout. No automatic production repair.

- Cascade delete cho `voucher_packages.menu_item_id`: chưa được duyệt. Không thêm cascade.
- Hard delete `menu_item` đang được voucher tham chiếu: chưa được duyệt. Tiếp tục soft delete.

### Staging migration reconciliation — read-only observation 2026-10-10

The user approved preserving data and auditing the migration history before the pending dev
release. Live inspection covered staging `mnklsbzkefuefpqvghrr` only, not live production or
customer/order rows; the local production-backup follow-up is recorded below.
The ledger contained 38 successful migrations and four rolled-back attempts, with no active
failed migration. Of 40 local migration files, only the Instagram compatibility prerequisite and
`20261009000000_google_account_claims` were pending.

The missing local `20260824123000_add_product_discount_vouchers` entry is a failed attempt,
marked rolled back on 2026-08-24 after PostgreSQL error `55P04` (using a new enum value before
commit). Both replacement migrations, `20260824142000_add_enum_values` and
`20260824142001_add_product_discount_vouchers`, completed successfully and their checksums match
the local files after accounting for LF/CRLF. The related enums, six columns and two validated
shape constraints are present and match those artifacts. Preserve that rolled-back ledger entry;
restoring its old executable SQL into the active history would reintroduce the failed migration
and overlap the replacement DDL.

Checksum comparison of all successful entries found 35 matches after accounting for LF/CRLF.
`0_init` can be reproduced with an equivalent SQL body, a UTF-8 BOM, CRLF and two trailing
newlines; those bytes match its recorded checksum. No file was rewritten. Two entries remain
unexplained: `20260903100000_addon_max_select` and `20260904122800_add_max_discount_vnd` do not
match their available Git versions, including tested BOM, line-ending and trailing-newline
variants. Their current staging column/type/default/nullability metadata matches the expected
schema, but does not establish the original staging SQL or historical addon backfill results. Obtain
the original staging SQL artifacts or approve a separately reviewed reconciliation based on further
evidence before clearing this release finding; do not overwrite ledger checksums to silence it.

The existing staging `users.insta_name` column and valid unique index were also confirmed.
These observations do not prove complete fresh/shadow replay, successful execution of the two
pending migrations, or production compatibility. No database writes, migration changes,
commit or push occurred during this audit. Release gates remain owned by
[push-to-dev](.agents/skills/push-to-dev/SKILL.md).

#### Local backup follow-up — 2026-10-10

After the user identified `prisma` and `backups/production`, inspection found 40 migration SQL
files, seven rollback artifacts and five production dumps. The user clarified that the July rollback
files were for testing; their presence does not establish a database rollback. A migration-ledger
`rolled_back_at` value records resolution of an unsuccessful migration attempt and likewise does
not establish execution of any local `ROLLBACK_*.sql` artifact.

All five dumps were inspected offline with `pg_restore --file=-`, without `--dbname`, credentials,
SQL execution or restoring a database. Only migration-ledger metadata and relevant schema DDL
were examined. Successful production migrations in those snapshots match current local SQL
after accounting for LF/CRLF, except the already-explained `0_init` byte-format difference. In
particular, the second 2026-09-06 backup and all later snapshots record successful execution of
`20260903100000_addon_max_select` with checksum
`06f2f4c3e4c3825751e3e6291002fb02af562c62fc2d041d6d4feca7c6bdc49f` and
`20260904122800_add_max_discount_vnd` with checksum
`0c94e1f542ae3cd0db0fd757c85a9044a27b97c882b49ca6dd27447cfa9fb127`; both match current
LF SQL. The two 2026-09-06 snapshots also show the expected before/after schema: new addon
columns, removed old addon enum/type column, and nullable voucher discount-cap columns.

Staging-first execution followed by production is the intended release sequence; timestamps
alone are not a defect. This evidence narrows the two unexplained checksums to the staging
history observed above and establishes a production-applied source artifact for comparison.
It does not recover the original staging SQL or prove historical backfill equivalence. A scoped
read-only check of current staging configuration found no addon `max_select < 1`, dynamic
group with non-single selection, active dynamic option with missing/nonpositive gram, or negative
voucher discount cap. These checks are limited observations, not full domain acceptance.
All backup, rollback and migration files were preserved. No live production inspection, ledger
rewrite or push was performed; any staging-only release exception still requires explicit approval
and independent review under the release workflow.

### Account migration and provider rollout — observation 2026-10-09

The account migration artifact was generated from local Prisma datamodels only. It does not rewrite
applied history, move production balances, or prove successful historical replay. Before rollout,
verify the compatibility prerequisite and pending migration history above, review backup/restore, configure
the shared Google web client ID/authorized origins and Turnstile hostnames, and manually accept the
Google/claim/phone flows on staging. Do not downgrade to a pre-nullable-phone application after
Google-only users exist; prefer forward repair or a separately reviewed database restore.

Local configuration observation on 2026-10-10: `.env.local`, `.env.staging` and `.env.prod` have no
nonempty Google client ID entries; Turnstile entries are nonempty only in `.env.local`. This is
presence-only evidence, not provider validity or Vercel environment state. Configure the keys owned
by [environment inventory](.env.local.example) before provider acceptance. Never paste server secrets
into the task or commit environment files. The user will configure provider variables after local
implementation is complete; provider configuration and manual staging acceptance remain rollout
steps, not evidence supplied by the automated suite.

## Approved but deferred

### Realtime rollout — operational observation 2026-10-04

Staging `mnklsbzkefuefpqvghrr` advertises the prepared ES256 public key, and the scoped
`orders_operations_receive` policy is applied. Local staging env is configured. Vercel Preview
already has Supabase URL/publishable credentials, but its metadata has no
`SUPABASE_REALTIME_SIGNING_JWK`; activation still requires that server-only env and a reviewed
staging deployment. This is configuration evidence, not proof of websocket delivery or UI recovery.
Production `nqwfbmghziubdhvtgyao` does not advertise the prepared production key yet. Its key/policy
activation and production release remain pending staging acceptance. Current contract and lifecycle
are owned by [Order Realtime](SPECIFICATION.md#order-realtime), not this dated observation.


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

- OTP chỉ còn cho nhánh chứng minh sở hữu SĐT trùng legacy ghost đủ điều kiện; xem [account access](docs/specs/account-access.md). Gỡ adapter SMS sau khi hoàn tất chuyển đổi ghost là task riêng, không tự xóa trong rollout này. Email marketing/Brevo, OTP login/recovery và order-ready SMS vẫn ngoài phạm vi.
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
- 2026-10-04: theo yêu cầu user, production `clean-sessions` đã đổi từ lịch lịch sử trên sang
  lịch trong API `Cron`; kiểm tra trực tiếp xác nhận scheduler dùng GMT, job active và command
  không đổi. Sai lệch lịch cron trước đây đã được giải quyết. Production Vault URL đã được
  xác nhận dùng alias canonical `https://bancabanmatcha.io.vn` từ release 2026-10-03.
- Follow-up cùng ngày: staging đã bật `pg_cron`/`pg_net` và có hai Vault secret, nhưng smoke test
  xác nhận Vercel staging chưa có runtime `CRON_SECRET` (route fail-closed `500`). Hai job thử
  nghiệm đã được unschedule để không retry lỗi. Production route trả `401` khi thiếu bearer, xác
  nhận production runtime đã có secret. Theo quyết định release ngày 2026-08-27, staging được phép
  thiếu hai job này và không dùng để xác nhận auto-cancel.
- Release/launch checklist duy nhất: `push-to-dev`, `production-deploy` và `security-checklist` skills.
- Prisma migrations là đường duy nhất cho app schema; không dùng `db push`.
