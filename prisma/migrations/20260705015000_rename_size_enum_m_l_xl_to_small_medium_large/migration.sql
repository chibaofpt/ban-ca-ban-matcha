-- Migration: rename_size_enum_m_l_xl_to_small_medium_large
-- Renames the Size enum values: M → SMALL, L → MEDIUM, XL → LARGE
-- Strategy: atomic ALTER TYPE RENAME VALUE (PostgreSQL 10+, safe in place)
-- Then update the JSONB custom_powder_grams keys in menu_items table.

-- Step 1: Rename enum values (each statement is atomic)
ALTER TYPE "Size" RENAME VALUE 'M'  TO 'SMALL';
ALTER TYPE "Size" RENAME VALUE 'L'  TO 'MEDIUM';
ALTER TYPE "Size" RENAME VALUE 'XL' TO 'LARGE';

-- Step 2: Migrate custom_powder_grams JSONB keys in menu_items
-- Replace top-level keys M→SMALL, L→MEDIUM, XL→LARGE
UPDATE menu_items
SET custom_powder_grams = (
  SELECT jsonb_object_agg(
    CASE key
      WHEN 'M'  THEN 'SMALL'
      WHEN 'L'  THEN 'MEDIUM'
      WHEN 'XL' THEN 'LARGE'
      ELSE key
    END,
    value
  )
  FROM jsonb_each(custom_powder_grams)
)
WHERE custom_powder_grams IS NOT NULL
  AND custom_powder_grams != 'null'::jsonb;
