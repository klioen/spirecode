import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import ts from "typescript";

const requestedSources = process.argv.slice(2);
const discoveredSources = requestedSources.length
  ? requestedSources
  : execFileSync(
      "git",
      ["ls-files", "src/**/*.ts", "src/**/*.tsx", "electron/**/*.ts"],
      { encoding: "utf8" },
    )
      .trim()
      .split("\n");
const productionSources = discoveredSources.filter(
  (file) =>
    file &&
    existsSync(file) &&
    !file.includes(".test.") &&
    !file.startsWith("src/i18n/") &&
    !file.startsWith("src/bindings/generated") &&
    file !== "electron/nativeDialog.ts",
);

const localizedAttributes = new Set(["aria-label", "placeholder", "title"]);
const nativeDialogProperties = new Set([
  "buttons",
  "title",
  "message",
  "detail",
]);
const allowedVisibleText = new Set([
  "S",
  "SpireCode",
  "SPIRECODE",
  "pi",
  "~/.pi/agent",
  "px",
  "v",
  "·",
  "×",
]);
const violations = [];

for (const file of productionSources) {
  const contents = readFileSync(file, "utf8");
  const source = ts.createSourceFile(
    file,
    contents,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const report = (node, text, kind) => {
    const normalized = text.replace(/\s+/g, " ").trim();
    if (!normalized || allowedVisibleText.has(normalized)) return;
    if (!/[A-Za-z\u3400-\u9fff]/u.test(normalized)) return;
    const { line } = source.getLineAndCharacterOfPosition(
      node.getStart(source),
    );
    violations.push(`${file}:${line + 1}:${kind}:${normalized}`);
  };

  const stringValues = (node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      return [node.text];
    if (ts.isTemplateExpression(node) && node.templateSpans.length === 0)
      return [node.head.text];
    if (ts.isArrayLiteralExpression(node))
      return node.elements.flatMap(stringValues);
    if (ts.isConditionalExpression(node))
      return [...stringValues(node.whenTrue), ...stringValues(node.whenFalse)];
    if (ts.isParenthesizedExpression(node))
      return stringValues(node.expression);
    return [];
  };

  const visit = (node) => {
    if (ts.isJsxText(node)) report(node, node.text, "JSX text");
    if (
      ts.isJsxExpression(node) &&
      node.expression &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))
    )
      for (const value of stringValues(node.expression))
        report(node, value, "JSX expression");
    if (
      ts.isJsxAttribute(node) &&
      localizedAttributes.has(node.name.getText(source)) &&
      node.initializer
    ) {
      const initializer = ts.isJsxExpression(node.initializer)
        ? node.initializer.expression
        : node.initializer;
      if (initializer)
        for (const value of stringValues(initializer))
          report(node, value, `${node.name.getText(source)} attribute`);
    }
    if (
      (file === "electron/main.ts" || requestedSources.length > 0) &&
      ts.isPropertyAssignment(node) &&
      nativeDialogProperties.has(node.name.getText(source))
    )
      for (const value of stringValues(node.initializer))
        report(node, value, `native dialog ${node.name.getText(source)}`);
    ts.forEachChild(node, visit);
  };
  visit(source);
}

if (violations.length > 0) {
  console.error(
    "Hard-coded user-facing copy found outside src/i18n catalogs:\n" +
      violations.join("\n"),
  );
  process.exit(1);
}

console.log("Localized copy check passed");
