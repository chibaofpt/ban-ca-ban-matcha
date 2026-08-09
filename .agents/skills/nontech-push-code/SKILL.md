---
name: nontech-push-code
description: >
  QA check và push code từ branch nontech-changes lên dev/non-tech.
  Dành cho người non-tech sau khi đã sửa xong bằng nontech-mode.
  Workflow: check diff → chạy lint + type-check + test → commit → push lên nhánh dev/nontech-mode.
  Trigger: "nontech-push-code", "đẩy code lên", "push code", "xong rồi đẩy lên đi".
---

# Nontech Push Code — QA và đẩy code an toàn

> Skill này kiểm tra chất lượng code đã sửa qua `nontech-mode`, sau đó commit và
> push lên nhánh `dev/nontech-mode` để Bảo review. Agent giao tiếp hoàn toàn bằng
> tiếng Việt.

---

## 1. Điều kiện tiên quyết

- Phải đang ở branch `nontech-changes`
- Phải có thay đổi chưa commit (unstaged hoặc staged)
- Nếu không thỏa → thông báo: "Chưa có thay đổi nào cần đẩy lên."

---

## 2. Quy trình

### Bước 1 — Kiểm tra branch

```powershell
git branch --show-current
```

- Nếu KHÔNG phải `nontech-changes` → DỪNG
- Thông báo: "Cần chuyển về branch nontech-changes trước. Hãy nhờ Bảo kiểm tra."

### Bước 2 — Xem diff tổng quan

```powershell
git diff --stat
git diff --stat --staged
git status --short
```

- Liệt kê tất cả file đã thay đổi bằng tiếng Việt
- Kiểm tra an toàn: nếu có file thuộc vùng cấm (theo nontech-mode skill) bị thay đổi → DỪNG + cảnh báo

### Bước 3 — QA Gate

Chạy tuần tự các check sau:

```powershell
npm.cmd run lint
npx.cmd tsc --noEmit
npm.cmd run test
```

- Nếu **TẤT CẢ PASS** → tiếp tục Bước 4
- Nếu có lỗi:
  - Thử sửa tự động (tối đa **2 lần**)
  - Nếu vẫn fail → DỪNG
  - Thông báo: "Có lỗi khi kiểm tra code. Cần Bảo xem lại trước khi đẩy lên."
  - Liệt kê lỗi bằng tiếng Việt đơn giản (không thuật ngữ)

### Bước 4 — Review diff chi tiết

Đọc toàn bộ diff và kiểm tra:

```powershell
git diff
git diff --staged
```

**Checklist review:**
- [ ] Không có file vùng cấm bị sửa
- [ ] Không có `any` trong TypeScript
- [ ] Không có secret/password/key hardcoded
- [ ] Không có `console.log` debug thừa
- [ ] Không có file env, scratch, backup bị stage
- [ ] API response format đúng `{ data: T }` hoặc `{ error, code }`
- [ ] Không có import `lib/` trong `src/`
- [ ] Không có `window.confirm`
- [ ] File không vượt 300 dòng

Nếu phát hiện vấn đề:
- Vấn đề nhỏ (console.log thừa, format) → tự sửa
- Vấn đề lớn (logic sai, vùng cấm) → DỪNG + thông báo + "Cần Bảo xem lại"

### Bước 5 — Commit

```powershell
git add -- <reviewed-files>
git diff --cached --check
```

- Chỉ stage những file đã review ở Bước 4
- **KHÔNG** dùng `git add .`
- **KHÔNG** stage file env, scratch, hoặc backup

Commit message format:
```
[nontech] Mô tả ngắn gọn bằng tiếng Việt

- file1: thay đổi gì
- file2: thay đổi gì
```

Ví dụ:
```
[nontech] Thêm cột SĐT vào bảng đơn hàng admin

- src/views/admin/AdminOrdersPage.tsx: thêm cột Số điện thoại
- src/components/staff/OrderCard.tsx: hiển thị SĐT trên card
```

### Bước 6 — Push lên nhánh dev/nontech-mode

```powershell
git push origin nontech-changes:dev/nontech-mode
```

- Push branch local `nontech-changes` lên remote branch `dev/nontech-mode`
- **KHÔNG** push lên `dev`, `main`, hoặc bất kỳ branch khác
- **KHÔNG** dùng `--force`
- Nếu push bị reject (non-fast-forward):
  - DỪNG
  - Thông báo: "Không thể đẩy code lên vì có xung đột. Cần Bảo xử lý."

### Bước 7 — Báo cáo kết quả

Báo cáo bằng tiếng Việt:

```
✅ Đã đẩy code lên thành công!

📋 Những thay đổi đã đẩy:
- [Liệt kê thay đổi theo góc nhìn người dùng]

🔍 Kết quả kiểm tra:
- Kiểm tra cú pháp: ✅
- Kiểm tra kiểu dữ liệu: ✅
- Kiểm tra chức năng: ✅

📌 Commit: [commit SHA ngắn]
📌 Nhánh: dev/nontech-mode

👉 Bảo sẽ review và merge vào dev khi sẵn sàng.
```

---

## 3. Quy tắc giao tiếp

- **Ngôn ngữ**: Tiếng Việt hoàn toàn
- **Giọng điệu**: Trung lập — "đã thực hiện", "vui lòng xác nhận"
- **Không dùng thuật ngữ**: lint, type-check, CI, pipeline, merge conflict
- **Thay bằng**: "kiểm tra cú pháp", "kiểm tra kiểu dữ liệu", "kiểm tra chức năng", "xung đột code"
- **Escalation**: "Cần Bảo xử lý vì [lý do]"

---

## 4. Hard Rules

- KHÔNG push lên `dev` hoặc `main` — chỉ push lên `dev/nontech-mode`
- KHÔNG dùng `git push --force`
- KHÔNG dùng `git add .`
- KHÔNG stage file `.env*`, scratch, backup, `ROLLBACK_*.sql`
- KHÔNG merge bất kỳ branch nào
- KHÔNG rebase
- KHÔNG amend commit đã push
- KHÔNG chạy `db push`, `migrate reset`, hoặc bất kỳ Prisma migration command nào
- KHÔNG chạy `npm run build`; chỉ chạy lint + type-check + test theo `AGENTS.md`
- Nếu phát hiện vấn đề nghiêm trọng trong diff → DỪNG hoàn toàn, KHÔNG cố push
- Ghi mọi kết quả QA bằng tiếng Việt
