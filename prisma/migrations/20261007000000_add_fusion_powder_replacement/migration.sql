-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "replacement_powder_id" UUID;

-- CreateIndex
CREATE INDEX "idx_menu_items_default_powder_id" ON "menu_items"("default_powder_id");

-- CreateIndex
CREATE INDEX "idx_menu_items_replacement_powder_id" ON "menu_items"("replacement_powder_id");

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_replacement_powder_id_fkey" FOREIGN KEY ("replacement_powder_id") REFERENCES "matcha_powder"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
