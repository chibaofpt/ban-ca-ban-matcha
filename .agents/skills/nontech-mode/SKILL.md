---
name: nontech-mode
description: >
  Chế độ làm việc dành cho người non-tech (co-founder). Giới hạn phạm vi sửa đổi
  trong giao diện quản lý đơn hàng và API báo cáo. Agent giao tiếp hoàn toàn bằng
  tiếng Việt, tự kiểm tra an toàn trước khi sửa, và ghi log mọi thay đổi.
  Trigger: "nontech-mode", "chế độ sửa", "sửa giao diện đơn hàng", "sửa report",
  hoặc khi người dùng non-tech mô tả yêu cầu thay đổi UI/report.
---

# Nontech Mode — Chế độ chỉnh sửa an toàn cho Co-founder

> Skill này cho phép một người KHÔNG biết code mô tả yêu cầu bằng tiếng Việt
> (hoặc gửi screenshot), và agent sẽ thực hiện thay đổi an toàn trong phạm vi
> cho phép. Mọi thay đổi được ghi log tại `NONTECH_CHANGELOG.md`.

---

## 1. Phạm vi được phép

Agent CHỈ được thực hiện các thay đổi sau:

| Loại | Ví dụ |
|---|---|
| Sửa giao diện quản lý đơn hàng | Thêm/ẩn cột, đổi layout, sắp xếp lại |
| Sửa API response báo cáo (GET only) | Thêm/bớt trường trả về, đổi cách hiển thị |
| Sửa text / label / copy trên UI | Đổi tên nút, dịch, thêm ghi chú |
| Sửa CSS / style | Màu sắc, font, spacing, layout |
| Thêm filter / sort | Lọc theo trạng thái, sắp xếp theo ngày |
| Sửa logic hiển thị | Ẩn cột khi status = X, đổi badge màu |

---

## 2. Vùng CẤM tuyệt đối

Agent KHÔNG ĐƯỢC chạm vào:

| Vùng cấm | Lý do |
|---|---|
| Prisma schema (`prisma/`) | Thay đổi database = phá hệ thống |
| Auth / Middleware (`lib/auth.ts`, `src/middleware.ts`) | Bảo mật |
| Business logic core (`lib/pricing.ts`, `lib/vouchers.ts`, `lib/orders.ts`, `lib/cancelOrder.ts`, `src/utils/pricing.ts`) | Logic nghiệp vụ |
| Mutation endpoints (POST / PATCH / DELETE handlers) | Thay đổi hành vi ghi dữ liệu |
| Cấu trúc folder / rename file | Phá vỡ imports |
| Route API mới | Cần thiết kế và review |
| Package / dependency mới (`package.json`) | Ảnh hưởng toàn bộ dự án |
| Config files (`next.config.*`, `tsconfig.*`, `.env*`) | Ảnh hưởng toàn bộ dự án |
| `lib/reportAggregation.ts` — aggregation logic | Business logic, chỉ sửa response shape |

**Khi yêu cầu chạm vùng cấm → DỪNG NGAY:**
- Giải thích lý do bằng tiếng Việt đơn giản
- Nói: "Phần này cần Bảo xử lý vì liên quan đến [lý do cụ thể]"
- KHÔNG cố gắng tìm cách vòng (workaround)

---

## 3. Quy trình làm việc

### Bước 1 — Đảm bảo branch đúng

```powershell
git branch --show-current
```

- Nếu đang ở `nontech-changes` → tiếp tục
- Nếu branch `nontech-changes` chưa tồn tại:
  ```powershell
  git checkout dev
  git pull origin dev
  git checkout -b nontech-changes
  ```
- Nếu branch đã tồn tại nhưng chưa checkout:
  ```powershell
  git checkout nontech-changes
  ```
- **KHÔNG BAO GIỜ** làm việc trên branch khác ngoài `nontech-changes`

### Bước 2 — Tiếp nhận yêu cầu

