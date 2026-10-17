import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  blockEditorDocuments,
  clearEditorDocumentOperations,
  isEditorDocumentBlocked,
  trackEditorDocumentSave,
} from "./editorDocumentOperations";

beforeEach(clearEditorDocumentOperations);

describe("editor document operations", () => {
  it("blocks new saves before waiting for an in-flight save", async () => {
    let finish!: () => void;
    const saving = new Promise<void>((resolve) => {
      finish = resolve;
    });
    void trackEditorDocumentSave("file:w1:a.ts", saving);

    const blocked = blockEditorDocuments(["file:w1:a.ts"]);
    expect(isEditorDocumentBlocked("file:w1:a.ts")).toBe(true);
    const settled = vi.fn();
    void blocked.then(settled);
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();

    finish();
    const release = await blocked;
    release();
    expect(isEditorDocumentBlocked("file:w1:a.ts")).toBe(false);
  });

  it("keeps a document blocked until every overlapping lease releases", async () => {
    const first = await blockEditorDocuments(["file:w1:a.ts"]);
    const second = await blockEditorDocuments(["file:w1:a.ts"]);
    second();
    expect(isEditorDocumentBlocked("file:w1:a.ts")).toBe(true);
    first();
    expect(isEditorDocumentBlocked("file:w1:a.ts")).toBe(false);
  });
});
