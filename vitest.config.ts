import path from "node:path";
import { defineConfig } from "vitest/config";

const staticContractTests = [
  "lib/__tests__/addon-max-select-migration.test.ts",
  "lib/__tests__/addon-opt-in-migration.test.ts",
  "lib/__tests__/admin-menu-delete-surface.test.ts",
  "lib/__tests__/bundle-promotion-migration.test.ts",
  "lib/__tests__/extras-migration-contract.test.ts",
  "lib/__tests__/product-discount-scope-migration.test.ts",
  "lib/__tests__/security-logging.test.ts",
  "lib/__tests__/supabase-data-plane-migration.test.ts",
  "lib/__tests__/voucher-architecture-migration.test.ts",
];

export default defineConfig({
  test: {
    globals: true,
    isolate: true,
    pool: "forks",
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: [
            "lib/__tests__/**/*.{test,spec}.ts",
            "src/__tests__/**/*.{test,spec}.ts",
          ],
          exclude: staticContractTests,
          sequence: { groupOrder: 0 },
        },
      },
      {
        extends: true,
        test: {
          name: "static-contract",
          environment: "node",
          include: staticContractTests,
          sequence: { groupOrder: 1 },
        },
      },
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
