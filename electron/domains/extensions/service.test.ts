// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { PackageManager } from "@earendil-works/pi-coding-agent";
import { ExtensionPackageService } from "./service.js";

function fakeManager(
  configured: ReturnType<PackageManager["listConfiguredPackages"]> = [],
) {
  return {
    installAndPersist: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    removeAndPersist: vi.fn().mockResolvedValue(true),
    removeSourceFromSettings: vi.fn().mockReturnValue(true),
    listConfiguredPackages: vi.fn().mockReturnValue(configured),
  };
}

describe("ExtensionPackageService", () => {
  it("constructs an npm source from a validated package name", async () => {
    const manager = fakeManager();
    const service = new ExtensionPackageService(() => manager);

    await service.install("@scope/pi-tools");

    expect(manager.installAndPersist).toHaveBeenCalledWith(
      "npm:@scope/pi-tools",
    );
  });

  it.each([
    "",
    "pi tools",
    "pi-tools@next",
    "npm:pi-tools",
    "../pi-tools",
    "https://example.com/pi-tools",
    "--ignore-scripts",
    "@scope/",
    "@Scope/pi-tools",
  ])("rejects unsafe package name %j", async (name) => {
    const service = new ExtensionPackageService(() => fakeManager());
    await expect(service.install(name)).rejects.toThrow("package name");
  });

  it("updates and removes only exact configured user npm sources", async () => {
    const configured = [
      {
        source: "npm:pi-safe",
        scope: "user" as const,
        filtered: false,
        installedPath: "/private/managed/pi-safe",
      },
      {
        source: "git:https://github.com/example/package",
        scope: "user" as const,
        filtered: false,
      },
      {
        source: "npm:project-only",
        scope: "project" as const,
        filtered: false,
      },
      {
        source: "npm:filtered",
        scope: "user" as const,
        filtered: true,
      },
    ];
    const updateManager = fakeManager(configured);
    const removeManager = fakeManager(configured);
    const managers = [updateManager, removeManager];
    const service = new ExtensionPackageService(() => managers.shift()!);

    await service.update("npm:pi-safe");
    await service.remove("npm:pi-safe");

    expect(updateManager.update).toHaveBeenCalledWith("npm:pi-safe");
    expect(removeManager.removeAndPersist).toHaveBeenCalledWith("npm:pi-safe");
  });

  it("removes an exact configured user local package without updating it", async () => {
    const source = "../../dev/pi-local";
    const installedPath = "/Users/tester/dev/pi-local";
    const manager = fakeManager([
      { source, scope: "user", filtered: false, installedPath },
    ]);
    const service = new ExtensionPackageService(() => manager);

    await service.remove(source);

    expect(manager.removeSourceFromSettings).toHaveBeenCalledWith(
      installedPath,
    );
    expect(manager.removeAndPersist).not.toHaveBeenCalled();
    await expect(service.update(source)).rejects.toThrow(
      "configured user npm package",
    );
  });

  it.each([
    "npm:missing",
    "git:https://github.com/example/package",
    "npm:project-only",
    "npm:filtered",
  ])("rejects unmanaged or unsafe configured source %j", async (source) => {
    const manager = fakeManager([
      {
        source: "git:https://github.com/example/package",
        scope: "user",
        filtered: false,
      },
      { source: "npm:project-only", scope: "project", filtered: false },
      { source: "npm:filtered", scope: "user", filtered: true },
    ]);
    const service = new ExtensionPackageService(() => manager);

    await expect(service.update(source)).rejects.toThrow(
      /configured user (?:npm |)package|not found/,
    );
  });

  it("serializes package mutations", async () => {
    let finishFirst!: () => void;
    const first = fakeManager();
    first.installAndPersist.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishFirst = resolve;
      }),
    );
    const second = fakeManager();
    const service = new ExtensionPackageService(
      vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second),
    );

    const installing = service.install("pi-one");
    const next = service.install("pi-two");
    await Promise.resolve();
    expect(second.installAndPersist).not.toHaveBeenCalled();

    finishFirst();
    await Promise.all([installing, next]);
    expect(second.installAndPersist).toHaveBeenCalledWith("npm:pi-two");
  });
});
