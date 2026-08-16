-- Add optional public Storage URLs for addon-group and powder catalogue images.
ALTER TABLE "addon_groups" ADD COLUMN "image_url" TEXT;
ALTER TABLE "matcha_powder" ADD COLUMN "image_url" TEXT;
