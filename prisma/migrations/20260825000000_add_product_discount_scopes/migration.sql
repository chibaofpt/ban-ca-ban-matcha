CREATE TABLE "voucher_package_menu_item_scopes" (
  "voucher_package_id" UUID NOT NULL,
  "menu_item_id" UUID NOT NULL,
  CONSTRAINT "voucher_package_menu_item_scopes_pkey" PRIMARY KEY ("voucher_package_id", "menu_item_id")
);

CREATE TABLE "voucher_menu_item_scopes" (
  "voucher_id" UUID NOT NULL,
  "menu_item_id" UUID NOT NULL,
  CONSTRAINT "voucher_menu_item_scopes_pkey" PRIMARY KEY ("voucher_id", "menu_item_id")
);

CREATE INDEX "voucher_package_menu_item_scopes_voucher_package_id_idx" ON "voucher_package_menu_item_scopes"("voucher_package_id");
CREATE INDEX "voucher_package_menu_item_scopes_menu_item_id_idx" ON "voucher_package_menu_item_scopes"("menu_item_id");
CREATE INDEX "voucher_menu_item_scopes_voucher_id_idx" ON "voucher_menu_item_scopes"("voucher_id");
CREATE INDEX "voucher_menu_item_scopes_menu_item_id_idx" ON "voucher_menu_item_scopes"("menu_item_id");

ALTER TABLE "voucher_package_menu_item_scopes" ADD CONSTRAINT "voucher_package_menu_item_scopes_voucher_package_id_fkey" FOREIGN KEY ("voucher_package_id") REFERENCES "voucher_packages"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "voucher_package_menu_item_scopes" ADD CONSTRAINT "voucher_package_menu_item_scopes_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "voucher_menu_item_scopes" ADD CONSTRAINT "voucher_menu_item_scopes_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "vouchers"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
ALTER TABLE "voucher_menu_item_scopes" ADD CONSTRAINT "voucher_menu_item_scopes_menu_item_id_fkey" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

INSERT INTO "voucher_package_menu_item_scopes" ("voucher_package_id", "menu_item_id")
SELECT "id", "menu_item_id" FROM "voucher_packages"
WHERE "voucher_type" = 'PRODUCT_DISCOUNT' AND "menu_item_id" IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "voucher_menu_item_scopes" ("voucher_id", "menu_item_id")
SELECT "id", "menu_item_id" FROM "vouchers"
WHERE "voucher_type" = 'PRODUCT_DISCOUNT' AND "menu_item_id" IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE public."voucher_package_menu_item_scopes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."voucher_menu_item_scopes" ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public."voucher_package_menu_item_scopes" FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public."voucher_menu_item_scopes" FROM anon, authenticated;
