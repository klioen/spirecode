import type { PackageManager } from "@earendil-works/pi-coding-agent";
import { AsyncQueue } from "../../core/asyncQueue.js";
import { CommandError } from "../../core/errors.js";
import { extensionManagementForSource } from "./sourcePolicy.js";

type ManagedPackageManager = Pick<
  PackageManager,
  | "installAndPersist"
  | "update"
  | "removeAndPersist"
  | "removeSourceFromSettings"
  | "listConfiguredPackages"
>;

type PackageManagerFactory = () => ManagedPackageManager;
type PreparePackageManager = () => Promise<void>;

export class ExtensionPackageService {
  private readonly queue = new AsyncQueue();

  constructor(
    private readonly createPackageManager: PackageManagerFactory,
    private readonly preparePackageManager: PreparePackageManager = async () => {},
  ) {}

  install(packageName: string): Promise<void> {
    return this.queue.run(async () => {
      assertPackageName(packageName);
      await this.preparePackageManager();
      await this.createPackageManager().installAndPersist(`npm:${packageName}`);
    });
  }

  update(source: string): Promise<void> {
    return this.queue.run(async () => {
      await this.preparePackageManager();
      const manager = this.createPackageManager();
      assertManagedNpmSource(manager, source);
      await manager.update(source);
    });
  }

  remove(source: string): Promise<void> {
    return this.queue.run(async () => {
      await this.preparePackageManager();
      const manager = this.createPackageManager();
      const { management, removalSource } = assertRemovableSource(
        manager,
        source,
      );
      const removed =
        management === "npm"
          ? await manager.removeAndPersist(removalSource)
          : manager.removeSourceFromSettings(removalSource);
      if (!removed)
        throw new CommandError("NOT_FOUND", "configured package not found");
    });
  }
}

export function assertPackageName(value: string): void {
  if (
    !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(value) ||
    value.length > 214
  )
    throw new CommandError("INVALID_ARGUMENT", "package name is invalid");
}

function configuredUserSource(manager: ManagedPackageManager, source: string) {
  const configured = manager
    .listConfiguredPackages()
    .find((candidate) => candidate.source === source);
  if (!configured)
    throw new CommandError("NOT_FOUND", "configured package not found");
  if (configured.scope !== "user" || configured.filtered)
    throw new CommandError(
      "INVALID_ARGUMENT",
      "source is not a removable configured user package",
    );
  return configured;
}

function assertManagedNpmSource(
  manager: ManagedPackageManager,
  source: string,
): void {
  configuredUserSource(manager, source);
  if (extensionManagementForSource(source) !== "npm")
    throw new CommandError(
      "INVALID_ARGUMENT",
      "source is not a configured user npm package",
    );
}

function assertRemovableSource(
  manager: ManagedPackageManager,
  source: string,
): { management: "npm" | "local"; removalSource: string } {
  const configured = configuredUserSource(manager, source);
  const management = extensionManagementForSource(source);
  if (!management)
    throw new CommandError(
      "INVALID_ARGUMENT",
      "source is not a removable configured user package",
    );
  if (management === "local" && !configured.installedPath)
    throw new CommandError(
      "NOT_FOUND",
      "configured local package path was not found",
    );
  return {
    management,
    removalSource: management === "local" ? configured.installedPath! : source,
  };
}
