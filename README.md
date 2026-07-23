# 🐟 Bạn Cá Bán Matcha

Web app đặt đồ uống matcha takeaway — dành cho khách hàng 16–26 tuổi tại Việt Nam.

## Tổng quan

- Khách hàng xem menu, đặt đơn, tích điểm đổi voucher
- Staff quét QR, xác nhận voucher, cộng điểm thủ công
- Admin quản lý menu, đơn hàng, gói voucher, log điểm

## Prerequisites

- Node.js 18+
- Tài khoản Supabase (database + storage)
- Tài khoản Vercel (deploy)

## Setup local

```bash
# 1. Clone và install
npm install

# 2. Copy env template
cp .env.local.example .env.local
# Điền đầy đủ các biến trong .env.local

# 3. Apply committed Prisma migrations
npm run migrate:dev

# 4. Chạy dev server
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000) để xem kết quả.

## Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 App Router + TypeScript |
| Styling | Tailwind CSS |
| Database | Supabase PostgreSQL + Prisma |
| Auth | Custom JWT (jose) + httpOnly cookies |
| State | Zustand (cart) |
| Deploy | Vercel |

## Tài liệu cho dev

Đọc theo thứ tự này trước khi viết bất kỳ dòng code nào:

1. [`AGENTS.md`](./AGENTS.md) — entry point, hard rules, and documentation routing
2. [`STRUCTURE.md`](./STRUCTURE.md) — folder layout, naming conventions, import boundaries
3. [`API.md`](./API.md) — request/response contracts and API business notes
4. [`SCHEMA.md`](./SCHEMA.md) — database fields and canonical order totals
5. [`NOTES.md`](./NOTES.md) — unresolved implementation policies and deferred work
6. `.agents/skills/order-flow`, `voucher-flow`, and `pricing-logic` — authoritative domain rules

## Build Phases

| Phase | Nội dung | Trạng thái |
|---|---|---|
| 0 | Landing page + menu tĩnh + cart Zustand | ✅ Done |
| 1 | Auth (register/login/logout/refresh) + Prisma schema | ✅ Done |
| 2 | Menu API + admin CRUD + image upload | ✅ Done |
| 3 | Orders + points | ✅ Done |
| 4 | Vouchers + QR scanner | ✅ Done |
| 5 | Promotions + OTP + Redis | ⏳ |
