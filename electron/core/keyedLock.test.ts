// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { KeyedLock } from "./keyedLock.js";

describe("KeyedLock", () => {
  it("serializes the same key while allowing different keys", async () => {
    const lock = new KeyedLock();
    const releaseFirst = await lock.acquire("w1");
    const secondEntered = vi.fn();
    const second = lock.acquire("w1").then((release) => {
      secondEntered();
      release();
    });
    const otherRelease = await lock.acquire("w2");
    otherRelease();
    await Promise.resolve();
    expect(secondEntered).not.toHaveBeenCalled();
    releaseFirst();
    await second;
    expect(secondEntered).toHaveBeenCalledOnce();
  });
});
