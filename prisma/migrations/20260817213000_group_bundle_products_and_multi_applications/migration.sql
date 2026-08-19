-- Group BUNDLE product scopes by menu item, derive prices at checkout, and allow
-- multiple explicitly allocated BUNDLE vouchers on one order.

DO $$
DECLARE
  conflicting_packages TEXT;
BEGIN
  WITH normalized AS (
    SELECT
      scope.package_id,
      scope.role,
      scope.menu_item_id,
      CASE
        WHEN menu.category = 'extras' THEN NULL
        WHEN menu.category = 'latte' THEN COALESCE(scope.matcha_powder_id, menu.matcha_powder_id)
        ELSE COALESCE(scope.matcha_powder_id, menu.default_powder_id)
      END AS default_powder_id,
      CASE
        WHEN menu.category = 'extras' THEN NULL
        WHEN menu.category = 'latte' THEN COALESCE(
          scope.milk_type_id,
          (SELECT milk.id FROM public."milk_type" milk WHERE milk.is_default LIMIT 1)
        )
        ELSE COALESCE(scope.milk_type_id, menu.default_base_liquid_id)
      END AS default_base_liquid_id,
      menu.category
    FROM public."voucher_bundle_product_scopes" scope
    JOIN public."menu_items" menu ON menu.id = scope.menu_item_id
  ), invalid AS (
    SELECT package_id
    FROM normalized
    GROUP BY package_id, role, menu_item_id, category
    HAVING COUNT(DISTINCT COALESCE(default_powder_id::text, '<NULL>') || ':' ||
                          COALESCE(default_base_liquid_id::text, '<NULL>')) > 1
       OR (category <> 'extras' AND
           (COUNT(default_powder_id) <> COUNT(*) OR COUNT(default_base_liquid_id) <> COUNT(*)))
    UNION
    SELECT rule.package_id
    FROM public."voucher_bundle_rules" rule
    LEFT JOIN public."voucher_bundle_product_scopes" scope
      ON scope.package_id = rule.package_id AND scope.role = 'REWARD'
    GROUP BY rule.package_id, rule.reward_kind, rule.reward_mode
    HAVING (rule.reward_kind = 'PRODUCT' AND rule.reward_mode = 'FIXED_CONFIG' AND
            COUNT(DISTINCT scope.menu_item_id) <> 1)
       OR (rule.reward_kind = 'PRODUCT' AND rule.reward_mode = 'ALLOWED_SCOPE' AND
            COUNT(DISTINCT scope.menu_item_id) < 1)
       OR (rule.reward_kind = 'PRODUCT' AND rule.reward_mode = 'SAME_CONFIG' AND COUNT(scope.id) > 0)
       OR (rule.reward_kind = 'ADDON' AND COUNT(scope.id) > 0)
    UNION
    SELECT DISTINCT scope.package_id
    FROM public."voucher_bundle_product_scopes" scope
    JOIN public."menu_items" menu ON menu.id = scope.menu_item_id
    WHERE menu.category <> 'extras'
      AND NOT EXISTS (
        SELECT 1 FROM public."menu_item_sizes" sold
        WHERE sold.menu_item_id = scope.menu_item_id
          AND sold.base_price_vnd IS NOT NULL
          AND (scope.size IS NULL OR sold.size = scope.size)
      )
  )
  SELECT string_agg(DISTINCT package_id::text, ', ' ORDER BY package_id::text)
  INTO conflicting_packages
  FROM invalid;

  IF conflicting_packages IS NOT NULL THEN
    RAISE EXCEPTION 'BUNDLE migration requires admin review for package IDs: %', conflicting_packages;
  END IF;
END $$;

CREATE TABLE public."voucher_bundle_product_scopes_v2" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "package_id" UUID NOT NULL,
  "role" "BundleScopeRole" NOT NULL,
  "menu_item_id" UUID NOT NULL,
  "default_powder_id" UUID,
  "default_base_liquid_id" UUID,
  CONSTRAINT "voucher_bundle_product_scopes_v2_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "voucher_bundle_product_scopes_v2_product_key"
    UNIQUE ("package_id", "role", "menu_item_id")
);

CREATE TABLE public."voucher_bundle_product_scope_sizes_v2" (
  "scope_id" UUID NOT NULL,
  "size" "Size" NOT NULL,
  CONSTRAINT "voucher_bundle_product_scope_sizes_v2_pkey" PRIMARY KEY ("scope_id", "size"),
  CONSTRAINT "voucher_bundle_product_scope_sizes_v2_scope_id_fkey"
    FOREIGN KEY ("scope_id") REFERENCES public."voucher_bundle_product_scopes_v2"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION
);

WITH normalized AS (
  SELECT
    scope.package_id,
    scope.role,
    scope.menu_item_id,
    CASE
      WHEN menu.category = 'extras' THEN NULL
      WHEN menu.category = 'latte' THEN COALESCE(scope.matcha_powder_id, menu.matcha_powder_id)
      ELSE COALESCE(scope.matcha_powder_id, menu.default_powder_id)
    END AS default_powder_id,
    CASE
      WHEN menu.category = 'extras' THEN NULL
      WHEN menu.category = 'latte' THEN COALESCE(
        scope.milk_type_id,
        (SELECT milk.id FROM public."milk_type" milk WHERE milk.is_default LIMIT 1)
      )
      ELSE COALESCE(scope.milk_type_id, menu.default_base_liquid_id)
    END AS default_base_liquid_id
  FROM public."voucher_bundle_product_scopes" scope
  JOIN public."menu_items" menu ON menu.id = scope.menu_item_id
)
INSERT INTO public."voucher_bundle_product_scopes_v2" (
  "package_id", "role", "menu_item_id", "default_powder_id", "default_base_liquid_id"
)
SELECT package_id, role, menu_item_id, default_powder_id, default_base_liquid_id
FROM normalized
GROUP BY package_id, role, menu_item_id, default_powder_id, default_base_liquid_id;

