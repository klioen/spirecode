// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { ExtensionCatalogService, parseCatalogHtml } from "./catalog.js";

const catalogHtml = `<!doctype html><html><body>
<header><span class="packages-count">1-2 / 2 (of 5)</span></header>
<div class="packages-grid">
<article data-package-card="true" data-package-name="pi-safe" data-package-types="extension" data-package-downloads="1234">
  <div class="packages-card-body">
    <h3 class="packages-name"><a href="/packages/pi-safe?type=extension">pi-safe</a></h3>
    <p class="packages-desc">Safe &amp; useful</p>
    <div class="packages-meta"><span>alice</span><span>1.2K/mo</span><span>2d ago</span></div>
    <div class="packages-badges"><span data-type="extension">extension</span></div>
    <div class="packages-links"><a href="https://www.npmjs.com/package/pi-safe">npm</a><a href="https://github.com/example/pi-safe">repo</a></div>
  </div>
</article>
<article data-package-card="true" data-package-name="@scope/pi-tools" data-package-types="extension skill" data-package-downloads="42">
  <div class="packages-card-body">
    <h3 class="packages-name"><a href="/packages/@scope/pi-tools?type=extension">@scope/pi-tools</a></h3>
    <p class="packages-desc">Tools &lt;without remote markup&gt;</p>
    <div class="packages-meta"><span>bob</span><span>42/mo</span><span>1mo ago</span></div>
    <div class="packages-badges"><span data-type="extension">extension</span><span data-type="skill">skill</span></div>
    <div class="packages-links"><a href="javascript:alert(1)">repo</a></div>
  </div>
</article>
</div>
<nav><a class="pagination-page" href="/packages?type=extension&amp;page=3">3</a></nav>
</body></html>`;

describe("parseCatalogHtml", () => {
  it("returns validated plain package data and omits unsafe links", () => {
    expect(parseCatalogHtml(catalogHtml, 1)).toEqual({
      items: [
        {
          name: "pi-safe",
          description: "Safe & useful",
          publisher: "alice",
          downloads: 1234,
          downloadsLabel: "1.2K/mo",
          publishedLabel: "2d ago",
          types: ["extension"],
          catalogUrl: "https://pi.dev/packages/pi-safe?type=extension",
          npmUrl: "https://www.npmjs.com/package/pi-safe",
          repositoryUrl: "https://github.com/example/pi-safe",
        },
        {
          name: "@scope/pi-tools",
          description: "Tools <without remote markup>",
          publisher: "bob",
          downloads: 42,
          downloadsLabel: "42/mo",
          publishedLabel: "1mo ago",
          types: ["extension", "skill"],
          catalogUrl: "https://pi.dev/packages/@scope/pi-tools?type=extension",
        },
      ],
      page: 1,
      total: 2,
      totalPages: 3,
    });
  });

  it("returns an empty result only for an explicit empty catalog", () => {
    expect(
      parseCatalogHtml(
        '<span class="packages-count">0 / 0 (of 5)</span><div class="packages-grid"></div>',
        1,
      ),
    ).toEqual({ items: [], page: 1, total: 0, totalPages: 1 });
  });

  it("fails closed when the catalog schema has no package cards", () => {
    expect(() => parseCatalogHtml("<html>changed</html>", 1)).toThrow(
      "package cards",
    );
  });
});

describe("ExtensionCatalogService", () => {
  it("constructs only the fixed Pi catalog URL", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(catalogHtml, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
    );
    const service = new ExtensionCatalogService(fetcher);

    await service.list({ query: "safe tools", sort: "recent", page: 2 });

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://pi.dev/packages?type=extension&name=safe+tools&sort=recent&page=2",
    );
    expect(init.redirect).toBe("manual");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("omits default query values that Pi canonicalizes with a redirect", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(catalogHtml, {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    const service = new ExtensionCatalogService(fetcher);

    await service.list({ query: "", sort: "downloads", page: 1 });

    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "https://pi.dev/packages?type=extension",
    );
  });

  it("follows one same-origin catalog canonicalization redirect", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: { location: "/packages?type=extension" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(catalogHtml, {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      );
    const service = new ExtensionCatalogService(fetcher);

    await expect(
      service.list({ query: "", sort: "downloads", page: 1 }),
    ).resolves.toMatchObject({ page: 1, total: 2 });
    expect(fetcher.mock.calls[1]?.[0]).toBe(
      "https://pi.dev/packages?type=extension",
    );
  });

  it("rejects cross-origin redirects, non-HTML responses, and oversized bodies", async () => {
    const redirect = new ExtensionCatalogService(
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: "https://evil.example/packages" },
        }),
      ),
    );
    await expect(
      redirect.list({ query: "", sort: "downloads", page: 1 }),
    ).rejects.toThrow("redirect");

    const json = new ExtensionCatalogService(
      vi.fn().mockResolvedValue(
        new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expect(
      json.list({ query: "", sort: "downloads", page: 1 }),
    ).rejects.toThrow("HTML");

    const oversized = new ExtensionCatalogService(
      vi.fn().mockResolvedValue(
        new Response("x".repeat(2_000_001), {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );
    await expect(
      oversized.list({ query: "", sort: "downloads", page: 1 }),
    ).rejects.toThrow("too large");
  });
});
