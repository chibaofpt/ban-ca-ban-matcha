# Decision log

Chỉ đọc ADR khi task cần lý do, trade-off hoặc điều kiện xem xét lại một quyết định. Current behavior
vẫn thuộc spec/domain/API/schema owner; ADR không phải nguồn quy tắc thứ hai.

## Khi nào ghi

Ghi quyết định được chấp nhận có ảnh hưởng lâu dài tới kiến trúc, nghiệp vụ, compatibility hoặc
workflow mà lý do khó suy từ code/diff. Không ghi sửa bug thông thường, đổi copy, kết quả test,
tiến độ task hoặc mỗi lần commit. Không dựng lại quyết định quá khứ khi thiếu nguồn xác nhận.

Một quyết định một file `NNNN-short-title.md`, thường 20–50 dòng, đủ các mục:

```text
Title:
Status: Proposed | Accepted | Superseded
Date:
Context: vấn đề và ràng buộc
Decision: lựa chọn và phạm vi
Alternatives: lựa chọn đáng cân nhắc và lý do không chọn
Consequences: lợi ích, chi phí, điều kiện xem xét lại
Current owners: liên kết spec/skill/contract có hiệu lực
```

`Proposed` không cho phép implementation ngoài task đã duyệt. `Accepted` ghi quyết định đã chọn
trong phạm vi được ủy quyền, không tự tuyên bố user phê duyệt điều chưa được hỏi. Khi thay quyết định,
thêm ADR mới và đánh dấu bản cũ `Superseded` kèm link; giữ lại bối cảnh/lý do cũ.

## Records

| ADR | Status | Phạm vi |
|---|---|---|
| [0001 — Nạp ngữ cảnh theo owner](0001-context-routing.md) | Accepted | Harness và tài liệu |
