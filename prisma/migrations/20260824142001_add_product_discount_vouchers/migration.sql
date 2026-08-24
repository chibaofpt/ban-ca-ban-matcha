ALTER TABLE "voucher_packages"
  ADD COLUMN "product_discount_mode" "ProductDiscountMode",
  ADD COLUMN "eligible_sizes" "Size"[] NOT NULL DEFAULT ARRAY[]::"Size"[],
  ADD COLUMN "reference_size" "Size";

ALTER TABLE "vouchers"
  ADD COLUMN "product_discount_mode" "ProductDiscountMode",
  ADD COLUMN "eligible_sizes" "Size"[] NOT NULL DEFAULT ARRAY[]::"Size"[],
  ADD COLUMN "reference_size" "Size";

ALTER TABLE "voucher_packages" ADD CONSTRAINT "voucher_packages_product_discount_shape_check" CHECK (
  (voucher_type <> 'PRODUCT_DISCOUNT' AND product_discount_mode IS NULL AND cardinality(eligible_sizes) = 0 AND reference_size IS NULL) OR
  (
    menu_item_id IS NOT NULL AND cardinality(eligible_sizes) > 0 AND
    cardinality(eligible_sizes) =
      ((eligible_sizes @> ARRAY['SMALL']::"Size"[])::int + (eligible_sizes @> ARRAY['MEDIUM']::"Size"[])::int + (eligible_sizes @> ARRAY['LARGE']::"Size"[])::int) AND
    covered_price_vnd IS NULL AND
    (
      (product_discount_mode = 'FIXED_AMOUNT' AND discount_type = 'FIXED' AND discount_value > 0 AND discount_value % 1000 = 0 AND reference_size IS NULL) OR
      (product_discount_mode = 'PAY_AS_SIZE' AND discount_type IS NULL AND discount_value IS NULL AND
        ((reference_size = 'SMALL' AND NOT (eligible_sizes @> ARRAY['SMALL']::"Size"[])) OR
         (reference_size = 'MEDIUM' AND eligible_sizes <@ ARRAY['LARGE']::"Size"[])))
    )
  )
);

ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_product_discount_shape_check" CHECK (
  (voucher_type <> 'PRODUCT_DISCOUNT' AND product_discount_mode IS NULL AND cardinality(eligible_sizes) = 0 AND reference_size IS NULL) OR
  (
    menu_item_id IS NOT NULL AND cardinality(eligible_sizes) > 0 AND
    cardinality(eligible_sizes) =
      ((eligible_sizes @> ARRAY['SMALL']::"Size"[])::int + (eligible_sizes @> ARRAY['MEDIUM']::"Size"[])::int + (eligible_sizes @> ARRAY['LARGE']::"Size"[])::int) AND
    covered_price_vnd IS NULL AND
    (
      (product_discount_mode = 'FIXED_AMOUNT' AND discount_type = 'FIXED' AND discount_value > 0 AND discount_value % 1000 = 0 AND reference_size IS NULL) OR
      (product_discount_mode = 'PAY_AS_SIZE' AND discount_type IS NULL AND discount_value IS NULL AND
        ((reference_size = 'SMALL' AND NOT (eligible_sizes @> ARRAY['SMALL']::"Size"[])) OR
         (reference_size = 'MEDIUM' AND eligible_sizes <@ ARRAY['LARGE']::"Size"[])))
    )
  )
);
