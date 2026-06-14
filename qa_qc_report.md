# QA/QC Report: Order Creation & Voucher Exchange Flow

Sau khi review toàn bộ luồng tạo order (`api/orders/route.ts`, `api/staff/orders/route.ts`) và đổi voucher (`api/profile/vouchers/exchange/route.ts`), cùng với logic core trong `lib/orders.ts` và `lib/vouchers.ts`, tôi đã phát hiện ra **2 Critical Bugs (Lỗi ngầm cực kỳ nghiêm trọng)** và một số **Edge Cases**.

Dưới đây là chi tiết các vấn đề:

## 1. 🔴 CRITICAL BUG: Lỗ hổng Double-Spend Voucher (Race Condition)

**Mô tả:** 
Khách hàng có thể sử dụng **cùng 1 voucher cho nhiều đơn hàng** bằng cách gửi nhiều request tạo order cùng lúc (concurrent requests).

**Nguyên nhân:**
Trong `app/api/orders/route.ts` và `app/api/staff/orders/route.ts`, hàm `assertVoucherUsable(voucher, ...)` (dùng để check xem voucher có `ACTIVE` hay không) được gọi **BÊN NGOÀI** `prisma.$transaction()`.
Sau đó, bên trong transaction, code chỉ đơn giản là update mù:
```typescript
await tx.voucher.update({
  where: { id: dv.id },
  data: { status: "RESERVED" }, // Không hề check lại status hiện tại!
});
```
Nếu 2 request đến cùng lúc, cả 2 đều thấy status là `ACTIVE` ở phase 1, sau đó cả 2 đều lọt vào transaction và cùng update status thành `RESERVED`, voucher sẽ bị apply 2 lần cho 2 order khác nhau.

**Cách fix:**
Cần check điều kiện ngay trong lúc update bên trong transaction. Ví dụ thay vì dùng `tx.voucher.update`, hãy dùng `tx.voucher.updateMany`:
```typescript
const updated = await tx.voucher.updateMany({
  where: { id: dv.id, status: "ACTIVE" },
  data: { status: "RESERVED" }
});
if (updated.count === 0) throw new Error("Voucher đã được sử dụng!");
```

---

## 2. 🔴 CRITICAL BUG: Vượt Limit Khi Mua Voucher (Race Condition)

**Mô tả:**
Giới hạn số lượng package (`pkg.quantity`) và số lượng tối đa mỗi user (`max_per_user`) có thể bị bypass hoàn toàn nếu khách hàng spam request đổi điểm.

**Nguyên nhân:**
Trong `api/profile/vouchers/exchange/route.ts`, đoạn check limit sử dụng `prisma.voucher.count()` và được thực hiện **BÊN NGOÀI** transaction.
```typescript
const issuedCount = await prisma.voucher.count({ where: { package_id: pkg.id } });
if (issuedCount >= pkg.quantity) { ... }
```
Tương tự như bug 1, nếu user gửi 10 request cùng lúc, cả 10 request đều thấy `issuedCount < pkg.quantity` và lọt vào transaction, kết quả là user mua được 10 vouchers dù `max_per_user` chỉ là 1.

**Cách fix:**
Đưa logic query `count` vào bên trong `prisma.$transaction()`. Tối ưu nhất là dùng transaction level Serializable, hoặc thêm trường `issued_count` vào `voucher_packages` và dùng `update({ data: { issued_count: { increment: 1 } } })` với điều kiện `issued_count < quantity`.

---

## 3. 🟡 EDGE CASE / LOGIC FLAW: Mất Voucher Addon Nếu Truyền Lên Option Không Có Trong Đơn

**Mô tả:**
Nếu một hacker/client gửi lên một ADDON voucher hợp lệ, nhưng **cố tình** không bỏ addon đó vào trong danh sách mua của món nước.

**Hậu quả:**
Trong `lib/orders.ts`, logic không tìm thấy addon khớp nên `addon_discount_vnd = 0`. Khách hàng vẫn phải trả nguyên giá cho món nước. TUY NHIÊN, api route vẫn sẽ lưu voucher đó vào DB và đổi status thành `RESERVED`. 
=> Kết quả: Khách hàng không được giảm giá nhưng lại bị mất voucher. Tuy đây không phải lỗi gây thiệt hại cho hệ thống, nhưng về logic thì không chặt chẽ.

**Cách fix:**
Tại `api/orders/route.ts`, trước khi thêm `av` vào map, hãy đảm bảo rằng `av.addon_option_id` thực sự tồn tại trong `item.addon_option_ids` mà client gửi lên.

---

## 4. 🟢 UX LIMITATION: Giới Hạn Áp Dụng Addon Voucher

**Mô tả:**
Giả sử khách mua 1 ly size L, gọi **2 phần trân châu**. Khách có **2 voucher trân châu**. Tuy nhiên, code hiện tại sẽ báo lỗi `VALIDATION_ERROR`: *"Cannot apply multiple vouchers for the same addon on a single item"*.
Khách sẽ chỉ được dùng 1 voucher cho 1 phần trân châu trên món đó, phần trân châu thứ 2 phải trả tiền.

Đây không phải bug (vì được rào rõ trong code `route.ts`), nhưng bạn cần confirm xem business requirement có muốn cho phép dùng 2 voucher cho 2 phần addon giống nhau trên cùng 1 ly hay không.

---

## Tổng Kết

Flow order và tính giá hiện tại được viết khá chuẩn và chặt chẽ về mặt số liệu (tính giá lại từ server, block được các voucher áp dụng sai mục đích). Tuy nhiên, kiến trúc chia làm 2 phase (READ ở ngoài và WRITE ở trong transaction) để né lỗi timeout của `pgBouncer` đã vô tình sinh ra **Race Condition** rất nặng cho toàn bộ hệ thống Voucher.

Bạn xem qua report này. Nếu bạn muốn, tôi có thể tiến hành viết **Implementation Plan** để fix triệt để các lỗi Race Condition này.
