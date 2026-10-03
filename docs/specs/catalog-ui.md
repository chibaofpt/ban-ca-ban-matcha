# Catalog UI

> **Authority:** behavior UI/composition của feature; shared primitives thuộc [SPECIFICATION](../../SPECIFICATION.md#ui-system).
> **Read when:** task chạm feature này; chỉ đọc heading liên quan.
> **Update when:** behavior feature được chấp nhận thay đổi. Đây là current spec, không phải chứng nhận code đã được kiểm tra.

Nghiệp vụ thuộc domain skills [order-flow](../../.agents/skills/order-flow/SKILL.md),
[voucher-flow](../../.agents/skills/voucher-flow/SKILL.md), [pricing-logic](../../.agents/skills/pricing-logic/SKILL.md).
API payload thuộc [API.md](../../API.md); không suy quy tắc tính tiền từ bố cục UI.

## Catalog editor

- Upload ảnh catalog dùng chung khung bố cục 1:1 cho ảnh có nền và ảnh trong suốt. Mặc định vừa toàn bộ ảnh; admin kéo, thu/phóng nhỏ hơn khung, chọn Vừa khung/Lấp đầy/Đặt lại. Phần ngoài khung bị cắt, vùng trống trong khung giữ alpha; không kéo giãn vật thể hay tự đổ nền. Xem trước chính Blob WebP trên nền thẻ, có Chỉnh lại và Dùng ảnh này trước khi gắn vào form; kích thước/quality theo preset catalog hiện có. Nền caro chỉ dùng trong editor, không ghi vào file.
- Bốn tab con của Menu admin luôn chia đều một hàng, dùng chiều cao compact 32px và chuyển bằng nhấn; không dùng swipe hoặc thanh cuộn ngang.
- Search top-level của danh sách Sản phẩm, Bột và Base Liquid tạm thời bị ẩn theo quyết định UI; giữ nguyên state và filter wiring để mở lại trong task follow-up. Filter category/trạng thái vẫn hiển thị. Quy tắc này không áp dụng cho search/multi-select bên trong editor Base Liquid.
- Trang Sản phẩm giữ hai chế độ lưới và bảng khi quản lý thông thường. Bấm `Sắp xếp` chuyển nội dung
  sang một cột với ba section cố định Latte, Fusion và Add-on; món chỉ kéo trong section của mình.
  Chế độ sắp xếp có filter `Đang bán`/`Toàn bộ menu`, mặc định `Đang bán`. Khi chỉ hiện món đang bán,
  reorder thay các slot đang nhìn thấy và giữ nguyên slot của món tạm ẩn. Admin kéo nhiều lần rồi dùng
  footer `Hủy`/`Lưu thứ tự`; hủy bản nháp bẩn dùng `ConfirmModal`, lỗi lưu giữ bản nháp để thử lại.
  Kết thúc trả về đúng chế độ lưới/bảng trước đó. Món mới không truyền `sort_order` được thêm vào đầu
  danh mục; chỉnh sửa hoặc đổi trạng thái không làm thay đổi vị trí.
- Editor Base Liquid cho phép tìm kiếm, lọc Latte/Fusion và chọn hàng loạt món, kể cả món tạm ngưng
  bán. Các món dùng liquid đó làm default hiển thị đã chọn nhưng khóa; lưu xong phải invalidate dữ
  liệu Menu để editor món phản ánh cùng allow-list.

## Ảnh hiển thị và pipeline

- Ảnh catalog đi qua Storage adapter: menu/powder chuẩn hóa WebP tối đa 800px quality 75; milk type, addon group và từng addon option tối đa 320px quality 70, cùng cache một năm. Addon option chỉ hiển thị ảnh riêng; khi không có ảnh riêng thì để trống, không fallback ảnh group. Ảnh Supabase hiển thị qua Next/Vercel Image Optimization với `sizes` theo container; thumbnail sữa/add-on/powder dùng quality 60 và ảnh powder lớn chỉ tải khi mở chi tiết. Menu card giữ khung skeleton ổn định và fade ảnh vào sau khi tải xong.

## ProductModal và admin add-ons

`ProductModal` dùng dialog desktop và Vaul full-height trên mobile. Browser Back chỉ đóng overlay trên cùng; CTA luôn ghép action với tổng giá bằng ` - `. Add-on giá cố định dùng lưới 3 cột; add-on theo gram (Extra Matcha) dùng lưới 4 cột. Header Base Liquid hiển thị Coldwhisk dạng switch có semantics và vẫn nêu nền mặc định khi selector bị ẩn.

Admin Add-ons hiển thị toàn bộ group cùng toàn bộ option, không dùng expand/collapse hoặc search.
Toolbar nằm trong document flow và cuộn cùng content, gồm thống kê, refresh, tạo nhóm và filter trạng thái. Group là card bao ngoài với ảnh
48px trên mobile/64px trên desktop; option là hàng một cột có ảnh riêng 40px và không fallback ảnh
group trong admin. Header group dùng nền primary/chữ primary-foreground để tách khỏi option rows.
Badge kiểu giá và giới hạn chọn nằm cùng title, dùng bo góc nhỏ. Toàn bộ action edit, Ẩn/Hiện và
Lên/Xuống của group nằm cùng một hàng; option đặt toàn bộ action cùng hàng title/giá với khoảng cách
gọn và không hiển thị hint thứ tự dưới heading. Không hiển thị action delete. Ẩn cần `ConfirmModal`,
hiện lại không cần xác nhận và feedback dùng Sonner; option active cuối của group đang hoạt động bị
chặn trước khi mở confirm. Tạo group
và tạo option tiếp tục dùng responsive bottom sheet/dialog. Chỉnh sửa group/option đã tồn tại cũng
dùng `ResponsiveOverlay`: bottom sheet trên mobile và centered dialog trên desktop; tại một thời điểm
chỉ có một editor. Khi đóng editor có dữ liệu bẩn phải xác
nhận bỏ thay đổi bằng `ConfirmModal`; create sheet cũng phải xác nhận trước khi đóng nếu form hoặc
ảnh đã thay đổi. Tạo thành công cuộn tới entity mới và highlight ngắn. Group editor cho sửa ảnh,
SEO filename, title, description và
`max_select`; kiểu giá hiển thị bằng segmented buttons nhưng bị khóa sau khi tạo. Group theo gram
luôn giữ `max_select = 1`.

Group và option có nút Lên/Xuống. Trong filter trạng thái, thao
tác group đổi chỗ với peer đang nhìn thấy nhưng gửi toàn bộ snapshot active + inactive. Reorder cập
nhật optimistic, khóa control liên quan trong lúc lưu và rollback kèm toast khi lỗi. Option luôn
reorder trong toàn bộ group. Thứ tự group duy nhất này được `ProductModal` giữ nguyên; từng group vẫn
chọn layout 3 cột cho giá cố định hoặc 4 cột cho gram.
