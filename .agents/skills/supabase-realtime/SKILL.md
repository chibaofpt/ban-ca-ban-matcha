---
name: supabase-realtime
description: Hướng dẫn tiêu chuẩn (Standard Operating Procedure) cho Agent khi làm việc với Supabase Realtime trong project Bạn Cá Bán Matcha. Triggers: supabase realtime, websocket, live order, order notification, chuông báo đơn, realtime channel.
---

# Supabase Realtime — Standard Operating Procedure

> Tài liệu này định nghĩa cách tiếp cận duy nhất và chuẩn xác nhất để tích hợp Supabase Realtime cho tính năng "Chuông báo đơn hàng" (hoặc các tính năng realtime khác) trong project Bạn Cá Bán Matcha.
> **AGENT BẮT BUỘC ĐỌC KỸ TRƯỚC KHI CODE.**

---

## 1. Nguyên lý cốt lõi (Core Architecture)

### 1.1. Pattern: "Realtime làm chuông báo, API làm người lấy dữ liệu"
*   **Vấn đề:** Realtime của Supabase chỉ lắng nghe thay đổi trên **một bảng duy nhất** (VD: `orders`) và chỉ trả về row bị thay đổi. Nó **KHÔNG** trả về dữ liệu JOIN (như `order_items`, `users`).
*   **Giải pháp (BẮT BUỘC):** Tuyệt đối không dùng trực tiếp payload của Realtime để render UI hoặc cập nhật state chứa dữ liệu phức tạp.
*   **Quy trình chuẩn:** 
    1. Nhận event Realtime (INSERT/UPDATE).
    2. Phát âm thanh "Ting ting" / Hiển thị Toast UI.
    3. Trình duyệt tự động gọi API (VD: `GET /api/admin/orders`) để fetch lại danh sách dữ liệu có đầy đủ JOIN relations.

### 1.2. Môi trường hoạt động (Websocket vs Serverless)
*   **Vercel / Next.js API Routes:** Là môi trường Serverless (sống ngắn hạn). **KHÔNG ĐƯỢC** khởi tạo connection Realtime ở phía Server/Backend.
*   **Frontend Client:** Realtime subscription bắt buộc phải được viết ở **Client Component** (có `"use client"`), tốt nhất là nằm trong một React Hook (VD: `useOrderRealtime`).

---

## 2. Các yêu cầu bắt buộc khi Implement (Implementation Rules)

### 2.1. Cấu hình Database (Database Setup)
Trước khi code Frontend, bắt buộc phải đảm bảo bảng cần lắng nghe đã được thêm vào `supabase_realtime` publication. Nếu không, Frontend sẽ không bao giờ nhận được event.
```sql
-- Dùng Supabase SQL Editor hoặc Migration file:
ALTER PUBLICATION supabase_realtime ADD TABLE orders;
```

### 2.2. Viết Hook Frontend (React/Next.js)
Khi viết hook lắng nghe, Agent phải tuân thủ 3 yếu tố:
1.  **Dọn dẹp (Cleanup):** Tránh lỗi *Ghost Connections* (Giới hạn 200 CCs của gói Free).
2.  **Catch-up (Bắt kịp khi rớt mạng):** Xử lý khi mạng chập chờn bằng cách fetch lại data khi reconnect.
3.  **RLS Filter:** Chỉ lắng nghe những event cần thiết.

**Mẫu Code Chuẩn (Boilerplate):**

```typescript
"use client";

import { useEffect } from 'react';
import { createClient } from '@/lib/supabase/client'; // Hoặc đường dẫn chuẩn của project
import { useQueryClient } from '@tanstack/react-query'; // Hoặc SWR, Zustand refetch action

export function useOrderRealtime() {
  const supabase = createClient();
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('admin-orders-channel')
      .on(
        'postgres_changes',
        {
          event: '*', // Hoặc 'INSERT', 'UPDATE'
          schema: 'public',
          table: 'orders',
          // Optional: filter: 'status=eq.pending' -> Khuyên dùng để giảm tải
        },
        (payload) => {
          console.log('Realtime Event received:', payload);
          // 1. CHUÔNG BÁO: Hiển thị toast, phát âm thanh
          // toast.info("Có đơn hàng mới!");

          // 2. FETCH LẠI DATA (KHÔNG dùng payload.new trực tiếp)
          queryClient.invalidateQueries({ queryKey: ['admin_orders'] });
        }
      )
      .subscribe((status) => {
        // 3. XỬ LÝ RỚT MẠNG (Catch-up)
        if (status === 'SUBSCRIBED') {
          console.log('Realtime Connected / Reconnected');
          // Khi vừa có mạng lại, fetch ngay để không lỡ đơn trong lúc rớt mạng
          queryClient.invalidateQueries({ queryKey: ['admin_orders'] });
        }
        if (status === 'TIMED_OUT' || status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.warn('Realtime Disconnected:', status);
        }
      });

    // 4. CLEANUP (Chống rác kết nối / Ghost connection)
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, queryClient]);
}
```

---

## 3. Các Lỗi Thường Gặp & Cách Khắc Phục (Troubleshooting)

| Triệu chứng | Nguyên nhân | Cách khắc phục |
| :--- | :--- | :--- |
| Code đúng nhưng không nhận được Event | Quên bật Replication ở Database | Chạy SQL: `ALTER PUBLICATION supabase_realtime ADD TABLE tên_bảng;` |
| Bị Supabase block vì quá 200 connections | Quên cleanup trong `useEffect` khi unmount component / chuyển trang | Thêm `supabase.removeChannel(channel)` vào return của `useEffect` |
| UI Admin hiển thị thiếu món ăn / thiếu user | Lấy trực tiếp `payload.new` từ Realtime để render | Đổi sang pattern: Gắn invalidation/refetch API ngay khi nhận payload |
| Lỗi Memory Leak / Vercel Timeout | Khởi tạo Realtime ở Server Component hoặc API Route | Chuyển toàn bộ logic Realtime sang `use client` Component |
| Mất đơn hàng lúc wifi quán chập chờn | Chỉ dựa vào Realtime 100% | Bắt status `SUBSCRIBED` để gọi hàm refetch (Catch-up mechanism) |

---
> **Lưu ý cuối cho Agent:** Nếu tác vụ yêu cầu viết tính năng "Realtime", hãy đọc lại mục 1.1. Không được tự ý thay đổi pattern này vì nó ảnh hưởng trực tiếp đến tính toàn vẹn dữ liệu (JOINs) của ứng dụng.
