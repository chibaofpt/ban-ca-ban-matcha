-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER');

-- AddColumn
ALTER TABLE "orders" ADD COLUMN "payment_method" "PaymentMethod";

-- Backfill the historical behavior before enforcing the invariant.
UPDATE "orders"
SET "payment_method" = CASE
  WHEN "order_type" = 'COUNTER' THEN 'CASH'::"PaymentMethod"
  ELSE 'BANK_TRANSFER'::"PaymentMethod"
END;

-- Preserve backward compatibility for older staff clients that omit the field.
ALTER TABLE "orders"
  ALTER COLUMN "payment_method" SET DEFAULT 'CASH',
  ALTER COLUMN "payment_method" SET NOT NULL;
