-- Store an optional public Storage URL for each addon option image.
ALTER TABLE "addon_options" ADD COLUMN "image_url" TEXT;
