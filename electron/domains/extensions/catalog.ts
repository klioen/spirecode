import { CommandError } from "../../core/errors.js";

export type ExtensionCatalogSort = "downloads" | "recent" | "name";

export interface ExtensionCatalogQuery {
  query: string;
  sort: ExtensionCatalogSort;
  page: number;
}

export interface ExtensionCatalogItem {
  name: string;
  description: string;
  publisher: string;
  downloads: number;
  downloadsLabel: string;
  publishedLabel: string;
  types: string[];
  catalogUrl: string;
  npmUrl?: string;
  repositoryUrl?: string;
}

export interface ExtensionCatalogResult {
  items: ExtensionCatalogItem[];
  page: number;
  total: number;
  totalPages: number;
}

type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

const CATALOG_ORIGIN = "https://pi.dev";
const MAX_RESPONSE_BYTES = 2_000_000;
const MAX_ITEMS = 50;
const TIMEOUT_MS = 10_000;

export class ExtensionCatalogService {
  constructor(private readonly fetcher: Fetcher = fetch) {}

  async list(query: ExtensionCatalogQuery): Promise<ExtensionCatalogResult> {
    validateQuery(query);
    const url = new URL("/packages", CATALOG_ORIGIN);
    url.searchParams.set("type", "extension");
    if (query.query) url.searchParams.set("name", query.query);
    if (query.sort !== "downloads") url.searchParams.set("sort", query.sort);
    if (query.page !== 1) url.searchParams.set("page", String(query.page));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await this.fetchCatalogResponse(url, controller.signal);
      if (!response.ok)
        throw new Error(`Pi Catalog request failed (${response.status})`);
      if (!(response.headers.get("content-type") ?? "").includes("text/html"))
        throw new Error("Pi Catalog did not return HTML");
      const declaredLength = Number(response.headers.get("content-length"));
      if (
        Number.isFinite(declaredLength) &&
        declaredLength > MAX_RESPONSE_BYTES
      )
        throw new Error("Pi Catalog response is too large");
      return parseCatalogHtml(await readBoundedText(response), query.page);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async fetchCatalogResponse(
    initialUrl: URL,
    signal: AbortSignal,
  ): Promise<Response> {
    let url = initialUrl;
    for (let redirects = 0; redirects <= 1; redirects += 1) {
      const response = await this.fetcher(url.toString(), {
        method: "GET",
        redirect: "manual",
        signal,
        headers: { accept: "text/html" },
      });
      if (response.status < 300 || response.status >= 400) return response;
      if (redirects === 1) throw new Error("Pi Catalog redirect was rejected");
      const location = response.headers.get("location");
      let redirected: URL;
      try {
        redirected = new URL(location ?? "", url);
      } catch {
        throw new Error("Pi Catalog redirect was rejected");
      }
      if (
        redirected.origin !== CATALOG_ORIGIN ||
        redirected.pathname !== "/packages" ||
        redirected.searchParams.get("type") !== "extension" ||
        redirected.username ||
        redirected.password
      )
        throw new Error("Pi Catalog redirect was rejected");
      await response.body?.cancel();
      url = redirected;
    }
    throw new Error("Pi Catalog redirect was rejected");
  }
}

async function readBoundedText(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let result = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error("Pi Catalog response is too large");
      }
      result += decoder.decode(value, { stream: true });
    }
    return result + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

export function parseCatalogHtml(
  html: string,
  page: number,
): ExtensionCatalogResult {
  const articles = html.match(
    /<article\b[^>]*data-package-card=(?:"true"|'true')[\s\S]*?<\/article>/gi,
  );
  if (!articles?.length) {
    const countText = textOfFirst(html, "packages-count");
    if (/\b0\s*\/\s*0\b/.test(countText) && /\bpackages-grid\b/.test(html))
      return { items: [], page, total: 0, totalPages: 1 };
    throw new Error("Pi Catalog response contained no package cards");
  }
  if (articles.length > MAX_ITEMS)
    throw new Error("Pi Catalog response contained too many package cards");

  const items = articles.map((article) => parseCard(article));
  const countText = textOfFirst(html, "packages-count");
  const totalMatch = countText.match(/\/\s*([0-9][0-9,]*)/);
  const total = totalMatch
    ? Number(totalMatch[1].replaceAll(",", ""))
    : items.length;
  const pages = [
    ...html.matchAll(
      /class=(?:"[^"]*pagination-page[^"]*"|'[^']*pagination-page[^']*')[^>]*>([0-9]+)</gi,
    ),
  ].map((match) => Number(match[1]));
  return {
    items,
    page,
    total: Number.isSafeInteger(total) ? total : items.length,
    totalPages: Math.max(page, ...pages, 1),
  };
}

