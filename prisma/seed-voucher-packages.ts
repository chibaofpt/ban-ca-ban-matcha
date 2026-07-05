import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Starting seed-voucher-packages...");

  // 1. Find Latte menu items
  const latteItem = await prisma.menuItem.findFirst({
    where: { category: "latte", is_available: true },
  });

  if (!latteItem) {
    console.error("No latte menu item found! Please make sure you have created some latte menu items first.");
    process.exit(1);
  }
  console.log("Found Latte Item:", latteItem.name, latteItem.id);

  // 2. Find Fusion menu items
  const fusionItem = await prisma.menuItem.findFirst({
    where: { category: "fusion", is_available: true },
  });

  if (!fusionItem) {
    console.error("No fusion menu item found! Please make sure you have created some fusion menu items first.");
    process.exit(1);
  }
  console.log("Found Fusion Item:", fusionItem.name, fusionItem.id);

  // 3. Find 2 non-Extra-Matcha addon options (gram_value should be null or 0)
  const addons = await prisma.addonOption.findMany({
    where: {
      group: {
        is_active: true,
      },
      OR: [
        { gram_value: null },
        { gram_value: { equals: 0 } }
      ]
    },
    take: 2,
  });

  if (addons.length < 2) {
    console.error(`Not enough active non-matcha addon options (found ${addons.length}, need 2). Please create them first.`);
    process.exit(1);
  }
  console.log("Found Addon Options:", addons.map(a => `${a.label} (${a.id})`));

  // 4. Create the 6 voucher packages
  const packagesData = [
    // 2 Product Vouchers
    {
      name: `Free 1 ly ${latteItem.name} (Size M)`,
      description: "Thưởng thức món Latte bánh cá trứ danh hoàn toàn miễn phí.",
      voucher_type: "PRODUCT" as const,
      points_cost: 30,
      menu_item_id: latteItem.id,
      size: "SMALL" as const,
      covered_price_vnd: 45000,
      expires_after_days: 30,
      is_active: true,
    },
    {
      name: `Free 1 ly ${fusionItem.name} (Size L)`,
      description: "Thưởng thức món Fusion tươi mát sảng khoái hoàn toàn miễn phí.",
      voucher_type: "PRODUCT" as const,
      points_cost: 35,
      menu_item_id: fusionItem.id,
      size: "MEDIUM" as const,
      covered_price_vnd: 55000,
      expires_after_days: 30,
      is_active: true,
    },
    // 2 Addon Vouchers
    {
      name: `Free Addon: ${addons[0].label}`,
      description: `Miễn phí topping ${addons[0].label} cho món nước bất kỳ trong đơn hàng.`,
      voucher_type: "ADDON" as const,
      points_cost: 8,
      addon_option_id: addons[0].id,
      covered_price_vnd: 15000,
      expires_after_days: 15,
      is_active: true,
    },
    {
      name: `Free Addon: ${addons[1].label}`,
      description: `Miễn phí topping ${addons[1].label} cho món nước bất kỳ trong đơn hàng.`,
      voucher_type: "ADDON" as const,
      points_cost: 10,
      addon_option_id: addons[1].id,
      covered_price_vnd: 15000,
      expires_after_days: 15,
      is_active: true,
    },
    // 2 Discount Vouchers
    {
      name: "Giảm 15% tổng hóa đơn",
      description: "Áp dụng giảm trực tiếp 15% tổng trị giá đơn hàng.",
      voucher_type: "DISCOUNT" as const,
      points_cost: 25,
      discount_type: "PERCENT" as const,
      discount_value: 15,
      expires_after_days: 45,
      is_active: true,
    },
    {
      name: "Giảm 20.000đ tổng đơn",
      description: "Giảm trực tiếp 20.000đ cho đơn hàng thanh toán bất kỳ.",
      voucher_type: "DISCOUNT" as const,
      points_cost: 15,
      discount_type: "FIXED" as const,
      discount_value: 20000,
      expires_after_days: 45,
      is_active: true,
    },
  ];

  console.log("Inserting voucher packages into database...");
  for (const pkg of packagesData) {
    const created = await prisma.voucherPackage.create({
      data: pkg,
    });
    console.log(`Created package: ${created.name} (${created.id})`);
  }

  console.log("Seeding voucher packages completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
