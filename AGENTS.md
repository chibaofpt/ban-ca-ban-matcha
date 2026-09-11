# Bạn Cá Bán Matcha — Agent Entry Point

Đọc đầu tiên. Chỉ nạp owner và mục liên quan task; không đọc toàn bộ tài liệu hay mọi skill.

## Nạp ngữ cảnh

- Code task: một truy vấn CodeGraph theo task trước `rg`/đọc code; coi source trả về là đã đọc.
  Thu hẹp truy vấn tiếp theo khi cần. Skip docs-only hoặc chưa có index; không tự khởi tạo index.
  Chỉ đọc trực tiếp phần thiếu/stale.
- Chọn resource bằng bảng dưới. Với file dài, đọc mục chung cần thiết + heading/endpoint liên quan.
  Chỉ theo liên kết khi nhánh công việc cần nó; liên kết không có nghĩa là phải nạp ngay.
- Tên skill dưới đây là project-local tại `.agents/skills/<name>/SKILL.md`.
  Plugin cùng tên chỉ bổ sung tài liệu nhà cung cấp, không thay project policy.
- Ownership cụ thể thắng mô tả tổng quát. Nếu resource/code/test lệch nhau, phân loại documentation
  drift hay implementation defect trước khi sửa; chưa đủ bằng chứng thì ghi rõ điểm chưa biết.
- Shell theo [RTK.md](RTK.md); không đọc lại resource đã có trong ngữ cảnh nếu chưa thay đổi.

