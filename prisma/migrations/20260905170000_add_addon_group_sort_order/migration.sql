ALTER TABLE "addon_groups"
ADD COLUMN "sort_order" INTEGER NOT NULL DEFAULT 0;

WITH ranked_groups AS (
  SELECT
    "id",
    (ROW_NUMBER() OVER (ORDER BY "created_at" DESC, "id" ASC) - 1)::INTEGER AS "sort_order"
  FROM "addon_groups"
)
UPDATE "addon_groups" AS target
SET "sort_order" = ranked_groups."sort_order"
FROM ranked_groups
WHERE target."id" = ranked_groups."id";

WITH ranked_options AS (
  SELECT
    "id",
    (ROW_NUMBER() OVER (
      PARTITION BY "addon_group_id" ORDER BY "sort_order" ASC, "id" ASC
    ) - 1)::INTEGER AS "normalized_order"
  FROM "addon_options"
)
UPDATE "addon_options" AS target
SET "sort_order" = ranked_options."normalized_order"
FROM ranked_options
WHERE target."id" = ranked_options."id";

ALTER TABLE "addon_groups"
ADD CONSTRAINT "addon_groups_sort_order_nonnegative"
CHECK ("sort_order" >= 0);

ALTER TABLE "addon_options"
ADD CONSTRAINT "addon_options_sort_order_nonnegative"
CHECK ("sort_order" >= 0);

CREATE INDEX "idx_addon_groups_sort_order_id"
ON "addon_groups"("sort_order", "id");

CREATE INDEX "idx_addon_options_group_sort_order_id"
ON "addon_options"("addon_group_id", "sort_order", "id");
