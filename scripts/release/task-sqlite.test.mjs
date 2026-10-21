import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const databaseSource = await readFile(
  new URL("../../electron/domains/tasks/database.ts", import.meta.url),
  "utf8",
);

test("preserves node:sqlite through the Main bundler", () => {
  assert.match(
    databaseSource,
    /createRequire\(import\.meta\.url\)\(["']node:sqlite["']\)/,
  );
  assert.doesNotMatch(databaseSource, /^import \{ DatabaseSync \} from "node:sqlite"/m);
});
