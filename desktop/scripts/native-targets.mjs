import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const DARWIN_X64_CPU = 0x01000007;
const DARWIN_ARM64_CPU = 0x0100000c;
const WINDOWS_X64_MACHINE = 0x8664;

export const NATIVE_TARGETS = Object.freeze({
  "mac-arm64": Object.freeze({
    id: "mac-arm64",
    npmOs: "darwin",
    npmCpu: "arm64",
    builderArgs: ["--mac", "dmg", "--arm64"],
    appOutputDirectory: "mac-arm64",
    expectedSharpPackage: "sharp-darwin-arm64",
    expectedLibvipsPackage: "sharp-libvips-darwin-arm64",
    binaryFormat: "mach-o",
    machine: DARWIN_ARM64_CPU,
  }),
  "mac-x64": Object.freeze({
    id: "mac-x64",
    npmOs: "darwin",
    npmCpu: "x64",
    builderArgs: ["--mac", "dmg", "--x64"],
    appOutputDirectory: "mac",
    expectedSharpPackage: "sharp-darwin-x64",
    expectedLibvipsPackage: "sharp-libvips-darwin-x64",
    binaryFormat: "mach-o",
    machine: DARWIN_X64_CPU,
  }),
  "win-x64": Object.freeze({
    id: "win-x64",
    npmOs: "win32",
    npmCpu: "x64",
    builderArgs: ["--win", "nsis", "--x64"],
    appOutputDirectory: "win-unpacked",
    expectedSharpPackage: "sharp-win32-x64",
    expectedLibvipsPackage: null,
    binaryFormat: "pe",
    machine: WINDOWS_X64_MACHINE,
  }),
});

export function getNativeTarget(id) {
  const target = NATIVE_TARGETS[id];
  if (!target) {
    throw new Error(
      `Unknown package target "${id}". Expected one of: ${Object.keys(NATIVE_TARGETS).join(", ")}.`,
    );
  }
  return target;
}

export function getCurrentNativeTarget() {
  if (
    process.platform === "darwin" &&
    (process.arch === "arm64" || process.arch === "x64")
  ) {
    return getNativeTarget(`mac-${process.arch}`);
  }
  if (process.platform === "win32" && process.arch === "x64") {
    return getNativeTarget("win-x64");
  }
  throw new Error(
    `Packaging is not configured for the current host (${process.platform}-${process.arch}).`,
  );
}

export function getPackagedNodeModulesDirectory(releaseDirectory, target) {
  const appDirectory = path.join(releaseDirectory, target.appOutputDirectory);
  if (target.npmOs === "darwin") {
    return path.join(
      appDirectory,
      "Palang IC.app",
      "Contents",
      "Resources",
      "app.asar.unpacked",
      "node_modules",
    );
  }
  return path.join(
    appDirectory,
    "resources",
    "app.asar.unpacked",
    "node_modules",
  );
}

export async function verifySharpNativeDependencies(
  nodeModulesDirectory,
  target,
) {
  const imagePackagesDirectory = path.join(nodeModulesDirectory, "@img");
  const entries = await readdir(imagePackagesDirectory, {
    withFileTypes: true,
  }).catch((error) => {
    throw new Error(
      `Cannot inspect Sharp native packages for ${target.id} at ${imagePackagesDirectory}: ${error.message}`,
    );
  });
  const packageNames = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const platformSharpPackages = packageNames.filter((name) =>
    /^sharp-(?:darwin|win32|linux(?:musl)?)-/.test(name),
  );
  assertExactPackages(
    platformSharpPackages,
    [target.expectedSharpPackage],
    target,
    "Sharp",
  );

  const libvipsPackages = packageNames.filter((name) =>
    /^sharp-libvips-/.test(name),
  );
  const expectedLibvipsPackages = target.expectedLibvipsPackage
    ? [target.expectedLibvipsPackage]
    : [];
  assertExactPackages(
    libvipsPackages,
    expectedLibvipsPackages,
    target,
    "libvips",
  );

  const nativePackageDirectory = path.join(
    imagePackagesDirectory,
    target.expectedSharpPackage,
  );
  const nativeBinaries = (
    await listFilesRecursively(nativePackageDirectory)
  ).filter((file) =>
    target.binaryFormat === "mach-o"
      ? file.endsWith(".node")
      : /\.(?:node|dll)$/i.test(file),
  );
  if (nativeBinaries.length === 0) {
    throw new Error(
      `${target.expectedSharpPackage} does not contain a native binary.`,
    );
  }

  if (target.expectedLibvipsPackage) {
    const libvipsDirectory = path.join(
      imagePackagesDirectory,
      target.expectedLibvipsPackage,
    );
    const libvipsBinaries = (
      await listFilesRecursively(libvipsDirectory)
    ).filter((file) => file.endsWith(".dylib"));
    if (libvipsBinaries.length === 0) {
      throw new Error(
        `${target.expectedLibvipsPackage} does not contain a libvips dynamic library.`,
      );
    }
    nativeBinaries.push(...libvipsBinaries);
  }

  for (const binary of nativeBinaries) {
    await verifyNativeBinary(binary, target);
  }

  return {
    target: target.id,
    packages: [...platformSharpPackages, ...libvipsPackages],
    binaries: nativeBinaries,
  };
}

