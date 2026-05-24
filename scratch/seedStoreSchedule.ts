/**
 * Seed script: Insert default store schedule (7 rows, 1 slot each, 06:00–22:00).
 * Run: npx ts-node --project tsconfig.json scratch/seedStoreSchedule.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding store_schedule...");

  await prisma.storeSchedule.deleteMany();

  const rows = Array.from({ length: 7 }, (_, i) => ({
    day_of_week: i,
    slot: 1,
    open_time: "06:00",
    close_time: "22:00",
  }));

  await prisma.storeSchedule.createMany({ data: rows });

  console.log(`✅ Inserted ${rows.length} default schedule rows (all days, 06:00–22:00, slot 1).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
