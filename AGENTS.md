# Bạn Cá Bán Matcha — Agent Entry Point

> Load this file **first, every session**. No silent workarounds — if something conflicts, stop and ask.

---

## Current State

- [x] Phase 1 — Supabase, Prisma tables, auth routes, middleware, Login/Register pages
- [x] Phase 2 — Admin menu CRUD (edit + delete)
- [x] Phase 3 — Orders + Points
- [x] Phase 4 — Vouchers + QR
- [ ] Phase 5 — Promotions + OTP + Redis

> When a task is done: change `[ ]` → `[x]`. Read this section first every session.

---

## Index — Read Before Acting

| Task | File |
|---|---|
| Create / move any file or folder | `STRUCTURE.md` |
| API route, request/response shape | `API.md` |
| DB schema, Prisma, migration, enum | `SCHEMA.md` |
| Deferred issues, unresolved decisions, env vars | `NOTES.md` |
| Order lifecycle, status, points | `.agents/skills/order-flow/SKILL.md` |
| Voucher rules, stacking, lifecycle | `.agents/skills/voucher-flow/SKILL.md` |
| Price formulas and rounding | `.agents/skills/pricing-logic/SKILL.md` |
| Nontech mode (co-founder sửa UI/report) | `.agents/skills/nontech-mode/SKILL.md` |
| Nontech push code (QA + đẩy code) | `.agents/skills/nontech-push-code/SKILL.md` |

> Never skip reading the relevant file. Do not rely on memory alone.

---

## Behavior Rules

- Do not open browser or run `npm run dev` / `npm run build` after changes
- After completing a task: write code, save file, stop
- Daily dev: `npm run migrate:dev` — agent may run automatically
- Do not use `db push` — it breaks Prisma migration history.
- Pre-release: Commit `prisma/migrations` folder to git.
- Production deploy: `prisma migrate deploy` (in Vercel build command) — reads committed migration files.
- Env structure: `.env` / `.env.staging` / `.env.prod` / `.env.local` are gitignored. Use `.env.local.example` as template.
- When modifying business logic: check if the relevant skill needs updating

---

## Stack — Never Deviate

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 16 App Router, TypeScript strict | No `any` — ever |
| Styling | Tailwind CSS | Framer Motion allowed for mobile UX only |
| ORM | Prisma | No raw SQL unless explicitly asked |
| Database | Supabase PostgreSQL | Must use `?pgbouncer=true` in connection string |
| Auth | Custom phone + password, `jose`, httpOnly cookies | No NextAuth, no Supabase Auth |
| Validation | Zod | Every API input — no exceptions |
| Forms | React Hook Form + Zod resolver | |
| State | Zustand — cart only, localStorage | |
| HTTP client | Axios — 1 instance at `src/lib/api/client.ts` | Do not create another instance |
| File storage | Supabase Storage | Bucket: `menu-images` |
| SMS / ZNS | ESMS.vn | `console.log` in dev, real calls in prod |
| QR generate | `qrcode` npm, client-side | |
| QR scan | `html5-qrcode`, mobile camera | |
| Error tracking | Sentry | |
| Cache | Upstash Redis | **Phase 5 ONLY** — do not add before then |
| Deploy | Vercel serverless | |

---

## Hard Rules — Apply to Every Task

- No `any` in TypeScript — ever
- Money = integers in VND, never floats or decimals
- Gram quantities = Prisma `Decimal` — not money, not Float
- API success: `{ data: T }` / error: `{ error: string, code: string }`
- Error responses with additional payload use `details` key, never `data`: `{ error: string, code: string, details: {...} }`
- Never expose `users.id` or `vouchers.id` — always use `qr_token`
- Multi-step DB writes → `prisma.$transaction()`
- Before adding a table, column, enum value, or relation, audit the current Prisma schema and
  migrations. Reuse existing fields and relations whenever they can represent the approved rule;
  never add duplicate or merely convenient derived fields without explicit justification.
- Do not rename an existing API route, HTTP method, request field, response field, or feature
  solely for terminology or refactoring. Preserve the current contract unless the user explicitly
  approves a necessary breaking change and migration path.
- Server always re-fetches prices from DB — never trust client-sent prices
- `points_log` rows are immutable — reversal = insert new negative-delta row
- `"use client"` only when hooks or browser events are needed
- No `window.confirm` — always use `ConfirmModal`
- No hardcoded secrets — always `process.env`, add new vars to `.env.local.example`
- Every exported function needs a one-line JSDoc
- File max 300 lines, ideal 150–200. Break down large components.
- Every page exports `metadata`. Dynamic pages use `generateMetadata`
- Never import `lib/` inside `src/` — backend is server-only
- Pricing: `src/utils/pricing.ts` (pure) → `lib/pricing.ts` (DB wrapper). Never duplicate.
- Customer and staff order entry points must use the same order pricing and voucher calculator.
- All final prices ceil to nearest 1,000 VND server-side
- Never hard delete Latte `menu_item` — soft delete only. Check `reference_latte_item_id` first.
- `menu_item_addons` junction table does not exist — do not create it
- Categories: exactly 3 — `latte`, `fusion`, and `extras`. UI labels `extras` as “Add-on”.
- `extras` menu items are fixed-price standalone merchandise: quantity + note only; no size,
  powder, Base Liquid, sweetness, ice, coldwhisk, or addon configuration.
- `addon_groups` is global — no junction table, no per-item config
- Base Liquid catalog reuses the global `milk_type` table for both Latte and Fusion; do not add a `kind` discriminator.
- Latte uses the global default Base Liquid. Each menu item stores only its allowed swap options; Admin is responsible for keeping Latte options milk-only.
- Fusion requires a per-item default Base Liquid when created or edited. Existing unconfigured Fusion items remain legacy-compatible until edited.
- `menu_item_sizes.base_liquid_ml = NULL` means fall back to `default_size_config.milk_ml` for that size.
- Phone normalized to `+84` before any DB storage or comparison
- Ghost user: `password_hash = "GHOST_USER_NO_PASSWORD"` — register updates existing row
- Cart persisted to localStorage via Zustand — not saved to DB
- Admin first user: created manually via Supabase dashboard — no seed, no setup route
- No Redis, no OTP, no Zalo ZNS until Phase 5
- 1 🐟 = 1,000 VND — DB stores integer VND only
- Timing-safe: always run bcrypt compare even if user not found
- **Adapter/Wrapper Pattern**: All external services (Supabase Storage, Realtime, etc.) MUST be isolated using wrappers (e.g., pure TS functions in `lib/` or custom hooks in `hooks/`). Never import `@supabase/supabase-js` or other 3rd-party SDKs directly into UI components.

---

## Decision Log — Moved to Skills

> Domain-specific rules have been moved to lazy-loaded skills:
> - Pricing formulas, gram/milk/addon/powder pricing → `pricing-logic` skill
> - Order creation workflow, status, store hours, anonymous orders → `order-flow` skill
> - Voucher types, stacking, lifecycle, points, QR scan → `voucher-flow` skill
>
> Agent: read the relevant skill when working on domain-specific tasks.
> Skills extend (never contradict) the Hard Rules above.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