export async function verifyPackagedTarget(releaseDirectory, target) {
  const nodeModulesDirectory = getPackagedNodeModulesDirectory(
    releaseDirectory,
    target,
  );
  await access(nodeModulesDirectory).catch(() => {
    throw new Error(
      `Packaged application for ${target.id} was not found at ${nodeModulesDirectory}.`,
    );
  });
  return verifySharpNativeDependencies(nodeModulesDirectory, target);
}

export async function verifyNativeBinary(file, target) {
  const buffer = await readFile(file);
  const detectedMachines =
    target.binaryFormat === "mach-o"
      ? readMachOMachines(buffer)
      : [readPeMachine(buffer)];
  if (!detectedMachines.includes(target.machine)) {
    const detected = detectedMachines
      .map((machine) => `0x${machine.toString(16)}`)
      .join(", ");
    throw new Error(
      `${file} has the wrong native architecture for ${target.id} (detected ${detected || "unknown"}).`,
    );
  }
}

function assertExactPackages(actual, expected, target, label) {
  const sortedActual = [...actual].sort();
  const sortedExpected = [...expected].sort();
  if (JSON.stringify(sortedActual) !== JSON.stringify(sortedExpected)) {
    throw new Error(
      `${label} native packages for ${target.id} are incorrect: expected ${formatList(sortedExpected)}, found ${formatList(sortedActual)}.`,
    );
  }
}

function formatList(items) {
  return items.length > 0 ? items.join(", ") : "none";
}

async function listFilesRecursively(directory) {
  const result = [];
  const entries = await readdir(directory, { withFileTypes: true }).catch(
    (error) => {
      throw new Error(
        `Cannot inspect native dependency directory ${directory}: ${error.message}`,
      );
    },
  );
  for (const entry of entries) {
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await listFilesRecursively(item)));
    } else if (entry.isFile()) {
      result.push(item);
    }
  }
  return result;
}

function readMachOMachines(buffer) {
  if (buffer.length < 8) return [];

  const magicBigEndian = buffer.readUInt32BE(0);
  const magicLittleEndian = buffer.readUInt32LE(0);
  if (magicLittleEndian === 0xfeedfacf || magicLittleEndian === 0xfeedface) {
    return [buffer.readUInt32LE(4)];
  }
  if (magicBigEndian === 0xfeedfacf || magicBigEndian === 0xfeedface) {
    return [buffer.readUInt32BE(4)];
  }

  const isFat32 = magicBigEndian === 0xcafebabe;
  const isFat64 = magicBigEndian === 0xcafebabf;
  if (!isFat32 && !isFat64) return [];

  const count = buffer.readUInt32BE(4);
  const stride = isFat64 ? 32 : 20;
  const machines = [];
  for (let index = 0; index < count; index += 1) {
    const offset = 8 + index * stride;
    if (offset + 4 > buffer.length) break;
    machines.push(buffer.readUInt32BE(offset));
  }
  return machines;
}

function readPeMachine(buffer) {
  if (buffer.length < 64 || buffer.readUInt16LE(0) !== 0x5a4d) return -1;
  const peOffset = buffer.readUInt32LE(0x3c);
  if (
    peOffset + 6 > buffer.length ||
    buffer.readUInt32LE(peOffset) !== 0x00004550
  )
    return -1;
  return buffer.readUInt16LE(peOffset + 4);
}
