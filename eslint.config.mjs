import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated third-party runtime assets are verified during sync, not linted.
    "public/vendor/maplibre/**",
    // Local scratch/repair scripts are excluded from TypeScript and application builds.
    "scratch/**",
    "backup_vouchers.js",
    "fix.js",
    "patch-tests.js",
    "patch-tests-2.js",
    "scratch_patch_kb.js",
    "scratch_update_kb.js",
    "scratch_update_kb2.js",
    "update_staff_orders.js",
  ]),
]);

export default eslintConfig;