INSERT INTO public."voucher_bundle_product_scope_sizes_v2" ("scope_id", "size")
SELECT DISTINCT grouped.id, sold.size
FROM public."voucher_bundle_product_scopes" legacy
JOIN public."menu_items" menu ON menu.id = legacy.menu_item_id AND menu.category <> 'extras'
JOIN public."voucher_bundle_product_scopes_v2" grouped
  ON grouped.package_id = legacy.package_id
 AND grouped.role = legacy.role
 AND grouped.menu_item_id = legacy.menu_item_id
JOIN public."menu_item_sizes" sold
  ON sold.menu_item_id = legacy.menu_item_id
 AND sold.base_price_vnd IS NOT NULL
 AND (legacy.size IS NULL OR sold.size = legacy.size);

DROP TABLE public."voucher_bundle_product_scopes";
ALTER TABLE public."voucher_bundle_product_scopes_v2" RENAME TO "voucher_bundle_product_scopes";
ALTER TABLE public."voucher_bundle_product_scope_sizes_v2" RENAME TO "voucher_bundle_product_scope_sizes";

ALTER TABLE public."voucher_bundle_product_scopes"
  RENAME CONSTRAINT "voucher_bundle_product_scopes_v2_pkey" TO "voucher_bundle_product_scopes_pkey";
ALTER TABLE public."voucher_bundle_product_scopes"
  RENAME CONSTRAINT "voucher_bundle_product_scopes_v2_product_key" TO "voucher_bundle_product_scopes_package_id_role_menu_item_id_key";
ALTER TABLE public."voucher_bundle_product_scope_sizes"
  RENAME CONSTRAINT "voucher_bundle_product_scope_sizes_v2_pkey" TO "voucher_bundle_product_scope_sizes_pkey";
ALTER TABLE public."voucher_bundle_product_scope_sizes"
  RENAME CONSTRAINT "voucher_bundle_product_scope_sizes_v2_scope_id_fkey" TO "voucher_bundle_product_scope_sizes_scope_id_fkey";

ALTER TABLE public."voucher_bundle_product_scopes" ADD CONSTRAINT "voucher_bundle_product_scopes_package_id_fkey"
  FOREIGN KEY ("package_id") REFERENCES public."voucher_bundle_rules"("package_id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE public."voucher_bundle_product_scopes" ADD CONSTRAINT "voucher_bundle_product_scopes_menu_item_id_fkey"
  FOREIGN KEY ("menu_item_id") REFERENCES public."menu_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE public."voucher_bundle_product_scopes" ADD CONSTRAINT "voucher_bundle_product_scopes_default_powder_id_fkey"
  FOREIGN KEY ("default_powder_id") REFERENCES public."matcha_powder"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE public."voucher_bundle_product_scopes" ADD CONSTRAINT "voucher_bundle_product_scopes_default_base_liquid_id_fkey"
  FOREIGN KEY ("default_base_liquid_id") REFERENCES public."milk_type"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE INDEX "voucher_bundle_product_scopes_package_id_role_idx"
  ON public."voucher_bundle_product_scopes"("package_id", "role");
CREATE INDEX "voucher_bundle_product_scopes_menu_item_id_idx"
  ON public."voucher_bundle_product_scopes"("menu_item_id");
CREATE INDEX "voucher_bundle_product_scopes_default_powder_id_idx"
  ON public."voucher_bundle_product_scopes"("default_powder_id");
CREATE INDEX "voucher_bundle_product_scopes_default_base_liquid_id_idx"
  ON public."voucher_bundle_product_scopes"("default_base_liquid_id");

DROP INDEX public."order_bundle_applications_order_id_key";
CREATE INDEX "order_bundle_applications_order_id_idx"
  ON public."order_bundle_applications"("order_id");

CREATE TABLE public."order_bundle_qualifier_allocations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "application_id" UUID NOT NULL,
  "order_item_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL,
  CONSTRAINT "order_bundle_qualifier_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "order_bundle_qualifier_allocations_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "order_bundle_qualifier_allocations_application_id_order_item_id_key"
    UNIQUE ("application_id", "order_item_id"),
  CONSTRAINT "order_bundle_qualifier_allocations_application_id_fkey"
    FOREIGN KEY ("application_id") REFERENCES public."order_bundle_applications"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "order_bundle_qualifier_allocations_order_item_id_fkey"
    FOREIGN KEY ("order_item_id") REFERENCES public."order_items"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION
);
CREATE INDEX "order_bundle_qualifier_allocations_order_item_id_idx"
  ON public."order_bundle_qualifier_allocations"("order_item_id");

CREATE UNIQUE INDEX "order_bundle_rewards_application_id_order_item_id_key"
  ON public."order_bundle_rewards"("application_id", "order_item_id");
CREATE UNIQUE INDEX "order_bundle_rewards_application_id_order_item_addon_id_key"
  ON public."order_bundle_rewards"("application_id", "order_item_addon_id");

-- Align two pre-existing order-item indexes with the current Prisma schema.
DROP INDEX IF EXISTS public."idx_order_items_item_voucher_id";
CREATE INDEX IF NOT EXISTS "idx_order_items_selected_milk_type_id"
  ON public."order_items"("selected_milk_type_id");

ALTER TABLE public."voucher_bundle_product_scopes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."voucher_bundle_product_scope_sizes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."order_bundle_qualifier_allocations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."voucher_bundle_product_scopes"
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public."voucher_bundle_product_scope_sizes"
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL PRIVILEGES ON TABLE public."order_bundle_qualifier_allocations"
  FROM PUBLIC, anon, authenticated, service_role;
