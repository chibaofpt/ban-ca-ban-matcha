---
name: tdd
description: >
  Viết test trước khi implement — áp dụng TDD workflow cho project Bạn Cá Bán Matcha.
  Use this skill whenever implementing features from an implementation plan, creating
  new API routes, business logic, services, or any significant workflow/feature.
  Also trigger on: "viết test", "test lại", "kiểm tra logic", "cover test cho",
  "write test", "add test", "test plan".
---

# TDD Skill

> Viết test skeleton → implement code → chạy test verify.
> Skill này là một phần bắt buộc của workflow implement — không được skip.

---

## Khi nào trigger

| Trigger | Mô tả |
|---|---|
| Implementation plan được approve | Agent viết test TRƯỚC khi implement bất kỳ file nào |
| User yêu cầu trực tiếp | "viết test", "test lại", "kiểm tra logic", "cover test cho..." |
| Tạo feature / workflow mới | Bất kỳ feature có business logic phức tạp |
| Bug fix có business logic | Fix bug mà cần verify nhiều nhánh logic |

---

## Workflow — Thứ tự bắt buộc

### Bước 1: Xác định Test Scope (trong implementation plan)

Khi viết `implementation_plan.md`, PHẢI thêm section **"Test Plan"** ở cuối (trước Verification Plan).

```markdown
## Test Plan

### Backend Tests

#### [file test path] — [mô tả]
- `describe("...")` — context
  - `it("case 1")` — mô tả ngắn gọn
  - `it("case 2")` — mô tả ngắn gọn

### Frontend Tests (nếu có)

#### [file test path] — [mô tả]
- `describe("...")` — context
  - `it("case 1")` — mô tả
```

**Quy tắc xác định file nào cần test:**

| Cần test ✅ | Không cần test ❌ |
|---|---|
| Route handler có business logic phức tạp (validation, transition rules, pricing) | Route CRUD đơn giản (chỉ findMany + trả về) |
| Helper/utility functions có logic tính toán (cancelOrder, pricing) | Config files, constants |
| Service functions có data transformation | Page entry files (`app/**/page.tsx`) |
| State logic phức tạp (Zustand slices với side effects) | UI-only components không có logic |
| Validation schemas có custom transforms | Re-export files |

### Bước 2: User review Test Plan cùng với Implementation Plan

Test Plan là một phần của `implementation_plan.md` → user review và approve tất cả cùng lúc.

### Bước 3: Viết test skeleton (sau khi user approve)

**Viết test file đầy đủ TRƯỚC khi implement bất kỳ production code nào.**

- Tests sẽ FAIL — đây là hành vi đúng (TDD).
- Mock tất cả dependencies (prisma, auth, external services).
- Chạy test 1 lần để xác nhận tests compile và fail đúng chỗ (không fail vì syntax error).

### Bước 4: Implement production code

Implement code theo plan. Tests sẽ dần pass.

### Bước 5: Chạy test, fix cho đến khi ALL PASS

```bash
node node_modules/vitest/vitest.mjs run [test-file-path]
```

Sau đó chạy full suite:
```bash
node node_modules/vitest/vitest.mjs run
```

---

## Test File Organization

### Quy tắc gộp/tách file

- **Gộp vào file test hiện có** nếu cùng domain (ví dụ: thêm test cancel mới → gộp vào `order-cancel.test.ts`).
- **Tạo file mới** CHỈ khi:
  - Chưa có file test nào cho domain đó
  - File hiện có đã quá 300 dòng VÀ feature mới đủ lớn (>10 test cases)

### Cấu trúc thư mục (giữ nguyên hiện tại)

```
lib/__tests__/                          ← Backend: route handlers, helpers, business logic
src/__tests__/
  ├── components/{domain}/              ← Frontend: logic-only tests (không render React)
  ├── services/                         ← Frontend: service mock tests
  ├── lib/                              ← Frontend: utility/helper logic
  └── pricing/                          ← Integration tests (pricing pipeline)
```

### Naming convention

- Backend: `lib/__tests__/{domain-feature}.test.ts` (ví dụ: `order-cancel.test.ts`, `vouchers.test.ts`)
- Frontend components: `src/__tests__/components/{domain}/{Feature}.logic.test.ts`
- Frontend services: `src/__tests__/services/{domain}Service.test.ts`

