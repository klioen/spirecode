// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { WindowCloseGuard } from "./windowCloseGuard.js";

describe("WindowCloseGuard", () => {
  it("allows closing without prompting when no files are dirty", () => {
    const confirmDiscard = vi.fn(() => false);
    const guard = new WindowCloseGuard();

    expect(guard.allowClose(confirmDiscard)).toBe(true);
    expect(confirmDiscard).not.toHaveBeenCalled();
  });

  it("keeps the application open when discard is cancelled", () => {
    const guard = new WindowCloseGuard();
    guard.setDirtyFileCount(2);

    expect(guard.allowClose(() => false)).toBe(false);
    expect(guard.dirtyFileCount).toBe(2);
  });

  it("remembers discard approval across the window and app quit events", () => {
    const confirmDiscard = vi.fn(() => true);
    const guard = new WindowCloseGuard();
    guard.setDirtyFileCount(1);

    expect(guard.allowClose(confirmDiscard)).toBe(true);
    expect(guard.allowClose(confirmDiscard)).toBe(true);
    expect(confirmDiscard).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid dirty counts", () => {
    const guard = new WindowCloseGuard();
    expect(() => guard.setDirtyFileCount(-1)).toThrow("dirty file count");
    expect(() => guard.setDirtyFileCount(1.5)).toThrow("dirty file count");
  });
});
