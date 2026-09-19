export function portableRelativePath(value: string): string;

export function clipboardPackageForTarget(
  platform: NodeJS.Platform | string,
  arch: string,
): string;

export function copyDirectoryWithoutSymlinks(
  source: string,
  destination: string,
): Promise<void>;

export function stageClipboardPackage(
  root: string,
  platform: NodeJS.Platform | string,
  arch: string,
): Promise<{
  packageName: string;
  destination: string;
  cleanup: () => Promise<void>;
}>;
