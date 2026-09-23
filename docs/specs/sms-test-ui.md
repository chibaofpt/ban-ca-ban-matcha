# Staging SMS test UI

Authority: tương tác của trang quản trị `/test-sms`; HTTP contract ở [API.md](../../API.md#staging-sms-test--admin-only), ranh giới môi trường và Redis ở [SPECIFICATION.md](../../SPECIFICATION.md).

Read when: sửa trang test SMS, trạng thái gửi/xác minh OTP, hoặc cách hiển thị kết nối và số dư.

Update when: thay đổi tương tác, điều kiện hiển thị hay phản hồi lỗi của trang này.

## Phạm vi và truy cập

Trang chỉ xuất hiện trên staging preview khi cờ test được bật, và chỉ ADMIN đã đăng nhập truy cập được. Trang độc lập với đăng nhập khách, đơn hàng và OTP khách hàng; không đưa nút điều hướng vào luồng khách. Khi điều kiện môi trường không đúng, cả trang và API tương ứng phải đóng.

## Tương tác

- ADMIN chủ động bấm **Kiểm tra kết nối** và **Cập nhật số dư**. Không gọi hai endpoint này tự động khi mở trang. Hiển thị thời điểm kiểm tra; nếu lần làm mới số dư lỗi, giữ số dư cuối cùng và đánh dấu chưa cập nhật được.
- ADMIN nhập một số di động Việt Nam và bấm **Gửi OTP**. Nêu rõ hành động này có thể trừ số dư ABENLA. Không tự gửi, tự thử lại hoặc gửi cho số khác. Sau phản hồi, hiển thị số đã che, trạng thái gửi (`accepted`, `pending`, `unknown`) và thời gian mã còn hiệu lực; số dư được làm mới một lần.
- ADMIN đọc SMS trên điện thoại rồi nhập tay 6 chữ số để **Xác minh**. Trang chỉ báo kết quả đối chiếu của challenge test, không tạo session đăng nhập hay thay đổi người dùng/đơn hàng.
- Cho phép gửi lại sau thời gian chờ do API trả về, đổi số hoặc thử lại sau khi xác minh. Đổi số xoá challenge và OTP hiện trên UI. Không tự động gửi lại sau timeout/lỗi mạng; `request_id` ổn định cho cùng một lần bấm gửi để backend khử trùng lặp.
- Lỗi validation, giới hạn tần suất, provider và OTP phải hiển thị bên cạnh thao tác tương ứng. OTP không xuất hiện trong response, URL, log hay analytics.

## Kiểm chứng

Hợp đồng API, quyền truy cập và workflow được kiểm bằng test backend-first theo project TDD. Vì workflow agent không chạy browser/DOM runner hoặc gọi provider thật, UI và việc SMS đến máy cần ADMIN xác nhận thủ công trên staging sau khi whitelist IP và cấu hình env.
