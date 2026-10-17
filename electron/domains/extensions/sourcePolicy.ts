export type ExtensionManagement = "npm" | "local";

export function extensionManagementForSource(
  source: string,
): ExtensionManagement | undefined {
  if (source.startsWith("npm:")) return "npm";
  if (isLocalPackageSource(source)) return "local";
  return undefined;
}

export function isLocalPackageSource(source: string): boolean {
  return (
    source.startsWith("./") ||
    source.startsWith("../") ||
    source.startsWith("~/") ||
    source.startsWith("/") ||
    /^[A-Za-z]:[\\/]/.test(source) ||
    /^\\\\[^\\]/.test(source)
  );
}
