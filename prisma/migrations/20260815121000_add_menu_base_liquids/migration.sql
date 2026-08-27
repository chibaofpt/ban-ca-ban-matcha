BEGIN;

ALTER TABLE public."menu_items"
  ADD COLUMN "default_base_liquid_id" UUID;

ALTER TABLE public."menu_item_sizes"
  ADD COLUMN "base_liquid_ml" INTEGER;

ALTER TABLE public."order_items"
  ADD COLUMN "base_liquid_ml" INTEGER;

ALTER TABLE public."menu_item_sizes"
  ADD CONSTRAINT "menu_item_sizes_base_liquid_ml_positive"
  CHECK ("base_liquid_ml" IS NULL OR "base_liquid_ml" > 0);

ALTER TABLE public."order_items"
  ADD CONSTRAINT "order_items_base_liquid_ml_positive"
  CHECK ("base_liquid_ml" IS NULL OR "base_liquid_ml" > 0);

ALTER TABLE public."milk_type"
  ADD CONSTRAINT "milk_type_default_must_be_active"
  CHECK (NOT "is_default" OR "is_active");

CREATE UNIQUE INDEX "uniq_milk_type_single_default"
  ON public."milk_type" ("is_default")
  WHERE "is_default" = true;

CREATE TABLE public."menu_item_allowed_base_liquid" (
  "menu_item_id" UUID NOT NULL,
  "base_liquid_id" UUID NOT NULL,
  CONSTRAINT "menu_item_allowed_base_liquid_pkey" PRIMARY KEY ("menu_item_id", "base_liquid_id"),
  CONSTRAINT "menu_item_allowed_base_liquid_menu_item_id_fkey"
    FOREIGN KEY ("menu_item_id") REFERENCES public."menu_items"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "menu_item_allowed_base_liquid_base_liquid_id_fkey"
    FOREIGN KEY ("base_liquid_id") REFERENCES public."milk_type"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

ALTER TABLE public."menu_items"
  ADD CONSTRAINT "menu_items_default_base_liquid_id_fkey"
  FOREIGN KEY ("default_base_liquid_id") REFERENCES public."milk_type"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE INDEX "idx_menu_items_default_base_liquid_id"
  ON public."menu_items"("default_base_liquid_id");
CREATE INDEX "idx_menu_item_allowed_base_liquid_base_liquid_id"
  ON public."menu_item_allowed_base_liquid"("base_liquid_id");
-- Preserve Latte's current behaviour: every active non-default catalog entry
-- remains selectable for every existing Latte item.
INSERT INTO public."menu_item_allowed_base_liquid" ("menu_item_id", "base_liquid_id")
SELECT mi."id", mt."id"
FROM public."menu_items" mi
CROSS JOIN public."milk_type" mt
WHERE mi."category" = 'latte'
  AND mt."is_active" = true
  AND mt."is_default" = false
ON CONFLICT DO NOTHING;

-- This custom-auth application uses Prisma over a direct database connection.
-- No Data API policy is intentionally created; existing default ACL hardening applies.
ALTER TABLE public."menu_item_allowed_base_liquid" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."menu_item_allowed_base_liquid"
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
