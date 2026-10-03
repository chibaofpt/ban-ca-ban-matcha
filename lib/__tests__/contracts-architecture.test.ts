import { readdirSync, readFileSync } from "node:fs";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const contractsRoot = join(repositoryRoot, "contracts");
const appRoot = join(repositoryRoot, "app");
const frontendTypeLayerRoot = join(repositoryRoot, "src/lib/types");
const backendSourceRoots = [join(repositoryRoot, "lib"), appRoot];
const typeScriptExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);

function collectTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(path);
    return entry.isFile() && typeScriptExtensions.has(extname(entry.name)) ? [path] : [];
  });
}

function isPlainContractTypeScript(path: string): boolean {
  return extname(path) === ".ts" && !path.endsWith(".d.ts");
}

function isIndexModule(path: string): boolean {
  return /^index(?:\.d)?\.(?:ts|tsx|mts|cts)$/.test(basename(path));
}

function isPathWithin(path: string, root: string): boolean {
  const pathFromRoot = relative(root, path);
  return pathFromRoot === "" || (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot));
}

function hasTopLevelUseClientDirective(path: string, source: string): boolean {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const firstStatement = sourceFile.statements[0];
  return firstStatement !== undefined
    && ts.isExpressionStatement(firstStatement)
    && ts.isStringLiteral(firstStatement.expression)
    && firstStatement.expression.text === "use client";
}

function isAppClientModule(path: string): boolean {
  return isPathWithin(path, appRoot)
    && hasTopLevelUseClientDirective(path, readFileSync(path, "utf8"));
}

function collectBackendSourceFiles(): string[] {
  return backendSourceRoots
    .flatMap((root) => collectTypeScriptFiles(root))
    .filter((path) => !isAppClientModule(path));
}

function moduleSpecifierText(node: ts.Expression | undefined): string | null {
  if (!node) return null;
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : null;
}

function countLines(source: string): number {
  if (source.length === 0) return 0;
  const lineBreaks = source.match(/\r\n|\r|\n/g)?.length ?? 0;
  return lineBreaks + (/(?:\r\n|\r|\n)$/.test(source) ? 0 : 1);
}

function isBackendTestFile(path: string): boolean {
  const normalized = path.replaceAll("\\", "/");
  return normalized.includes("/__tests__/") || /\.(?:test|spec)\.(?:ts|tsx|mts|cts)$/.test(path);
}

function isFrontendTypeLayerImport(specifier: string, importerPath: string): boolean {
  const normalized = specifier.replaceAll("\\", "/");
  if (normalized === "@/src/lib/types" || normalized.startsWith("@/src/lib/types/")) {
    return true;
  }

  if (!(normalized === "."
    || normalized === ".."
    || normalized.startsWith("./")
    || normalized.startsWith("../"))) {
    return false;
  }

  return isPathWithin(resolve(dirname(importerPath), normalized), frontendTypeLayerRoot);
}

function collectFrontendTypeLayerImports(source: string, path: string): string[] {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const imports: string[] = [];

  function inspect(node: ts.Node): void {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = moduleSpecifierText(node.moduleSpecifier);
      if (specifier && isFrontendTypeLayerImport(specifier, path)) imports.push(specifier);
    }

    if (ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)) {
      const specifier = moduleSpecifierText(node.moduleReference.expression);
      if (specifier && isFrontendTypeLayerImport(specifier, path)) imports.push(specifier);
    }

    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const specifier = moduleSpecifierText(node.arguments[0]);
      if (specifier && isFrontendTypeLayerImport(specifier, path)) imports.push(specifier);
    }

    if (ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === "require") {
      const specifier = moduleSpecifierText(node.arguments[0]);
      if (specifier && isFrontendTypeLayerImport(specifier, path)) imports.push(specifier);
    }

    ts.forEachChild(node, inspect);
  }

  inspect(sourceFile);
  return imports;
}

function inspectSource(path: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const violations: string[] = [];

  function inspect(node: ts.Node): void {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const specifier = moduleSpecifierText(node.moduleSpecifier);
      if (specifier && isForbiddenContractImport(specifier)) violations.push(`forbidden import: ${specifier}`);
    }

    if (ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)) {
      const specifier = moduleSpecifierText(node.moduleReference.expression);
      if (specifier && isForbiddenContractImport(specifier)) violations.push(`forbidden import: ${specifier}`);
    }

    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      violations.push("dynamic import");
      const specifier = moduleSpecifierText(node.arguments[0]);
      if (specifier && isForbiddenContractImport(specifier)) violations.push(`forbidden import: ${specifier}`);
    }

    if (ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && node.expression.text === "require") {
      const specifier = moduleSpecifierText(node.arguments[0]);
      if (specifier && isForbiddenContractImport(specifier)) violations.push(`forbidden import: ${specifier}`);
    }

    if (ts.isExportAssignment(node)
      || (ts.canHaveModifiers(node)
        && ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword))
      || (ts.isExportDeclaration(node)
        && node.exportClause
        && ts.isNamedExports(node.exportClause)
        && node.exportClause.elements.some((element) => element.name.text === "default"))) {
      violations.push("default export");
    }

    ts.forEachChild(node, inspect);
  }

  inspect(sourceFile);
  return violations;
}