function parseCard(article: string): ExtensionCatalogItem {
  const attributes = tagAttributes(article.slice(0, article.indexOf(">") + 1));
  const name = attributes["data-package-name"];
  const downloads = Number(attributes["data-package-downloads"]);
  const types = (attributes["data-package-types"] ?? "")
    .split(/\s+/)
    .filter(Boolean);
  if (
    !name ||
    !isPackageName(name) ||
    !Number.isSafeInteger(downloads) ||
    downloads < 0 ||
    !types.includes("extension")
  )
    throw new Error("Pi Catalog package card is invalid");
  const description = textOfFirst(article, "packages-desc");
  const meta = innerOfFirst(article, "packages-meta");
  const metaValues = [
    ...meta.matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi),
  ].map((match) => plainText(match[1]));
  if (metaValues.length < 3)
    throw new Error("Pi Catalog package metadata is invalid");
  const catalogPath = firstHref(innerOfFirst(article, "packages-name"));
  const catalogUrl = safeCatalogUrl(catalogPath, name);
  const links = innerOfFirst(article, "packages-links");
  const hrefs = [
    ...links.matchAll(/<a\b[^>]*href=(?:"([^"]*)"|'([^']*)')[^>]*>/gi),
  ].map((match) => decodeHtml(match[1] ?? match[2] ?? ""));
  const npmUrl = hrefs.map(safeNpmUrl).find(Boolean);
  const repositoryUrl = hrefs.map(safeRepositoryUrl).find(Boolean);
  return {
    name,
    description,
    publisher: metaValues[0],
    downloads,
    downloadsLabel: metaValues[1],
    publishedLabel: metaValues[2],
    types,
    catalogUrl,
    ...(npmUrl ? { npmUrl } : {}),
    ...(repositoryUrl ? { repositoryUrl } : {}),
  };
}

function validateQuery(query: ExtensionCatalogQuery): void {
  if (
    query.query.trim() !== query.query ||
    Buffer.byteLength(query.query, "utf8") > 160 ||
    hasControls(query.query)
  )
    throw new CommandError("INVALID_ARGUMENT", "catalog query is invalid");
  if (
    !new Set<ExtensionCatalogSort>(["downloads", "recent", "name"]).has(
      query.sort,
    )
  )
    throw new CommandError("INVALID_ARGUMENT", "catalog sort is invalid");
  if (!Number.isSafeInteger(query.page) || query.page < 1 || query.page > 200)
    throw new CommandError("INVALID_ARGUMENT", "catalog page is invalid");
}

function tagAttributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g))
    result[match[1].toLowerCase()] = decodeHtml(match[2] ?? match[3] ?? "");
  return result;
}

function innerOfFirst(html: string, className: string): string {
  const pattern = new RegExp(
    `<([a-z0-9]+)\\b[^>]*class=(?:"[^"]*\\b${className}\\b[^"]*"|'[^']*\\b${className}\\b[^']*')[^>]*>([\\s\\S]*?)<\\/\\1>`,
    "i",
  );
  return html.match(pattern)?.[2] ?? "";
}

function textOfFirst(html: string, className: string): string {
  return plainText(innerOfFirst(html, className));
}

function firstHref(html: string): string {
  const match = html.match(/<a\b[^>]*href=(?:"([^"]*)"|'([^']*)')/i);
  return decodeHtml(match?.[1] ?? match?.[2] ?? "");
}

function plainText(html: string): string {
  return decodeHtml(html.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value: string): string {
  return value.replace(
    /&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi,
    (_match, entity: string) => {
      const normalized = entity.toLowerCase();
      if (normalized === "amp") return "&";
      if (normalized === "lt") return "<";
      if (normalized === "gt") return ">";
      if (normalized === "quot") return '"';
      if (normalized === "apos") return "'";
      const radix = normalized.startsWith("#x") ? 16 : 10;
      const digits = normalized.slice(radix === 16 ? 2 : 1);
      const codePoint = Number.parseInt(digits, radix);
      return Number.isSafeInteger(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : "";
    },
  );
}

function safeCatalogUrl(value: string, name: string): string {
  const url = new URL(
    value || `/packages/${encodeURIComponent(name)}`,
    CATALOG_ORIGIN,
  );
  if (url.origin !== CATALOG_ORIGIN || !url.pathname.startsWith("/packages/"))
    throw new Error("Pi Catalog package link is invalid");
  return url.toString();
}

function safeNpmUrl(value: string): string | undefined {
  return safeHttpsUrl(value, new Set(["www.npmjs.com"]), "/package/");
}

function safeRepositoryUrl(value: string): string | undefined {
  return safeHttpsUrl(value, new Set(["github.com"]));
}

function safeHttpsUrl(
  value: string,
  hosts: Set<string>,
  pathPrefix = "/",
): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      hosts.has(url.hostname) &&
      url.pathname.startsWith(pathPrefix) &&
      !url.username &&
      !url.password
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function isPackageName(value: string): boolean {
  return (
    /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(value) &&
    value.length <= 214
  );
}

function hasControls(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || (code >= 127 && code <= 159);
  });
}
