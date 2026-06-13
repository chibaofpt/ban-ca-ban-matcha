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
| Admin/staff UI, flows, form fields, roles | `ADMIN_PLAN.md` |

> Never skip reading the relevant file. Do not rely on memory alone.

---

## Behavior Rules

- Do not open browser or run `npm run dev` / `npm run build` after changes
- After completing a task: write code, save file, stop
- DB sync: `npx prisma db push; npx prisma generate` — agent may run this automatically
- Do not use `migrate dev` — incompatible with pgBouncer
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
- All final prices ceil to nearest 1,000 VND server-side
- Never hard delete Latte `menu_item` — soft delete only. Check `reference_latte_item_id` first.
- `menu_item_addons` junction table does not exist — do not create it
- Categories: exactly 2 — `latte` and `fusion`. No others.
- `addon_groups` is global — no junction table, no per-item config
- `milk_type` is global — latte only, determined by `category` at query time
- Phone normalized to `+84` before any DB storage or comparison
- Ghost user: `password_hash = "GHOST_USER_NO_PASSWORD"` — register updates existing row
- Cart persisted to localStorage via Zustand — not saved to DB
- Admin first user: created manually via Supabase dashboard — no seed, no setup route
- No Redis, no OTP, no Zalo ZNS until Phase 5
- 1 🐟 = 1,000 VND — DB stores integer VND only
- Timing-safe: always run bcrypt compare even if user not found

---

## Decision Log — Moved to Skills

> Domain-specific rules have been moved to lazy-loaded skills:
> - Pricing formulas, gram/milk/addon/powder pricing → `pricing-logic` skill
> - Order creation workflow, status, store hours, anonymous orders → `order-flow` skill
> - Voucher types, stacking, lifecycle, points, QR scan → `voucher-flow` skill
>
> Agent: read the relevant skill when working on domain-specific tasks.
> Skills extend (never contradict) the Hard Rules above.