---

## Test Patterns — Conventions bắt buộc

### Ngôn ngữ

- `describe()` / `it()` block descriptions: **Tiếng Việt**
- Code, comments, variable names: **Tiếng Anh**

```typescript
describe("PATCH /api/staff/orders/[id] — huỷ đơn", () => {
  it("Staff không được hủy đơn → trả 400 INVALID_TRANSITION", async () => {
    // English code here
    const res = await PATCH(makeReq({ status: "CANCELLED" }), { ... });
    expect(res.status).toBe(400);
  });
});
```

### Mocking pattern

```typescript
// ── Khai báo mock trước import ──────────────────────────────────
const mockGetSession = vi.fn();
const mockOrderFindUnique = vi.fn();

vi.mock("@/lib/auth", () => ({
  getSession: () => mockGetSession(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    order: { findUnique: (...args: unknown[]) => mockOrderFindUnique(...args) },
    $transaction: vi.fn(),
  },
}));

// ── Import SAU mock ──────────────────────────────────────────────
import { PATCH } from "@/app/api/staff/orders/[id]/route";
```

### Transaction mock pattern

```typescript
mockTransaction.mockImplementation(
  async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      order:  { findUnique: mockFn, update: mockFn },
      voucher: { findUnique: mockFn, update: mockFn },
      // ... chỉ include tables mà code thực sự dùng
    };
    return fn(tx);
  }
);
```

### Test structure

Mỗi `describe` block nên follow pattern:

```typescript
describe("Feature / Endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup common mocks
  });

  // Group 1: Happy paths
  it("case thành công 1", async () => { ... });
  it("case thành công 2", async () => { ... });

  // Group 2: Auth & Role errors
  it("trả 401 khi chưa đăng nhập", async () => { ... });
  it("trả 403 khi role không đủ", async () => { ... });

  // Group 3: Validation errors
  it("trả 400 khi input không hợp lệ", async () => { ... });

  // Group 4: Business rule errors
  it("trả 422 khi vi phạm business rule", async () => { ... });

  // Group 5: Edge cases
  it("race condition: đã bị cancel bởi request khác → skip", async () => { ... });
});
```

---

## Checklist — Agent tự kiểm tra trước khi submit

### Khi viết implementation plan:
- [ ] Có section "Test Plan" liệt kê test cases
- [ ] Test cases bao phủ: happy path, auth errors, validation errors, business rule errors, edge cases

### Khi viết test skeleton:
- [ ] Mock khai báo TRƯỚC `import`
- [ ] `vi.clearAllMocks()` trong `beforeEach`
- [ ] Không dùng `any` — type mocks correctly
- [ ] Test descriptions bằng tiếng Việt
- [ ] Gộp vào file test hiện có nếu cùng domain

### Khi implement xong:
- [ ] Chạy test file riêng → ALL PASS
- [ ] Chạy full suite → không regression
- [ ] Cập nhật task.md ghi nhận test status

---

## Ví dụ Test Plan trong Implementation Plan

```markdown
## Test Plan

### Backend Tests

#### `lib/__tests__/order-cancel.test.ts` — Thêm test cases cho admin cancel rules
- `describe("PATCH /api/staff/orders/[id] — admin cancel")`
  - `it("Staff cố hủy đơn → 400")` — chỉ ADMIN mới cancel được
  - `it("Admin hủy COUNTER COMPLETED → reverse points")` — trừ lại order_complete
  - `it("Points balance floor về 0")` — khách đã tiêu điểm, không cho âm
  - `it("Admin hủy PICKUP COMPLETED → 400")` — block cancel online completed
  - `it("Admin hủy PENDING → 200")` — cho phép cancel online chưa complete
  - `it("Restore voucher RESERVED → ACTIVE")` — voucher phải về ACTIVE

### Frontend Tests

#### `src/__tests__/services/orderService.test.ts` — Thêm test cho adminCancelOrder
- `describe("adminCancelOrder")`
  - `it("gọi PATCH với status CANCELLED")` — đúng endpoint, đúng body
  - `it("throw error khi API trả 400")` — handle lỗi
```
