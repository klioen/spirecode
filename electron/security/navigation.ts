import { pathToFileURL } from "node:url";

export interface RendererLocationPolicy {
  productionEntry: string;
  developmentOrigin?: string;
}

export function createRendererLocationPolicy(
  productionEntryPath: string,
  developmentUrl?: string,
): RendererLocationPolicy {
  const policy: RendererLocationPolicy = {
    productionEntry: pathToFileURL(productionEntryPath).href,
  };
  if (developmentUrl) {
    const url = new URL(developmentUrl);
    if (
      url.protocol !== "http:" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    )
      throw new Error("VITE_DEV_SERVER_URL must use a loopback HTTP origin");
    policy.developmentOrigin = url.origin;
  }
  return policy;
}

export function isAllowedRendererUrl(
  rawUrl: string,
  policy: RendererLocationPolicy,
): boolean {
  try {
    const candidate = new URL(rawUrl);
    if (
      policy.developmentOrigin &&
      candidate.origin === policy.developmentOrigin
    )
      return true;
    const production = new URL(policy.productionEntry);
    return (
      candidate.protocol === "file:" &&
      candidate.origin === production.origin &&
      candidate.pathname === production.pathname
    );
  } catch {
    return false;
  }
}

export function isAllowedExternalUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return (
      url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      !hasControlCharacters(rawUrl)
    );
  } catch {
    return false;
  }
}

function hasControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code <= 0x1f || code === 0x7f;
  });
}
