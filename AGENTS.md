# Bạn Cá Bán Matcha — Agent Entry Point

> Đọc file này đầu tiên trong mọi session. Không dùng workaround im lặng khi resource, code và test mâu thuẫn.

## CodeGraph bootstrap

- For code-related sessions, run one task-focused CodeGraph query before `rg` or raw reads; treat its source as already read and narrow a follow-up query only when needed.
- Skip non-code or unindexed tasks; never initialize an index without the user, and use normal tools only for missing or stale details.

## Current state

- [x] Supabase, Prisma, custom auth
- [x] Admin menu CRUD
- [x] Orders và points
- [x] Vouchers và QR
- [ ] Promotions, OTP và application cache — chỉ triển khai khi có task Phase 5 được duyệt

## Resource router

Chỉ đọc resource liên quan task; không đọc tất cả mặc định.

| Khi task chạm | Đọc trước |
|---|---|
| Architecture, data flow, shared UI/pattern | `SPECIFICATION.md` |
| Tạo/move/split file | `STRUCTURE.md` |
| API path, method, request/response | `API.md` và `api-layer` skill |
| Prisma/schema/migration | `SCHEMA.md`, Prisma files và `supabase` skill |
| Order lifecycle/status/points | `order-flow` skill |
| Voucher eligibility/lifecycle | `voucher-flow` skill |
| Pricing/rounding | `pricing-logic` skill |
| UI/mobile/form/overlay | `mobile-ux` skill + UI section của `SPECIFICATION.md` |
| Test/feature/business bug | `tdd` skill |
| Sub-agent, chia agent, Backend/Frontend/QA agent, delegate hoặc làm song song | `subagent-orchestration` skill |
| Deferred/unresolved/env | `NOTES.md` hoặc `.env.local.example` |
| Push staging/production | `push-to-dev` hoặc `production-deploy` skill |

Ownership cụ thể thắng mô tả tổng quát. Nếu canonical resource, code và test không khớp, phân loại documentation drift hay implementation defect trước khi sửa; không tự chọn phía thuận tiện.

## Change contract

Trước khi sửa production code, ghi ngay trong task/plan:

```text
Expected behavior:
Current failure:
Allowed production files:
Invariants that must not change:
Forbidden actions:
Tests:
Resource Impact:
```

`Resource Impact`: `None`, `Business specification`, `API contract`, `Schema semantics`, `Architecture/UI standard`, `Environment`, `Workflow/skill`, hoặc tập hợp cần thiết.

### Scope classes

- **Micro:** tối đa 3 production files; không schema/API/dependency/move.
- **Standard:** 4–8 production files hoặc behavior cục bộ.
- **Architecture:** cross-domain, schema/API/auth/order/voucher/pricing, dependency hoặc file movement.

Với Micro/Standard, mặc định cấm rename/move/split/delete, whole-file format, cleanup refactor, dependency/schema/API changes và unrelated lint fixes. Dùng patch hunk nhỏ.

Dừng và re-plan khi Micro vượt 3 production files, chạm ngoài allowlist, có rename/delete/move, production churn vượt 150 dòng, hoặc churn quá 25% trong file từ 100 dòng. `churn = additions + deletions`; từ chối EOL/format-only churn.

Production file mới tối đa 300 dòng. Existing file trên 300 dòng được grandfathered; chỉ refactor bằng task riêng có characterization tests.

## Stack — do not deviate

| Layer | Technology |
|---|---|
| Framework | Next.js 16 App Router, TypeScript strict |
| Styling | Tailwind; Framer Motion cho mobile UX/meaningful motion |
| ORM/DB | Prisma + Supabase PostgreSQL |
| Auth | Custom phone/password, `jose`, httpOnly cookies |
| Validation/form | Zod; React Hook Form + Zod resolver |
| State | Zustand chỉ cho cart/localStorage |
| HTTP | Một Axios instance tại `src/lib/api/client.ts` |
| Storage | Supabase Storage bucket `menu-images` |
| QR | `qrcode` client; `html5-qrcode` scanner |
| Error/cache/deploy | Sentry; Upstash security rate limit only; Vercel |

