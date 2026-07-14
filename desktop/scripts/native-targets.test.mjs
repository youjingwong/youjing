import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getNativeTarget,
  verifySharpNativeDependencies,
} from "./native-targets.mjs";

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true })),
  );
});

describe("target-specific Sharp verification", () => {
  it("accepts Intel Mach-O Sharp and libvips packages", async () => {
    const nodeModules = await createNodeModules();
    await addPackage(
      nodeModules,
      "sharp-darwin-x64",
      "lib/sharp.node",
      machO(0x01000007),
    );
    await addPackage(
      nodeModules,
      "sharp-libvips-darwin-x64",
      "lib/libvips.dylib",
      machO(0x01000007),
    );

    const result = await verifySharpNativeDependencies(
      nodeModules,
      getNativeTarget("mac-x64"),
    );
    expect(result.packages).toEqual([
      "sharp-darwin-x64",
      "sharp-libvips-darwin-x64",
    ]);
  });

  it("rejects a host ARM64 package in an Intel stage", async () => {
    const nodeModules = await createNodeModules();
    await addPackage(
      nodeModules,
      "sharp-darwin-arm64",
      "lib/sharp.node",
      machO(0x0100000c),
    );
    await addPackage(
      nodeModules,
      "sharp-libvips-darwin-arm64",
      "lib/libvips.dylib",
      machO(0x0100000c),
    );

    await expect(
      verifySharpNativeDependencies(nodeModules, getNativeTarget("mac-x64")),
    ).rejects.toThrow(/expected sharp-darwin-x64, found sharp-darwin-arm64/);
  });

  it("validates the PE machine type for Windows x64", async () => {
    const nodeModules = await createNodeModules();
    await addPackage(
      nodeModules,
      "sharp-win32-x64",
      "lib/sharp.node",
      pe(0x8664),
    );
    await addPackage(
      nodeModules,
      "sharp-win32-x64",
      "lib/libvips.dll",
      pe(0x8664),
    );

    const result = await verifySharpNativeDependencies(
      nodeModules,
      getNativeTarget("win-x64"),
    );
    expect(result.binaries).toHaveLength(2);
  });

  it("rejects a native binary whose package name hides the wrong architecture", async () => {
    const nodeModules = await createNodeModules();
    await addPackage(
      nodeModules,
      "sharp-win32-x64",
      "lib/sharp.node",
      pe(0xaa64),
    );

    await expect(
      verifySharpNativeDependencies(nodeModules, getNativeTarget("win-x64")),
    ).rejects.toThrow(/wrong native architecture/);
  });
});

async function createNodeModules() {
  const root = await mkdtemp(path.join(os.tmpdir(), "palang-native-test-"));
  temporaryDirectories.push(root);
  const nodeModules = path.join(root, "node_modules");
  await mkdir(path.join(nodeModules, "@img"), { recursive: true });
  return nodeModules;
}

async function addPackage(nodeModules, packageName, relativeFile, contents) {
  const packageDirectory = path.join(nodeModules, "@img", packageName);
  await mkdir(path.dirname(path.join(packageDirectory, relativeFile)), {
    recursive: true,
  });
  await writeFile(path.join(packageDirectory, relativeFile), contents);
}

function machO(machine) {
  const buffer = Buffer.alloc(32);
  buffer.writeUInt32LE(0xfeedfacf, 0);
  buffer.writeUInt32LE(machine, 4);
  return buffer;
}

function pe(machine) {
  const buffer = Buffer.alloc(256);
  buffer.writeUInt16LE(0x5a4d, 0);
  buffer.writeUInt32LE(0x80, 0x3c);
  buffer.writeUInt32LE(0x00004550, 0x80);
  buffer.writeUInt16LE(machine, 0x84);
  return buffer;
}