- Nhận mô tả bằng tiếng Việt hoặc screenshot từ người dùng
- Nếu nhận screenshot → phân tích hình và map với bảng UI ↔ File bên dưới
- Hỏi lại bằng tiếng Việt để xác nhận hiểu đúng ý
- Ví dụ: "Vui lòng xác nhận: thêm cột Số điện thoại vào bảng đơn hàng ở trang Admin, đúng không?"

### Bước 3 — Kiểm tra an toàn (Safety Gate)

Trước khi sửa BẤT KỲ file nào:
1. Kiểm tra file có nằm trong vùng cấm không → nếu có → DỪNG + escalate Bảo
2. Kiểm tra thay đổi có chạm mutation logic (POST/PATCH/DELETE handler) không → nếu có → DỪNG
3. Nếu sửa GET API response → kiểm tra TẤT CẢ nơi gọi API đó:
   - Grep codebase tìm service/component nào dùng endpoint này
   - Nếu thêm field → an toàn (existing callers ignore new fields)
   - Nếu XÓA/RENAME field → kiểm tra impact, nếu có caller khác dùng → DỪNG + escalate Bảo

### Bước 4 — Phân loại thay đổi

| Loại | Tiêu chí | Hành động |
|---|---|---|
| **NHỎ** | 1–2 file, chỉ UI/text/CSS | Thực hiện luôn, không cần hỏi |
| **LỚN** | ≥3 file, hoặc chạm API/logic hiển thị | Trình bày kế hoạch bằng tiếng Việt, chờ xác nhận |

Khi trình bày kế hoạch thay đổi LỚN:
- Không dùng thuật ngữ kỹ thuật
- Mô tả theo góc nhìn người dùng: "Trang quản lý đơn hàng sẽ thêm cột X, bỏ cột Y"
- Liệt kê từng thay đổi sẽ thấy được trên giao diện

### Bước 5 — Thực hiện thay đổi

1. Sửa code theo yêu cầu
2. Chạy bộ kiểm tra không làm thay đổi database:
   ```powershell
   npm.cmd run lint
   npx.cmd tsc --noEmit
   npm.cmd run test
   ```
3. Nếu tất cả **PASS** → chuyển sang Bước 6
4. Nếu có bước **FAIL**:
   - Đọc lỗi, thử sửa (tối đa **2 lần**)
   - Nếu sửa được → chạy lại bộ kiểm tra → PASS → Bước 6
   - Nếu sau 2 lần vẫn FAIL:
     → Giữ nguyên thay đổi để Bảo review, không tự hoàn tác file của người dùng
     → Báo: "Không thể hoàn tất kiểm tra an toàn. Cần Bảo xem lại trước khi đẩy code."

### Bước 6 — Ghi log thay đổi

Ghi vào file `NONTECH_CHANGELOG.md` ở root project theo format:

```markdown
## [YYYY-MM-DD HH:mm] — Mô tả ngắn gọn

**Yêu cầu**: [Nguyên văn yêu cầu của người dùng]
**Quyết định**: [Các quyết định người dùng đưa ra, nếu có]
**Thay đổi**:
- `path/to/file1.tsx`: [Mô tả bằng tiếng Việt]
- `path/to/file2.ts`: [Mô tả bằng tiếng Việt]
**Kết quả QA**: ✅ lint + TypeScript + test PASS
```

Nếu QA chưa đạt:
```markdown
## [YYYY-MM-DD HH:mm] — [Mô tả] (THẤT BẠI)

**Yêu cầu**: [Nguyên văn]
**Kết quả QA**: ❌ FAIL → giữ nguyên thay đổi để review, chưa push
**Lý do**: [Mô tả lỗi bằng tiếng Việt đơn giản]
**Hướng xử lý**: Cần Bảo xem lại
```

### Bước 7 — Báo cáo kết quả

- Nói bằng tiếng Việt, không thuật ngữ kỹ thuật
- Mô tả thay đổi theo **góc nhìn người dùng cuối**
- Ví dụ: "Đã thêm cột Số điện thoại vào bảng đơn hàng. Giờ vào trang Quản lý đơn hàng sẽ thấy cột mới bên phải cột Tên khách hàng."

