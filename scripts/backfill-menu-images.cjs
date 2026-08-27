let prisma;
let storage;
let runMenuImageBackfill;

async function loadModules() {
  ({ prisma } = await import("../lib/prisma.ts"));
  storage = await import("../lib/storage.ts");
  ({ runMenuImageBackfill } = await import("../lib/menuImageBackfill.ts"));
}

function referencesFromRows(source, category, rows) {
  return rows
    .filter((row) => typeof row.image_url === "string" && row.image_url.length > 0)
    .map((row) => ({
      source,
      id: row.id,
      name: row.name,
      category: typeof category === "function" ? category(row) : category,
      imageUrl: row.image_url,
    }));
}

async function listReferences() {
  const [menuItems, powders, milkTypes, addonGroups] = await Promise.all([
    prisma.menuItem.findMany({
      where: { image_url: { not: null } },
      select: { id: true, name: true, category: true, image_url: true },
    }),
    prisma.matchaPowder.findMany({
      where: { image_url: { not: null } },
      select: { id: true, name: true, image_url: true },
    }),
    prisma.milkType.findMany({
      where: { image_url: { not: null } },
      select: { id: true, name: true, image_url: true },
    }),
    prisma.addonGroup.findMany({
      where: { image_url: { not: null } },
      select: { id: true, name: true, image_url: true },
    }),
  ]);

  const menuCategories = new Set(["latte", "fusion", "extras"]);
  const menuReferences = referencesFromRows("menuItem", (row) => {
    if (!menuCategories.has(row.category)) throw new Error(`INVALID_MENU_CATEGORY:${row.category}`);
    return row.category;
  }, menuItems);
  return [
    ...menuReferences,
    ...referencesFromRows("matchaPowder", "powders", powders),
    ...referencesFromRows("milkType", "milk-types", milkTypes),
    ...referencesFromRows("addonGroup", "addons", addonGroups),
  ];
}

async function updateReference(reference, oldUrl, newUrl) {
  const args = {
    where: { id: reference.id, image_url: oldUrl },
    data: { image_url: newUrl },
  };
  let result;
  switch (reference.source) {
    case "menuItem":
      result = await prisma.menuItem.updateMany(args);
      break;
    case "matchaPowder":
      result = await prisma.matchaPowder.updateMany(args);
      break;
    case "milkType":
      result = await prisma.milkType.updateMany(args);
      break;
    case "addonGroup":
      result = await prisma.addonGroup.updateMany(args);
      break;
    default:
      throw new Error(`UNKNOWN_REFERENCE_SOURCE:${reference.source}`);
  }
  return result.count === 1;
}

function dependencies() {
  return {
    listReferences,
    listObjects: storage.listMenuImages,
    downloadImage: storage.downloadMenuImage,
    uploadImage: storage.uploadMenuImage,
    updateReference,
    removeImages: storage.removeMenuImages,
    buildOutputPath: (reference) => storage.buildMenuImagePath({
      category: reference.category,
      productName: reference.name,
      requestedName: reference.name,
      contentType: storage.MENU_IMAGE_OUTPUT_CONTENT_TYPE,
    }),
  };
}

async function main() {
  await loadModules();
  const args = process.argv.slice(2);
  const unknownArgs = args.filter((arg) => arg !== "--apply");
  if (unknownArgs.length > 0) throw new Error(`UNKNOWN_ARGUMENT:${unknownArgs.join(",")}`);

  const result = await runMenuImageBackfill({
    apply: args.includes("--apply"),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    dependencies: dependencies(),
  });
  console.log(JSON.stringify(result, null, 2));
  if (result.failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