function isForbiddenContractImport(specifier: string): boolean {
  const normalized = specifier.replaceAll("\\", "/");
  return /^@\/(?:app|lib|src)(?:\/|$)/.test(normalized)
    || /(?:^|\/)(?:app|lib|src)(?:\/|$)/.test(normalized)
    || normalized === "@prisma/client"
    || normalized.startsWith("@prisma/client/")
    || normalized === "react"
    || normalized.startsWith("react/")
    || normalized === "react-dom"
    || normalized.startsWith("react-dom/")
    || normalized === "next"
    || normalized.startsWith("next/")
    || normalized === "axios"
    || normalized.startsWith("axios/");
}

describe("static contract — root contracts boundary", () => {
  it("không phụ thuộc frontend, backend, framework hoặc database runtime", () => {
    const violations = collectTypeScriptFiles(contractsRoot).flatMap((path) => {
      const source = readFileSync(path, "utf8");
      return inspectSource(path, source)
        .filter((violation) => violation.startsWith("forbidden import") || violation === "dynamic import")
        .map((violation) => `${relative(process.cwd(), path)} -> ${violation}`);
    });

    expect(violations).toEqual([]);
  });

  it("chỉ dùng file .ts và không tạo default export hoặc barrel ngầm", () => {
    const defaultExportsOrBarrels = collectTypeScriptFiles(contractsRoot)
      .filter((path) => (
        !isPlainContractTypeScript(path)
        || isIndexModule(path)
        || inspectSource(path, readFileSync(path, "utf8")).includes("default export")
      ))
      .map((path) => relative(process.cwd(), path));

    expect(defaultExportsOrBarrels).toEqual([]);
  });

  it("giới hạn mọi file contract .ts trong 300 dòng", () => {
    const oversizedFiles = collectTypeScriptFiles(contractsRoot)
      .filter((path) => extname(path) === ".ts")
      .map((path) => ({ path, lines: countLines(readFileSync(path, "utf8")) }))
      .filter(({ lines }) => lines > 300)
      .map(({ path, lines }) => `${relative(process.cwd(), path)} -> ${lines} lines`);

    expect(oversizedFiles).toEqual([]);
  });

  it("không để production backend phụ thuộc frontend type layer", () => {
    const violations = collectBackendSourceFiles()
      .filter((path) => !isBackendTestFile(path))
      .flatMap((path) => collectFrontendTypeLayerImports(readFileSync(path, "utf8"), path)
        .map((specifier) => `${relative(process.cwd(), path)} -> frontend type-layer import: ${specifier}`));

    expect(violations).toEqual([]);
  });

  it("bắt default alias, default re-export và template-literal dynamic import", () => {
    expect(inspectSource("alias.ts", "const value = 1; export { value as default };")).toContain("default export");
    expect(inspectSource("re-export.ts", 'export { default } from "./module";')).toContain("default export");
    expect(inspectSource("dynamic.ts", "void import(`react`);")).toEqual(expect.arrayContaining([
      "dynamic import",
      "forbidden import: react",
    ]));
    expect(isPlainContractTypeScript("index.d.ts")).toBe(false);
    expect(isIndexModule("index.d.ts")).toBe(true);
  });

  it("bắt alias exact, alias descendants và import tương đối vào frontend type layer", () => {
    const serverModulePath = join(appRoot, "api", "fixture", "route.ts");
    const relativeSpecifier = relative(
      dirname(serverModulePath),
      join(frontendTypeLayerRoot, "address"),
    ).replaceAll("\\", "/");

    expect(collectFrontendTypeLayerImports(
      'import type { Address } from "@/src/lib/types";',
      serverModulePath,
    )).toEqual(["@/src/lib/types"]);
    expect(collectFrontendTypeLayerImports(
      'import type { Address } from "@/src/lib/types/address";',
      serverModulePath,
    )).toEqual(["@/src/lib/types/address"]);
    expect(collectFrontendTypeLayerImports(
      `import type { Address } from "${relativeSpecifier}";`,
      serverModulePath,
    )).toEqual([relativeSpecifier]);
  });

  it("chỉ quét server modules và bỏ qua app module có use client", () => {
    const backendFiles = collectBackendSourceFiles();

    expect(backendFiles.every((path) => !isPathWithin(path, join(repositoryRoot, "src")))).toBe(true);
    expect(backendFiles).not.toContain(join(appRoot, "global-error.tsx"));
  });

  it("giữ contract cập nhật trạng thái staff khớp đủ transition của route", () => {
    const contract = readFileSync(join(contractsRoot, "order.ts"), "utf8");
    const route = readFileSync(join(process.cwd(), "app/api/staff/orders/[id]/route.ts"), "utf8");

    for (const status of ["ADMIN_CONFIRMED", "STAFF_DONE", "COMPLETED", "CANCELLED"]) {
      expect(contract).toContain(`\"${status}\"`);
    }
    expect(route).toContain("z.ZodType<StaffOrderStatusPayload>");
  });
});
