BEGIN;

ALTER TYPE public."VoucherType" ADD VALUE IF NOT EXISTS 'ITEM';

ALTER TABLE public."menu_items"
  ADD COLUMN "unit_price_vnd" INTEGER;

ALTER TABLE public."menu_items"
  ADD CONSTRAINT "menu_items_unit_price_vnd_positive"
  CHECK ("unit_price_vnd" IS NULL OR ("unit_price_vnd" >= 1000 AND MOD("unit_price_vnd", 1000) = 0));

ALTER TABLE public."menu_items"
  ADD CONSTRAINT "menu_items_extras_requires_unit_price"
  CHECK ("category" <> 'extras' OR "unit_price_vnd" IS NOT NULL);

ALTER TABLE public."menu_items"
  ADD CONSTRAINT "menu_items_category_allowed"
  CHECK ("category" IN ('latte', 'fusion', 'extras'));

ALTER TABLE public."menu_items"
  ADD CONSTRAINT "menu_items_drinks_have_no_unit_price"
  CHECK ("category" = 'extras' OR "unit_price_vnd" IS NULL);

ALTER TABLE public."order_items"
  ALTER COLUMN "size" DROP NOT NULL,
  ADD COLUMN "item_voucher_id" UUID;

ALTER TABLE public."order_items"
  ADD CONSTRAINT "order_items_item_voucher_id_fkey"
  FOREIGN KEY ("item_voucher_id") REFERENCES public."vouchers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE INDEX "idx_order_items_item_voucher_id"
  ON public."order_items"("item_voucher_id");

CREATE UNIQUE INDEX "order_items_item_voucher_id_key"
  ON public."order_items"("item_voucher_id");

COMMIT;
