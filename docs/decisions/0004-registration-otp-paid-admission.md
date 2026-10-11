# Registration OTP và admission cho dịch vụ trả phí

Status: Superseded in part by [0007](0007-google-account-access.md): public phone registration is retired;
paid admission and provider uncertainty remain for transitional phone-ghost proof.
Date: 2026-10-04

## Context

Người dùng đã thử nhận mã qua ABENLA trên trang admin `/test-sms` và chọn dùng tích hợp
đó cho đăng ký mới. Mỗi lượt gửi tốn khoảng 350 VND; 100.000 VND cho 100 khách là ước tính,
không phải trần ngân sách ngày hoặc tháng. Luồng cần tránh phát sinh gửi trùng khi retry,
đồng thời giữ khả năng đăng ký khi Turnstile gặp sự cố dịch vụ.

## Decision

Dùng adapter ABENLA hiện có cho OTP đăng ký; giữ custom phone/password auth và phiên cookie.
Đặt admission trả phí trong Redis trước khi gọi provider, độc lập với limiter auth tổng quát.
Giữ reservation sau kết quả gửi không xác định và không tự retry provider. Turnstile chỉ
cho phép fallback khi backend xác định sự cố dịch vụ; token sai không cấp quyền gửi.
Allowed hostnames do cấu hình widget Cloudflare quản lý; ứng dụng không yêu cầu allowlist env
riêng và vẫn xác minh token/action qua Siteverify. Công cụ thử `/test-sms` được gỡ sau khi tích hợp
đăng ký, giữ adapter ABENLA và test tự động cho các luồng còn được hỗ trợ.
Công tắc toàn hệ thống thuộc quản lý khách hàng. OTP thành công tự xác thực khách; khi
tắt, đăng ký tạo khách chưa xác thực. Consumption của proof thuộc transaction tạo tài khoản.

## Alternatives

- Dùng OTP cho cả đăng nhập/quên mật khẩu: nằm ngoài phạm vi user đã duyệt.
- Luôn chặn khi Turnstile lỗi dịch vụ: không đáp ứng lựa chọn duy trì đăng ký của user.
- Hoàn reservation hoặc retry khi provider timeout: có thể chi thêm tiền khi lượt đầu đã gửi.
- Biến 100.000 VND thành trần ngày/tháng: không đúng ý nghĩa ngân sách user xác nhận.

## Consequences

Hạn mức gửi bảo vệ chi phí cả khi CAPTCHA tạm unavailable; Redis/settings unavailable chặn
gửi trả phí. Admin có thể quan sát số reservation, chi phí ước tính và số dư provider.
Mã và thông tin tài khoản chỉ được tiêu thụ khi transaction đăng ký commit. Xem xét lại
chính sách khi có số liệu đăng ký thực tế hoặc thay đổi giá/cơ chế xác nhận delivery.

## Current owners

- [API registration OTP và admin controls](../../API.md#registration-otp--public-onboarding)
- [Schema OTP và settings](../../SCHEMA.md#otp_attempts--registration-otp)
- [Server cache boundary](../../SPECIFICATION.md#server-cache-boundary)
