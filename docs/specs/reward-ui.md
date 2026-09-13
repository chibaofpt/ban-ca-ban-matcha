# Reward UI

> **Authority:** hành vi UI cho quà chào mừng của customer và workspace campaign của Admin.
> **Read when:** sửa signup reward, hộp matcha, điểm tiếp tục reward, hoặc màn quản trị reward.
> **Update when:** trigger, state quan sát được, motion, accessibility hoặc admin workflow thay đổi.
> **Does not own:** rule phát/chọn thưởng, HTTP payload, database fields hoặc voucher lifecycle chung.

Nghiệp vụ canonical nằm ở
[voucher-flow lifecycle](../../.agents/skills/voucher-flow/references/lifecycle.md#welcome-reward-and-gacha),
HTTP contract ở [API](../../API.md#customer-welcome-reward), và persistence ở
[SCHEMA](../../SCHEMA.md#welcome_reward_settings). Spec này chỉ sở hữu cách các state đó được trình
bày và điều phối trong UI.

## Customer experience

### Entry, defer và resume

- Sau đăng ký, `POINTS` hoặc `FIXED_VOUCHER` đã hoàn tất đóng auth flow, hiện toast tương ứng và
  tiếp tục intent/return target. `GACHA PENDING` chuyển ngay nội dung của auth dialog sang trải
  nghiệm chọn hộp trong cùng overlay `critical`.
- Đóng hoặc chọn **Để sau** không mở reward và không làm mất entitlement; auth flow vẫn hoàn tất.
  Profile và wallet hiện CTA khi GET trả `GACHA PENDING`, cho phép mở lại cùng trải nghiệm.
- Từ profile, **Xem voucher** đóng reward overlay rồi mở wallet. Trong wallet, reward là nested
  overlay `critical`; hoàn tất bằng voucher trả user về tab voucher của surface bên dưới.
- Nếu GET lỗi, giải thích reward vẫn có thể mở lại, có **Thử lại** và **Tiếp tục**. Nếu không có
  gacha pending, hiện xác nhận phần thưởng đã được ghi nhận và cho tiếp tục.
- Nếu GET ban đầu hoặc refetch trả `GACHA COMPLETED` có outcome trước khi instance hiện tại chọn hộp,
  hiện ngay outcome server trả, focus **Tiếp tục**, và hiện **Xem voucher** khi surface cung cấp action;
  không tự chọn hộp hay phát lại chuỗi reveal.
- Reward dialog giới hạn theo `dvh`, giữ shell `overflow-hidden`, và đặt grid, status, actions trong
  vùng cuộn dọc `min-h-0`, touch-pan/overscroll-contained để 12 hộp cùng các nút vẫn tới được trên
  viewport thấp. Layout dialog đăng nhập/đăng ký thông thường không đổi.

### Grid và staged reveal

- Render 3 hộp mỗi hàng cho mọi số lượng từ 3 đến 12. Grid dùng sáu track, mỗi hộp chiếm hai;
  hàng cuối một hộp nằm giữa, hai hộp cân quanh tâm. Thứ tự theo `sort_order`.
- Khi chọn, khóa toàn bộ hộp và gửi đúng một mutation với `request_id` ổn định cho các lần retry.
  Trong 180 ms, các hộp khác fade/thu nhẹ, hộp chọn giữ opacity và phóng nhẹ; delay theo vị trí
  tối đa 100 ms. Sau 280 ms, hộp chọn chuyển vào giữa bằng shared layout, kích thước 160 px trên
  mobile và 192 px từ `sm`, với viền primary nhẹ và glow 32 px.
- Khi selection làm grid biến mất và center stage bắt đầu, chuyển focus có chủ đích từ button đã
  unmount sang live status. Sau 280 ms và khi server đã trả outcome, ảnh đóng/ảnh mở cross-fade
  200 ms. Khi ảnh mở xuất hiện, vài puff khói matcha dùng màu semantic primary phát ra từ mouth
  anchor, mờ và tan trong tối đa 500 ms, không bắt pointer. Sau 220 ms, card kết quả xuất hiện từ tọa độ
  `mouth_anchor_x`/`mouth_anchor_y`, fade + scale `0.82 → 1` và đi từ `y=-45%` tới `y=-115%` trong
  280 ms. Voucher dùng shared `VoucherCard`; fallback hiện card **5 🐟**.
- Không suy phần thưởng từ box hoặc animation. Chỉ render outcome server trả; box đã chọn quyết định
  asset và mouth anchor của reveal.

### Reduced motion, focus và lỗi

- Khi user yêu cầu reduced motion, bỏ shared-layout/scale travel, dùng fade 150 ms; khói không travel
  hay scale và chỉ fade tối đa 150 ms. Các chặng
  chọn, center, open và result vẫn tuần tự với delay 150 ms để trạng thái không đổi đột ngột.
- Mỗi hộp là button có accessible name và focus ring. Khi selected control rời grid, focus chuyển
  ngay tới vùng tiến độ `role=status`, `aria-live=polite`; lỗi mutation là `role=alert`. Khi result
  xuất hiện, focus chuyển tới **Tiếp tục**. Overlay giữ trap/restore focus, Escape, backdrop và
  scroll lock theo UI system.
- `REWARD_PAUSED` giải thích campaign tạm dừng và reward vẫn được giữ. Lỗi tạm thời hoặc kết nối cho
  phép retry với cùng request ID. Trong trạng thái lỗi vẫn cho **Để sau**; không đóng overlay hoặc
  tuyên bố thành công trước khi server trả outcome.

## Admin experience

- Trang **Quà chào mừng** tải song song settings, campaign summaries và voucher packages. Loading có
  trạng thái bận; lỗi đọc có thông báo và một action retry toàn bộ nguồn.
- Settings trình bày ba mode bằng radio cards. `POINTS` không có reference; `FIXED_VOUCHER` chỉ cho
  chọn package active; `GACHA` chỉ cho chọn campaign `ACTIVE`. Nút lưu chỉ bật khi cấu hình hợp lệ,
  đã thay đổi và không có mutation đang chạy.
- Admin tạo campaign thành `DRAFT`, chọn campaign từ danh sách, và xem `status`, số box, số lượt mở,
  tổng phân bổ/còn lại. Editor chia ba tab **Chung / Pool / Hộp**. Chỉ `DRAFT` cho đổi tên, pool và
  box; state khác là read-only cho các phần đó.
- Pool editor dùng field chính xác `voucher_package_id`, `quantity`, `unlock_after_draws`, không cho
  package trùng; hiện tổng, số đã phát/còn lại và trọng số live. Cảnh báo ngay mốc không thể đạt và
  server vẫn là validator cuối.
- Box editor giới hạn 3–12 để sẵn sàng kích hoạt và tối đa 12 khi thêm. Create cần tên cùng hai ảnh;
  edit cần ít nhất một thay đổi. Preview cả ảnh đóng/mở và đánh dấu trực tiếp mouth anchor chuẩn hóa
  0..1. Xóa và kết thúc campaign dùng `ConfirmModal`.
- **Kích hoạt/Tiếp tục** chỉ bật khi pool không rỗng, các mốc mở có thể đạt và có 3–12 box;
  **Tạm dừng** giữ entitlement chờ; **Kết thúc** có xác nhận phá hủy vì không thể mở lại. Server
  kiểm tra thêm availability của mọi package theo rule trong voucher-flow.
- Mọi mutation gửi revision hiện tại. Khi nhận `409 CONFLICT`, refetch bản mới nhất, báo dữ liệu đã
  đổi ở nơi khác và yêu cầu Admin kiểm tra/nhập lại; không tự merge input cũ. Các lỗi khác hiện qua
  feedback tạm thời, còn validation field cục bộ nằm cạnh control liên quan.

## Acceptance

- Với 3–12 box, hàng cuối luôn cân giữa và keyboard có thể chọn mọi box.
- Outcome chỉ xuất hiện sau center/open sequence và tại mouth anchor đã cấu hình; reduced motion vẫn
  giữ đúng thứ tự state với fade ngắn. Outcome đã completed bên ngoài hiện ngay cùng action tiếp tục,
  không replay hộp; smoke xuất hiện tại ảnh mở và reduced-motion chỉ fade.
- Trên viewport thấp, grid 12 hộp cuộn dọc tới status và mọi action trong cả reward overlay độc lập
  lẫn reward phase của auth dialog.
- Defer rồi mở lại từ profile hoặc wallet tiếp tục entitlement pending; pause/unavailable không làm
  UI xóa reward.
- Admin không thể chỉnh cấu hình campaign ngoài `DRAFT`, không thể kích hoạt khi chưa ready, và stale
  revision luôn tải lại snapshot mới trước khi user thử lại.
