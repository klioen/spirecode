import assert from "node:assert/strict";
import test from "node:test";
import { validateTagAndVersion } from "./preflight.mjs";

for (const tag of ["v1.2.3", "v0.1.0-rc.1", "v10.20.30-beta"] ) {
  test(`accepts canonical tag ${tag}`, () => {
    assert.deepEqual(validateTagAndVersion(tag, tag.slice(1)), { tag, version: tag.slice(1) });
  });
}

for (const tag of ["1.2.3", "v01.2.3", "v1.2", "v1.2.3+build", "v1.2.3-"]) {
  test(`rejects invalid tag ${tag}`, () => {
    assert.throws(() => validateTagAndVersion(tag, "1.2.3"), /canonical semantic version/);
  });
}

test("rejects a tag/package version mismatch", () => {
  assert.throws(() => validateTagAndVersion("v1.2.3", "1.2.4"), /does not match/);
});
