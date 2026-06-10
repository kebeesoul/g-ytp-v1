import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  bytesToMegabytes,
  getDirectorySizeBytes,
  getWorkspaceUsageMb,
} from "./diskUsage";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("diskUsage", () => {
  it("measures nested regular files and ignores missing directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "gytp-disk-"));
    tempDirectories.push(root);
    const nested = join(root, "nested");
    await mkdir(nested);
    await writeFile(join(root, "one.bin"), Buffer.alloc(10));
    await writeFile(join(nested, "two.bin"), Buffer.alloc(20));

    await expect(getDirectorySizeBytes(root)).resolves.toBe(30);
    await expect(getDirectorySizeBytes(join(root, "missing"))).resolves.toBe(0);
  });

  it("returns rounded MB usage for every workspace directory", async () => {
    const root = await mkdtemp(join(tmpdir(), "gytp-usage-"));
    tempDirectories.push(root);
    const directories = {
      import: join(root, "import"),
      export: join(root, "export"),
      tmp: join(root, "tmp"),
      "mastered-cache": join(root, "mastered-cache"),
      thumbnail: join(root, "thumbnail"),
    };
    await mkdir(directories.import);
    await writeFile(
      join(directories.import, "audio.bin"),
      Buffer.alloc(1024 * 1024 + 1)
    );

    await expect(getWorkspaceUsageMb(directories)).resolves.toEqual({
      import: 1,
      export: 0,
      tmp: 0,
      "mastered-cache": 0,
      thumbnail: 0,
    });
    expect(bytesToMegabytes(1536 * 1024)).toBe(2);
  });
});
