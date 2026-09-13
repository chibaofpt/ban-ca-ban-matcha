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
| `src/views/` | Page composition và orchestration phía client; gọi service, không sở hữu URL/HTTP client |
| `src/components/ui/` | Shared UI primitives và managed overlay stack; không gọi API hoặc chứa nghiệp vụ |
| `src/components/<domain>/` | Leaf UI và feature containers của domain |
| `src/services/` | API URL, Axios calls, frontend DTO mapping |
| `src/hooks/` | Reusable React/browser orchestration; có thể gọi service, không gọi HTTP trực tiếp |
| `src/lib/` | Frontend-only client, store, types và UI-adjacent pure logic |
| `src/lib/queryClient.ts` | Shared TanStack Query defaults và private-cache eviction |
| `src/utils/` | Pure cross-layer utilities |
| `lib/` | Server-only domain workflow, Prisma data access và external adapters |
| `lib/redis.ts` | Upstash adapter duy nhất cho server cache và rate-limit client |
| `lib/cache.ts`, `lib/cacheInvalidation.ts` | Cache-aside key/TTL và invalidation groups sau writes |
| `lib/validations/` | Shared server Zod schemas |
| `prisma/` | Physical schema và committed migrations |
| `scripts/` | Operator tooling; data repair mặc định dry-run, apply phải chỉ rõ đối tượng |
| `.agents/skills/<name>/SKILL.md` | Project-local reusable workflow skill |
| `.agents/skills/<name>/references/` | Chi tiết thuộc skill, chỉ đọc theo nhánh SKILL.md định tuyến |
| `docs/specs/` | Feature UI specs độc lập; registry sở hữu quy tắc duy trì spec/harness |
| `docs/decisions/` | ADR cho lý do dài hạn; không chứa task log hay bản sao current spec |

Feature container trong `src/components/<domain>` được phép gọi `src/services`; leaf UI và mọi file trong `src/components/ui` thì không. Không di chuyển component chỉ để thỏa một layer lý tưởng trong lúc sửa bug.

## Feature placement

Chỉ đọc mapping liên quan feature; behavior nằm ở link owner, không được định nghĩa lại ở đây.

| Phần | Placement / owner |
|---|---|
| Voucher admin composition | `src/components/admin`; use-now trong shared voucher sheet/hook hiện có; [Voucher UI](docs/specs/voucher-ui.md) |
| Voucher scope normalization/fallback | `lib/`; URL/types tại voucher services; persistence tại Prisma |
| Welcome reward/gacha | Customer UI tại `src/components/rewards`, Admin UI tại `src/components/admin/rewards`; orchestration tại `src/hooks`, URL/DTO tại `src/services`, pure presentation tại `src/utils`; server workflow tại `lib/welcomeReward*.ts` và `lib/adminReward*.ts`; HTTP tại `app/api/customer/rewards/welcome` và `app/api/admin/{welcome-reward-settings,reward-campaigns}`; [Reward UI](docs/specs/reward-ui.md) |
| `OverlayStackProvider` và hook/scope nội bộ | `src/components/ui`; composition/dismiss behavior tại [UI system](SPECIFICATION.md#ui-system) |
| `ScopedMenuVoucherPicker`, `AddonItemPicker` | Feature picker hiện có; target/setup behavior tại [Voucher UI](docs/specs/voucher-ui.md) |
| Cart source type | `src/lib/types/cart.ts` |
| Cart mutation/projection/serializer/BUNDLE resolver | Module nhỏ trong `src/lib/utils/`; behavior tại [Cart và POS](docs/specs/cart.md) |
| Versioned localStorage migration và safe read/write | `src/lib/store/cartStorage.ts` |

## Test placement

- `lib/__tests__/**/*.{test,spec}.ts` chạy trong Vitest project `node` cho route và server logic.
- `src/__tests__/services/` kiểm tra payload, response thành công và lỗi từ API qua service thật.
- `src/__tests__/utils/` giữ pure calculator dùng chung; `src/__tests__/lib/` giữ response mapping,
  helper backend được kiểm tra tại vị trí cũ và pure security không phụ thuộc UI.
- `src/__tests__/api/` hiện chứa test backend route; không phân loại thành UI chỉ vì nằm trong `src/`.
- Các test chỉ đọc source/schema/SQL được khai báo trong project `static-contract`; chúng chỉ chứng minh
  artifact tĩnh, không chứng minh migration đã chạy hoặc PostgreSQL thực thi đúng.
- Lane, fixture/mock và manual UI acceptance thuộc [tdd](.agents/skills/tdd/SKILL.md);
  không thêm runner chỉ vì một file nằm ở frontend.

## Import boundaries

- Client code không import `lib/` server-only.
- `src/services` dùng duy nhất `src/lib/api/client.ts`; không tạo Axios instance khác.
- API URL chỉ được khai báo trong `src/services`, trừ legacy exception đã ghi trong `SPECIFICATION.md`.
- View, feature container và hook chỉ gọi hàm export từ `src/services`; không import Axios,
  `apiClient`, gọi `fetch` tới app API hoặc ghép API URL.
- TanStack Query `queryFn`/`mutationFn` gọi service; Query quản lý remote server state, service quản lý
  transport/DTO. Tái sử dụng query-key constant hiện có và prefix private key theo audience.
- Server Component gọi read workflow trong `lib/` trực tiếp; không gọi loopback HTTP tới app API.
- Chỉ `lib/redis.ts` import Upstash Redis; cache key/TTL và invalidation đi qua cache owners ở trên.
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
