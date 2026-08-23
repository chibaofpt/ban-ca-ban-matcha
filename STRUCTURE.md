# Bạn Cá Bán Matcha — File Placement

> **Authority:** vị trí file, import boundary và naming.
> **Read when:** tạo, di chuyển hoặc tách file.
> **Update when:** một layer hoặc placement rule được kiến trúc chấp thuận thay đổi.
> **Does not own:** kiến trúc tổng thể, nghiệp vụ, API contract hoặc danh sách file hiện tại.

Không duy trì cây thư mục thủ công trong tài liệu này. Dùng `rg --files` để xem cấu trúc thật.

## Placement

| Nơi | Trách nhiệm |
|---|---|
| `app/**/page.tsx` | Route entry, metadata và server composition nhỏ |
| `app/api/**/route.ts` | HTTP boundary: auth, Zod validation, gọi server logic, chuẩn hóa response |
| `src/views/` | Page composition và orchestration phía client |
| `src/components/ui/` | Shared UI primitives; không gọi API hoặc chứa nghiệp vụ |
| `src/components/<domain>/` | Leaf UI và feature containers của domain |
| `src/services/` | API URL, Axios calls, frontend DTO mapping |
| `src/hooks/` | Reusable React/browser orchestration |
| `src/lib/` | Frontend-only client, store, types và UI-adjacent pure logic |
| `src/utils/` | Pure cross-layer utilities |
| `lib/` | Server-only business logic, Prisma và external adapters |
| `lib/validations/` | Shared server Zod schemas |
| `prisma/` | Physical schema và committed migrations |
| `.agents/skills/<name>/SKILL.md` | Project-local reusable workflow skill |

Feature container trong `src/components/<domain>` được phép gọi `src/services`; leaf UI và mọi file trong `src/components/ui` thì không. Không di chuyển component chỉ để thỏa một layer lý tưởng trong lúc sửa bug.

## Import boundaries

- Client code không import `lib/` server-only.
- `src/services` dùng duy nhất `src/lib/api/client.ts`; không tạo Axios instance khác.
- API URL chỉ được khai báo trong `src/services`, trừ legacy exception đã ghi trong `SPECIFICATION.md`.
- `src/utils/pricing.ts` là pure pricing; `lib/pricing.ts` là DB wrapper. Không nhân bản công thức.
- Third-party SDK cho Storage, Realtime, maps hoặc messaging chỉ được import trong adapter/hook, không import trực tiếp vào UI.
- Dùng alias `@/*` → repository root.

## Naming

| Loại | Quy ước |
|---|---|
| View | `PascalCasePage` |
| Component | `PascalCase` |
| Hook | `useCamelCase` |
| Service | `camelCaseService` hoặc domain-named module |
| Utility/type | `camelCase` |
| Route handler | `route.ts` |

## Size and movement

- Production file mới tối đa 300 dòng, lý tưởng 150–200 dòng.
- File hiện có trên 300 dòng được grandfathered; không split khi đang sửa bug nhỏ.
- Rename, move, split hoặc delete cần task refactor riêng, caller inventory và characterization tests.
- Không tạo folder mới nếu placement hiện tại đã biểu diễn đúng trách nhiệm.
