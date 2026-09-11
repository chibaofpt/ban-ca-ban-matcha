# Spec registry và quy tắc ngữ cảnh

Đọc khi thiết kế hoặc duy trì harness/spec. Task feature đi thẳng tới owner trong
[AGENTS.md](../../AGENTS.md); không nạp registry và mọi spec vào mỗi phiên.

## Mỗi loại thông tin có một owner

| Câu hỏi | Nguồn chuẩn |
|---|---|
| Agent nạp gì, giữ scope và verify thế nào? | [AGENTS.md](../../AGENTS.md) |
| Thực hiện một loại công việc bằng cách nào? | `.agents/skills/<name>/SKILL.md` |
| Layer, integration và shared primitives là gì? | [SPECIFICATION.md](../../SPECIFICATION.md) |
| Feature UI phải tương tác thế nào? | Các spec bên dưới |
| Quy tắc giá/order/voucher là gì? | Domain skill và reference được skill định tuyến |
| HTTP input/output và compatibility là gì? | [API.md](../../API.md) |
| Dữ liệu lưu có ý nghĩa gì? | [SCHEMA.md](../../SCHEMA.md); physical truth ở Prisma/migrations |
| File đặt ở đâu, import theo hướng nào? | [STRUCTURE.md](../../STRUCTURE.md) |
| Vì sao chọn thiết kế này? | [Decision log](../decisions/README.md) |
| Chưa quyết định/chưa triển khai/đang có ngoại lệ gì? | [NOTES.md](../../NOTES.md) |

Domain skills hiện đồng thời giữ business specification. Giữ owner đó; không tạo thêm bản sao
`orders.md`, `pricing.md` hoặc `vouchers.md` chỉ để đổi hình thức. Reference dưới skill vẫn thuộc
cùng owner. Khi một loại thông tin đổi, sửa owner và liên kết từ nơi sử dụng.

## Feature specs hiện có

| Feature | Nội dung cần nạp |
|---|---|
| [Catalog UI](catalog-ui.md) | Menu/editor, ảnh, ProductModal, admin add-ons |
| [Voucher UI](voucher-ui.md) | Wallet/detail/target, nhận/đổi, auth intent, admin wizard |
| [Cart và POS](cart.md) | Source state/persistence, BUNDLE setup, nhóm giỏ, khôi phục chuyển khoản |

Đây là yêu cầu đang được tài liệu dự án mô tả, không phải bằng chứng implementation hoặc UI đã
nghiệm thu. Phần API/schema/nghiệp vụ liên kết owner, không suy lại từ UI.

## Thêm hoặc sửa spec

- Task nhỏ: cập nhật mục đang sở hữu behavior. Chỉ thêm file khi có feature/nhóm quyết định độc lập
  mà việc tách giúp tránh đọc phần không liên quan; không tạo một spec cho mỗi task.
- Mở đầu bằng `Authority`, `Read when`, `Update when`. Ghi actor, trigger, kết quả quan sát được,
  invariant, nhánh lỗi/biên và liên kết contract cần thiết; dùng ví dụ khi giúp phân biệt rule.
- Tách current behavior khỏi proposal. Proposal chưa duyệt thuộc NOTES hoặc ADR `Proposed`, không
  đặt như quy tắc đang có hiệu lực. Triển khai xong thì cập nhật owner và bỏ deferred đã hoàn tất.
- Acceptance criteria có thể viết ngắn theo `Khi … thì …`; automated/manual evidence theo AGENTS →
  TDD. Không copy test checklist vào mọi spec.
- File dài cần heading/mục lục để chọn đoạn. Skill description chỉ mô tả capability và trigger;
  SKILL.md giữ core workflow, reference giữ nhánh chi tiết có điều kiện. Liên kết kèm lý do đọc.
- Tài liệu nhà cung cấp là reference tư vấn; không tự thay custom auth, migration, state hoặc release
  policy. Không copy tutorial/code mẫu có thể bị hiểu nhầm thành implementation chuẩn.

## Kiểm tra harness

Kiểm frontmatter skill, đường dẫn/anchor, owner bị lặp và invariant bị mất. Thử chọn context cho
task service, overlay, voucher, push staging và chỉnh tài liệu: phải tìm đủ rule mà không kéo cả
thư viện vào ngữ cảnh. File được tách cần đối chiếu nội dung trước/sau.

Đo kích thước entrypoint và đường đọc theo task; tổng số file hoặc dung lượng repo không phải token
thực tế. `resources:check` kiểm artifact, không thay semantic review hoặc chứng minh runtime.
Git giữ diff; không sinh task log, changelog hay plan archive cho bước này.
