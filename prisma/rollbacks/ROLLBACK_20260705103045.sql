-- ============================================================
-- ROLLBACK: rename_size_enum_m_l_xl_to_small_medium_large
-- Reverts migration: 20260705015000_rename_size_enum_m_l_xl_to_small_medium_large
-- Generated: 2026-07-05T10:30:45+07:00
-- ============================================================
--
-- CẢNH BÁO:
-- 1. Chỉ chạy file này nếu production deploy thất bại sau migration.
-- 2. Phải dừng toàn bộ traffic trước khi rollback (tắt Vercel production).
-- 3. Sau khi rollback DB, redeploy commit trước đó lên Vercel.
-- 4. Vercel rollback KHÔNG rollback database — luôn chạy file này trước.
-- ============================================================

BEGIN;

-- Step 1: Reverse JSONB keys trong menu_items (SMALL→M, MEDIUM→L, LARGE→XL)
UPDATE menu_items
SET custom_powder_grams = (
  SELECT jsonb_object_agg(
    CASE key
      WHEN 'SMALL'  THEN 'M'
      WHEN 'MEDIUM' THEN 'L'
      WHEN 'LARGE'  THEN 'XL'
      ELSE key
    END,
    value
  )
  FROM jsonb_each(custom_powder_grams)
)
WHERE custom_powder_grams IS NOT NULL
  AND custom_powder_grams != 'null'::jsonb;

-- Step 2: Đổi lại tên enum values (LARGE→XL, MEDIUM→L, SMALL→M)
-- Thứ tự ngược lại với migration gốc
ALTER TYPE "Size" RENAME VALUE 'LARGE'  TO 'XL';
ALTER TYPE "Size" RENAME VALUE 'MEDIUM' TO 'L';
ALTER TYPE "Size" RENAME VALUE 'SMALL'  TO 'M';

COMMIT;
