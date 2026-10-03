# 🐟 Bạn Cá Bán Matcha

Ứng dụng Next.js phục vụ menu, đặt món, tích điểm, voucher và vận hành cửa hàng Bạn Cá Bán Matcha.

## Chạy local

Yêu cầu Node.js tương thích phiên bản Next.js của dự án, Supabase PostgreSQL/Storage và các biến
trong `.env.local.example`. Hướng dẫn local dành cho người vận hành; agent theo gate trong AGENTS.

```bash
npm install
cp .env.local.example .env.local
npm run migrate:dev
npm run dev
```

## Stack chính

- Next.js 16 App Router, React 19 và TypeScript strict
- Tailwind CSS; Radix/Vaul thông qua project UI primitives
- Prisma trên Supabase PostgreSQL
- Custom JWT bằng `jose` và httpOnly cookies
- Axios client dùng chung, Zustand chỉ cho cart, Vercel deploy

## Tài liệu

- Bắt đầu mọi task tại [`AGENTS.md`](./AGENTS.md). File này sẽ chỉ đúng resource cần đọc; không đọc toàn bộ tài liệu mặc định.
- Kiến trúc và UI conventions hiện hành nằm tại [`SPECIFICATION.md`](./SPECIFICATION.md).
- API, schema semantics, cấu trúc file và quyết định đang hoãn lần lượt thuộc `API.md`, `SCHEMA.md`, `STRUCTURE.md`, `NOTES.md`.
- Feature UI và quy tắc duy trì tài liệu: [spec registry](docs/specs/README.md).
- Lý do các quyết định dài hạn: [decision log](docs/decisions/README.md), chỉ đọc khi task cần bối cảnh.

Lịch sử thay đổi nằm trong Git. Dự án không dùng thư mục `changes/`, changelog theo task, `task.md` hay `implementation_plan.md`.
