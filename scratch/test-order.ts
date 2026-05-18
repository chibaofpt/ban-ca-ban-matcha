import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Pure pricing resolution inside the script
function resolveGram(
  size: string,
  customPowderGrams: any,
  powderSizeConfigs: any[],
  defaultSizeConfigs: any[]
): number {
  if (customPowderGrams?.[size] !== undefined && customPowderGrams[size] !== null) {
    return customPowderGrams[size] as number;
  }
  const powderConfig = powderSizeConfigs.find((c) => c.size === size);
  if (powderConfig !== undefined) {
    return Number(powderConfig.grams);
  }
  const defaultConfig = defaultSizeConfigs.find((c) => c.size === size);
  return Number(defaultConfig?.powder_gram ?? 0);
}

async function run() {
  console.log("=== STEP 1: Querying Database for Menu Item & Pricing Config ===");
  const menuItem = await prisma.menuItem.findFirst({
    where: { is_available: true },
    include: { sizes: true, fusionAllowedPowders: true },
  });

  if (!menuItem) {
    console.error("No available menu items found in DB!");
    return;
  }

  const validSizeRow = menuItem.sizes.find((s) => s.base_price_vnd !== null);
  if (!validSizeRow) {
    console.error("No valid size row found for menu item:", menuItem.name);
    return;
  }

  const size = validSizeRow.size;
  const base_price_vnd = Number(validSizeRow.base_price_vnd);

  console.log(`Using Menu Item: "${menuItem.name}" (${menuItem.id}), Category: ${menuItem.category}`);
  console.log(`Using Size: ${size}, Base Price: ${base_price_vnd} VND`);

  let powder_id: string = "";
  if (menuItem.category === "latte") {
    if (!menuItem.matcha_powder_id) {
      console.error("Latte menu item has no matcha_powder_id!");
      return;
    }
    powder_id = menuItem.matcha_powder_id;
  } else {
    powder_id = menuItem.default_powder_id || "";
    const allowed = menuItem.fusionAllowedPowders || [];
    if (!powder_id && allowed.length > 0) {
      powder_id = allowed[0].powder_id;
    }
  }

  console.log(`Resolved Powder ID: ${powder_id}`);

  // Preload pricing parameters directly from DB
  const [defaultSizeConfigs, allPowderConfigs, matchPowder, allMilkTypes] = await Promise.all([
    prisma.defaultSizeConfig.findMany(),
    prisma.powderSizeConfig.findMany({ where: { powder_id } }),
    prisma.matchaPowder.findUnique({ where: { id: powder_id } }),
    prisma.milkType.findMany({ where: { is_active: true } }),
  ]);

  if (!matchPowder) {
    console.error("Matcha powder not found in DB!");
    return;
  }

  const powder_price_per_gram = matchPowder.price_per_gram;
  const powderSizeConfigs = allPowderConfigs.map((c) => ({
    size: c.size,
    grams: Number(c.grams),
  }));
  const defaultConfigs = defaultSizeConfigs.map((c) => ({
    size: c.size,
    milk_ml: c.milk_ml,
    powder_gram: Number(c.powder_gram),
  }));

  const gram = resolveGram(size, menuItem.custom_powder_grams, powderSizeConfigs, defaultConfigs);

  let serverPrice = 0;
  if (menuItem.category === "latte") {
    const defaultMilk = allMilkTypes.find((m) => m.is_default);
    const milk_price_per_ml = defaultMilk?.price_per_ml ?? 40;
    const milk_ml = defaultConfigs.find((c) => c.size === size)?.milk_ml ?? 0;

    const rawCost = base_price_vnd + gram * powder_price_per_gram + milk_ml * milk_price_per_ml;
    serverPrice = Math.ceil(rawCost / 1000) * 1000;
  } else {
    const rawCost = base_price_vnd + gram * powder_price_per_gram;
    serverPrice = Math.ceil(rawCost / 1000) * 1000;
  }

  console.log(`Calculated server price for item: ${serverPrice} VND`);

  console.log("\n=== STEP 2: Logging in as Staff ===");
  const loginRes = await fetch("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      phone_number: "0949129938",
      password: "15062023",
    }),
  });

  const loginData = await loginRes.json() as any;
  if (!loginRes.ok) {
    console.error("Login failed!", loginData);
    return;
  }

  console.log("Logged in successfully. User Info:", loginData.data);

  const setCookies = loginRes.headers.getSetCookie();
  console.log("Session cookies obtained:", setCookies);

  const cookieHeader = setCookies.map((c) => c.split(";")[0]).join("; ");

  console.log("\n=== STEP 3: Creating Counter Order ===");
  const orderPayload = {
    phone_number: "0900000000",
    customer_name: "Khách Dùng Thử",
    items: [
      {
        menu_item_id: menuItem.id,
        quantity: 1,
        size,
        sweetness: "QUARTER",
        ice_option: "NORMAL",
        coldwhisk: false,
        addon_option_ids: [],
        client_price_vnd: serverPrice,
        selected_powder_id: menuItem.category === "fusion" ? powder_id : undefined,
      },
    ],
  };

  console.log("Payload:", JSON.stringify(orderPayload, null, 2));

  const orderRes = await fetch("http://localhost:3000/api/staff/orders", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieHeader,
    },
    body: JSON.stringify(orderPayload),
  });

  const orderResultData = await orderRes.json() as any;
  if (!orderRes.ok) {
    console.error("Order creation failed!", orderResultData);
    return;
  }

  console.log("\n=== SUCCESS! Counter Order Created ===");
  console.log(JSON.stringify(orderResultData.data, null, 2));
}

run().catch(console.error).finally(() => prisma.$disconnect());