| Task chạm | Owner cần đọc / cập nhật |
|---|---|
| Kiến trúc, shared abstraction, integration | [SPECIFICATION.md](SPECIFICATION.md) đúng mục |
| UI/mobile/form/overlay | `mobile-ux` → shared UI hoặc feature spec liên quan |
| Vị trí, import, tạo/move/split file | [STRUCTURE.md](STRUCTURE.md) |
| HTTP route, service, DTO, API compatibility | `api-layer` + [API.md](API.md) đúng endpoint |
| Feature có data từ DB đến UI | [SPECIFICATION.md](SPECIFICATION.md#data-backed-feature-path) + `api-layer`; thêm schema/domain/UI owner thực sự bị chạm |
| Redis cache/invalidation | [SPECIFICATION.md](SPECIFICATION.md#server-cache-boundary) + `api-layer`; thêm security/API owner khi đổi rate limit |
| Prisma/schema/migration/data semantics | `supabase` + [SCHEMA.md](SCHEMA.md), Prisma/migrations liên quan |
| Menu configuration, tính giá/rounding | `pricing-logic`; thêm SCHEMA khi đổi data semantics |
| Order lifecycle/status/points | `order-flow` |
| Voucher eligibility/stacking/lifecycle/QR | `voucher-flow` |
| Supabase platform, Storage, RLS, Cron | `supabase`; thêm `supabase-realtime` khi có Realtime |
| Postgres query/index performance | `supabase-postgres-best-practices` sau project `supabase` |
| Security audit/hardening | `security-checklist` đúng phạm vi |
| Test/TDD hoặc executable change | `tdd` theo điều kiện bên dưới |
| Delegate, sub-agent, làm song song | `subagent-orchestration` |
| Push staging / release production | `push-to-dev` / `production-deploy` |
| Deferred/unresolved/operational exception | [NOTES.md](NOTES.md) |
| Lý do, trade-off, quyết định dài hạn | [Decision log](docs/decisions/README.md); thiếu record thì nêu chưa có bằng chứng |
| Env key | `.env.local.example` |
| Thiết kế/duy trì harness, feature spec | [docs/specs/README.md](docs/specs/README.md) |

## Ranh giới toàn dự án

- Stack được chốt trong SPECIFICATION `Runtime architecture`; không tự đổi framework/dependency.
  Custom auth phone/password, `jose`, httpOnly cookies; không NextAuth/Supabase Auth.
- Promotions và OTP/ZNS chỉ làm trong task Phase 5 được duyệt. Upstash hiện phục vụ distributed
  security rate limits và cache-aside cho các public read đã ghi trong SPECIFICATION; mở rộng cache
  scope cần task kiến trúc. Cart chỉ localStorage; admin đầu tiên tạo thủ công,
  không seed/setup route.
- TypeScript strict, không `any`; exported function mới có one-line JSDoc. Page export metadata
  hoặc `generateMetadata`; `"use client"` chỉ khi cần hooks/browser event.
- Không hardcode/log secret; env mới thêm `.env.local.example`. Client không import `lib/` server-only;
  external SDK qua adapter/hook. Login luôn bcrypt compare kể cả user không tồn tại.
- Money integer VND, gram Prisma Decimal. Server tính lại giá; công thức chỉ ở pricing owner.
- Multi-step DB writes dùng `prisma.$transaction()`. Schema/migrations phải được audit trước khi đổi;
  reuse field/relation, không thêm derived/convenience field. Không raw SQL khi chưa được yêu cầu.
- Giữ API path/method/field; breaking change cần user duyệt compatibility/migration.
  DTO user/voucher dùng `qr_token`, không expose `users.id`/`vouchers.id`.
- UI dùng project primitives; không `window.confirm`. Nghiệp vụ chi tiết thuộc domain skills,
  không sao chép vào file này.

## Change contract

Trước production edit, ghi trong task (không tạo file plan):

```text
Expected behavior:
Current failure:
Allowed production files:
Invariants that must not change:
Forbidden actions:
Tests:
Resource Impact:
```

- **Micro:** ≤3 production files, không schema/API/dependency/move.
- **Standard:** 4–8 production files hoặc behavior cục bộ.
- **Architecture:** cross-domain, schema/API/auth/order/voucher/pricing, dependency hoặc file movement.
- Micro/Standard mặc định cấm rename/move/split/delete, whole-file format, cleanup refactor,
  dependency/schema/API changes và unrelated lint fixes. Dùng patch nhỏ.
- Dừng và re-plan khi Micro vượt 3 files, ngoài allowlist, rename/delete/move, production churn >150
  dòng, hoặc >25% của file từ 100 dòng; churn = additions + deletions. Từ chối EOL/format-only churn.
- Production file mới ≤300 dòng. File cũ >300 dòng grandfathered; refactor riêng có characterization.
  Các giới hạn production này không biến một task chỉnh tài liệu thành task refactor code.

## Verification

- Load `tdd` khi user yêu cầu test/TDD/test review, đổi executable behavior/public contract,
  hoặc refactor/move/split cần bảo toàn behavior. Nếu chưa chắc hoặc task hỗn hợp, load.
  Approved plan tự nó không trigger TDD.
- Docs-only, không yêu cầu test: `Tests: NOT_NEEDED`, ghi lý do và named verification.
  Khi load TDD: ghi lane, Test Seam và verification theo từng vertical slice.
- Automated evidence backend-first, mock-only, chỉ `node`/`static-contract`; không staging/live DB
  hay DOM/UI runner. Chi tiết mock, oracle, manual UI và claims proved/not proved thuộc `tdd`.
- Implementation/review/repair chỉ chạy targeted tests. Trước accept executable change, chạy impacted
  tests rồi full suite một lần trên final code/test tree; edit production/test sau đó làm gate hết hạn.
- Không mở browser, chạy `npm run dev`/`npm run build` sau thay đổi trong agent workflow; chỉ ngoại lệ
  local staging build không migrate được định nghĩa trong `push-to-dev`.
- Trước staging: lint, type-check, `npm run resources:check`; reuse full suite chỉ nếu code/test tree
  không đổi. Reviewer chỉ review; push/release agent trả lỗi cho implementer.
- Migration dev: `npm run migrate:dev`, commit `prisma/migrations`; không `prisma db push`.
  Production dùng `prisma migrate deploy` qua build command.

## Completion resource gate

`Resource Impact`: None, Business specification, API contract, Schema semantics, Architecture/UI
standard, Environment, Workflow/skill hoặc tập hợp cần thiết. Cập nhật owner trong bảng router;
business/API change thêm regression và consumers tương ứng; DB change thêm Prisma migration.
Code sửa để khớp spec hiện có → `None` kèm lý do. Tài liệu chỉ liên kết owner, không chép lại quy tắc.

Báo cáo verification, điều đã/chưa chứng minh và resource đã cập nhật. Git giữ change history;
không tạo `changes/`, task changelog, `task.md` hay `implementation_plan.md`.
