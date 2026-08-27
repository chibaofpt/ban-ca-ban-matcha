import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const errors = [];
const warnings = [];
const methodOrder = ["GET", "POST", "PUT", "PATCH", "DELETE"];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function walk(relativeDir, predicate) {
  const absoluteDir = path.join(root, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];
  return fs.readdirSync(absoluteDir, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(relativeDir, entry.name);
    return entry.isDirectory() ? walk(relative, predicate) : predicate(relative) ? [relative] : [];
  });
}

function normalizeMethods(methods) {
  return [...new Set(methods)].sort((a, b) => methodOrder.indexOf(a) - methodOrder.indexOf(b));
}

function checkApiInventory() {
  const api = read("API.md");
  const section = api.match(/## Route inventory\s+([\s\S]*?)(?=\n## )/)?.[1] ?? "";
  const documented = new Map();
  for (const match of section.matchAll(/\| `([^`]+)` \| ([A-Z, ]+) \|/g)) {
    documented.set(match[1], normalizeMethods(match[2].split(/,\s*/)));
  }

  const actual = new Map();
  for (const relative of walk(path.join("app", "api"), (file) => file.endsWith(`${path.sep}route.ts`))) {
    const source = read(relative);
    const route = `/${relative.replaceAll("\\", "/").replace(/^app\//, "").replace(/\/route\.ts$/, "")}`;
    const methods = methodOrder.filter((method) => {
      const declaration = new RegExp(`export\\s+(?:async\\s+function|const)\\s+${method}\\b`);
      const reExport = new RegExp(`export\\s*\\{[^}]*\\b${method}\\b[^}]*\\}`);
      return declaration.test(source) || reExport.test(source);
    });
    actual.set(route, methods);
  }

  for (const [route, methods] of actual) {
    if (!documented.has(route)) errors.push(`API.md thiếu route ${route}`);
    else if (documented.get(route).join(",") !== methods.join(",")) {
      errors.push(`API.md sai method ${route}: docs=${documented.get(route).join(",")} code=${methods.join(",")}`);
    }
  }
  for (const route of documented.keys()) {
    if (!actual.has(route)) errors.push(`API.md liệt kê route không tồn tại: ${route}`);
  }
}

function checkEnvironmentInventory() {
  const templateKeys = new Set(
    [...read(".env.local.example").matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]),
  );
  const allow = new Set(["NODE_ENV", "NEXT_RUNTIME", "VERCEL", "VERCEL_ENV", "VERCEL_URL"]);
  const sourceFiles = [
    ...fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isFile() && /\.(?:ts|tsx|js|mjs)$/.test(entry.name))
      .map((entry) => entry.name),
    ...walk("app", (file) => /\.(?:ts|tsx|js|mjs)$/.test(file)),
    ...walk("src", (file) => /\.(?:ts|tsx|js|mjs)$/.test(file) && !file.includes(`${path.sep}__tests__${path.sep}`)),
    ...walk("lib", (file) => /\.(?:ts|tsx|js|mjs)$/.test(file) && !file.includes(`${path.sep}__tests__${path.sep}`)),
    ...walk("scripts", (file) => /\.(?:js|mjs)$/.test(file)),
  ];
  const used = new Set();
  for (const file of sourceFiles) {
    for (const match of read(file).matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) used.add(match[1]);
  }
  for (const key of used) {
    if (!templateKeys.has(key) && !allow.has(key) && !key.startsWith("VERCEL_")) {
      errors.push(`.env.local.example thiếu ${key}`);
    }
  }
}

function checkLinks() {
  const docs = ["AGENTS.md", "README.md", "SPECIFICATION.md", "STRUCTURE.md", "API.md", "SCHEMA.md", "NOTES.md"];
  for (const doc of docs) {
    for (const match of read(doc).matchAll(/\[[^\]]*\]\((?!https?:|#)([^)]+)\)/g)) {
      const target = match[1].split("#")[0];
      if (target && !fs.existsSync(path.resolve(root, path.dirname(doc), target))) {
        errors.push(`${doc} có link hỏng: ${match[1]}`);
      }
    }
  }
}

function checkWorkflowsAndSkills() {
  const retired = path.join(root, ".agents", "workflows", "push-to-production.md");
  if (fs.existsSync(retired)) errors.push("Workflow push-to-production.md cũ vẫn tồn tại");

  for (const file of walk(path.join(".agents", "workflows"), (item) => item.endsWith(".md"))) {
    const source = read(file);
    if (/prisma\s+db\s+push/i.test(source)) errors.push(`${file} chứa prisma db push`);
    if (/git\s+add\s+\./i.test(source)) errors.push(`${file} chứa git add .`);
  }

  for (const file of walk(path.join(".agents", "skills"), (item) => item.endsWith(`${path.sep}SKILL.md`))) {
    const source = read(file);
    if (!/^---\r?\n[\s\S]*?\r?\n---/.test(source)) errors.push(`${file} thiếu YAML frontmatter`);
    if (!/^name:\s*[^\r\n]+/m.test(source)) errors.push(`${file} thiếu name`);
    if (!/^description:\s*(?:>|[^\r\n]+)/m.test(source)) errors.push(`${file} thiếu description`);
  }
}

function reportLegacyUi() {
  const uiFiles = [...walk("app", (file) => file.endsWith(".tsx")), ...walk("src", (file) => file.endsWith(".tsx"))];
  let manualOverlays = 0;
  let directOverlayImports = 0;
  for (const file of uiFiles) {
    const source = read(file);
    const isPrimitive = file.startsWith(path.join("src", "components", "ui") + path.sep);
    if (!isPrimitive && /fixed\s+inset-0/.test(source)) manualOverlays += 1;
    if (!isPrimitive && /@radix-ui\/react-(?:dialog|alert-dialog)|from\s+["']vaul["']/.test(source)) directOverlayImports += 1;
  }
  if (manualOverlays) warnings.push(`${manualOverlays} file còn manual/fullscreen overlay; migrate theo batch, không copy sang code mới`);
  if (directOverlayImports) warnings.push(`${directOverlayImports} file import Radix/Vaul trực tiếp; giữ trong legacy allowlist đến khi migrate`);
}

checkApiInventory();
checkEnvironmentInventory();
checkLinks();
checkWorkflowsAndSkills();
reportLegacyUi();

for (const warning of warnings) console.warn(`WARN: ${warning}`);
if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  console.error(`resources:check FAILED (${errors.length} lỗi)`);
  process.exit(1);
}
console.log("resources:check PASS");