Không dùng NextAuth/Supabase Auth, raw SQL nếu chưa được yêu cầu, Redis application cache/OTP/ZNS trước Phase 5, hoặc third-party SDK trực tiếp trong UI.

## Hard rules

- Không dùng TypeScript `any`.
- Money là integer VND; gram là Prisma `Decimal`; final price ceil 1.000 VND server-side.
- Success `{ data: T }`; error `{ error, code }`; payload bổ sung dùng `details`, không dùng `data`.
- Không expose `users.id` hoặc `vouchers.id`; dùng `qr_token` theo API compatibility rules.
- Multi-step DB writes dùng `prisma.$transaction()`.
- Trước schema change, audit schema+migrations; reuse field/relation phù hợp, không thêm derived/convenience field.
- Không rename route/method/field/feature vì thuật ngữ; breaking change cần user duyệt migration/compatibility.
- Server re-fetch giá từ DB; không tin client price.
- `points_log` immutable; reversal là row delta âm mới.
- `"use client"` chỉ khi cần hooks/browser event.
- Không `window.confirm`; dùng `ConfirmModal`.
- Không secret hardcode; env mới phải thêm `.env.local.example`.
- Exported function mới cần one-line JSDoc.
- Mọi page export metadata hoặc `generateMetadata`.
- Client `src/` không import `lib/` server-only.
- Pricing chỉ ở `src/utils/pricing.ts` → `lib/pricing.ts`; customer/staff dùng chung calculator.
- Latte soft delete; kiểm tra `reference_latte_item_id`; không tạo `menu_item_addons`.
- Categories đúng `latte`, `fusion`, `extras`; `extras` là fixed-price merchandise, không cấu hình drink.
- `addon_groups` global; Base Liquid reuse `milk_type`, không thêm discriminator/junction.
- Fusion mới/sửa cần default Base Liquid; legacy Fusion chưa config vẫn compatible đến khi edit.
- `menu_item_sizes.base_liquid_ml = NULL` fallback `default_size_config.milk_ml`.
- Phone normalize `+84`; ghost user hash là `GHOST_USER_NO_PASSWORD`.
- Cart chỉ localStorage; admin đầu tiên tạo thủ công, không seed/setup route.
- 1 🐟 = 1.000 VND.
- Login luôn chạy bcrypt compare kể cả user không tồn tại.
- External services phải qua adapter/wrapper trong `lib/` hoặc hook; UI không import SDK trực tiếp.

## Database and verification

- Daily dev migration: `npm run migrate:dev`; không dùng `prisma db push`.
- Commit `prisma/migrations`; production dùng `prisma migrate deploy` qua build command.
- Không mở browser hay chạy `npm run dev`/`npm run build` sau thay đổi trong agent workflow.
- Trong implementation chạy targeted tests; trước staging chạy lint, type-check, full tests và `npm run resources:check`.
- Reviewer chỉ review. Push/release agent không tự sửa lỗi; trả finding về implementer.

## Completion resource gate

- Business rule → domain skill + regression tests.
- API → `API.md` + consumer types/services/tests.
- DB → Prisma migration + `SCHEMA.md`; thêm `API.md` nếu public contract đổi.
- Architecture/shared UI/integration → `SPECIFICATION.md`.
- Placement/import → `STRUCTURE.md`.
- Env → `.env.local.example`.
- Deferred/unresolved → `NOTES.md`.
- Workflow/release → skill tương ứng.
- Code được sửa để khớp spec hiện có → `None`.

Completion report phải nêu resource đã cập nhật hoặc lý do `None`. Git là change history; không tạo `changes/`, task changelog, `task.md` hay `implementation_plan.md`.

@RTK.md
