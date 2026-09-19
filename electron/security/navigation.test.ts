import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createRendererLocationPolicy,
  isAllowedExternalUrl,
  isAllowedRendererUrl,
} from "./navigation.js";

describe("renderer navigation policy", () => {
  it("allows only the packaged renderer entry for file URLs", () => {
    const entry = path.resolve("dist/index.html");
    const policy = createRendererLocationPolicy(entry);
    const rendererUrl = new URL(pathToFileURL(entry));
    rendererUrl.hash = "/project/1";
    expect(isAllowedRendererUrl(rendererUrl.href, policy)).toBe(true);
    expect(isAllowedRendererUrl("file:///tmp/evil.html", policy)).toBe(false);
  });

  it("accepts only an exact loopback development origin", () => {
    const policy = createRendererLocationPolicy(
      "/app/dist/index.html",
      "http://127.0.0.1:1420",
    );
    expect(isAllowedRendererUrl("http://127.0.0.1:1420/#/chat", policy)).toBe(
      true,
    );
    expect(isAllowedRendererUrl("http://127.0.0.1:14200/evil", policy)).toBe(
      false,
    );
    expect(isAllowedRendererUrl("http://example.com", policy)).toBe(false);
  });

  it("rejects non-loopback development URLs", () => {
    expect(() =>
      createRendererLocationPolicy(
        "/app/dist/index.html",
        "https://example.com",
      ),
    ).toThrow(/loopback/);
  });

  it("allows only credential-free HTTPS external URLs", () => {
    expect(isAllowedExternalUrl("https://zed.dev/docs")).toBe(true);
    expect(isAllowedExternalUrl("http://zed.dev/docs")).toBe(false);
    expect(isAllowedExternalUrl("https://user@example.com/docs")).toBe(false);
    expect(isAllowedExternalUrl("file:///tmp/evil.html")).toBe(false);
  });
});
