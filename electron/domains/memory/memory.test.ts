// @vitest-environment node
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryService } from "./index.js";

const roots: string[] = [];

async function memoryRoot() {
  const root = await mkdtemp(path.join(tmpdir(), "spire-memory-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  delete process.env.PI_MEMORY_DIR;
});

describe("MemoryService", () => {
  it("reads only the two fixed memory documents", async () => {
    const root = await memoryRoot();
    await writeFile(path.join(root, "memory_summary.md"), "v1\n\n# Summary\n");
    await writeFile(path.join(root, "MEMORY.md"), "# Handbook\n");
    await writeFile(path.join(root, "raw_memories.md"), "secret\n");
    const service = new MemoryService(root);

    await expect(service.read("summary")).resolves.toMatchObject({
      id: "summary",
      name: "memory_summary.md",
      content: "v1\n\n# Summary\n",
    });
    await expect(service.read("handbook")).resolves.toMatchObject({
      id: "handbook",
      name: "MEMORY.md",
      content: "# Handbook\n",
    });
    await expect(service.read("raw" as "summary")).rejects.toMatchObject({
      code: "INVALID_ARGUMENT",
    });
  });

  it("uses PI_MEMORY_DIR when no root is supplied", async () => {
    const root = await memoryRoot();
    process.env.PI_MEMORY_DIR = root;
    await writeFile(path.join(root, "memory_summary.md"), "v1\n");

    await expect(new MemoryService().read("summary")).resolves.toMatchObject({
      content: "v1\n",
    });
  });

  it("rejects missing, oversized, binary, and invalid UTF-8 documents", async () => {
    const root = await memoryRoot();
    const service = new MemoryService(root);

    await expect(service.read("summary")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    await writeFile(
      path.join(root, "memory_summary.md"),
      Buffer.alloc(2 * 1024 * 1024 + 1, 97),
    );
    await expect(service.read("summary")).rejects.toMatchObject({
      code: "FILE_TOO_LARGE",
    });

    await writeFile(path.join(root, "memory_summary.md"), Buffer.from([0]));
    await expect(service.read("summary")).rejects.toMatchObject({
      code: "UNSUPPORTED_FILE",
    });

    await writeFile(
      path.join(root, "memory_summary.md"),
      Buffer.from([0xc3, 0x28]),
    );
    await expect(service.read("summary")).rejects.toMatchObject({
      code: "UNSUPPORTED_FILE",
    });
  });

  it("rejects a document symlink that escapes the memory root", async () => {
    const root = await memoryRoot();
    const outside = await memoryRoot();
    await mkdir(path.join(outside, "data"));
    const target = path.join(outside, "data", "memory_summary.md");
    await writeFile(target, "outside\n");
    await symlink(target, path.join(root, "memory_summary.md"));

    await expect(new MemoryService(root).read("summary")).rejects.toMatchObject(
      {
        code: "OUTSIDE_MEMORY",
      },
    );
  });
});