---

## 4. Bảng mapping UI ↔ File

Dùng bảng này để map screenshot hoặc mô tả của người dùng với file cần sửa:

### Trang giao diện

| Trang trên UI | View file | Component files chính |
|---|---|---|
| Quản lý đơn hàng (Admin) | `src/views/admin/AdminOrdersPage.tsx` | `src/components/staff/OrderTabs.tsx`, `src/components/staff/OrderCard.tsx`, `src/components/staff/StatusBadge.tsx` |
| Danh sách đơn (Staff) | `src/views/staff/StaffOrdersListPage.tsx` | `src/components/staff/OrderCard.tsx`, `src/components/staff/StatusBadge.tsx` |
| Báo cáo doanh thu | `src/components/report/DailyReportModal.tsx` | — |
| Chi tiết món trong đơn | `src/components/shared/OrderItemDetails.tsx` | — |
| Thanh tiến trình đơn | `src/components/shared/OrderProgressBar.tsx` | — |

### API endpoints (chỉ được sửa GET response)

| Endpoint | Route file | Được sửa |
|---|---|---|
| `GET /api/admin/orders` | `app/api/admin/orders/route.ts` | Response fields, filter params |
| `GET /api/admin/report` | `app/api/admin/report/route.ts` | Response fields |
| `GET /api/report` | `app/api/report/route.ts` | Response fields |
| `GET /api/staff/orders` | `app/api/staff/orders/route.ts` | Response fields (GET handler only) |
| `GET /api/staff/orders/[id]` | `app/api/staff/orders/[id]/route.ts` | Response fields (GET handler only) |

### Service layer

| Service | File | Được sửa |
|---|---|---|
| Report service | `src/services/reportService.ts` | Type definitions, response mapping |

---

## 5. Quy tắc giao tiếp

- **Ngôn ngữ**: Tiếng Việt hoàn toàn
- **Giọng điệu**: Trung lập, lịch sự — "đã thực hiện", "vui lòng cho biết", "cần xác nhận"
- **Không dùng**: thuật ngữ kỹ thuật (component, state, props, endpoint, handler, etc.)
- **Thay bằng**: ngôn ngữ thường ngày ("trang", "bảng", "cột", "nút", "dữ liệu báo cáo")
- **Escalation**: "Phần này cần Bảo xử lý vì liên quan đến [lý do]"
- **Screenshot**: Hỗ trợ — phân tích hình và map với bảng UI ↔ File

---

## 6. Ràng buộc kỹ thuật (agent tuân thủ ngầm)

Những rule này agent phải tuân thủ nhưng KHÔNG cần giải thích cho người dùng:

- Code TypeScript strict — không `any`
- Tuân thủ AGENTS.md Hard Rules
- `"use client"` chỉ khi cần hooks/browser events
- Không import `lib/` trong `src/`
- File tối đa 300 dòng
- API response format: `{ data: T }` / `{ error: string, code: string }`
- Money = integer VND, không float
- Không `window.confirm` — dùng `ConfirmModal`
- Mọi exported function cần JSDoc 1 dòng

---

## 7. Hard Rules riêng cho Nontech Mode

- KHÔNG commit code — có skill riêng (`nontech-push-code`)
- KHÔNG chạy `npm run dev` hoặc mở browser
- KHÔNG sửa file ngoài phạm vi cho phép dù người dùng yêu cầu
- KHÔNG tạo file mới (trừ ghi log vào `NONTECH_CHANGELOG.md`)
- KHÔNG xóa file
- KHÔNG rename file hoặc di chuyển file
- KHÔNG cài package mới
- Luôn chạy lint, TypeScript và test sau mỗi thay đổi; không chạy build
- Luôn ghi log sau mỗi thay đổi (kể cả thất bại)
- Khi không chắc chắn → hỏi lại người dùng, KHÔNG đoán
