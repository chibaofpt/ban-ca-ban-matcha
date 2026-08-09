import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const maplibreRoot = dirname(
  fileURLToPath(import.meta.resolve("maplibre-gl/package.json")),
);
const sourceDirectory = resolve(maplibreRoot, "dist");
const targetDirectory = resolve(projectRoot, "public", "vendor", "maplibre");
const assetNames = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

await mkdir(targetDirectory, { recursive: true });
await Promise.all(
  assetNames.map((assetName) =>
    copyFile(
      resolve(sourceDirectory, assetName),
      resolve(targetDirectory, assetName),
    ),
  ),
);

console.log("Synced MapLibre worker assets.");
