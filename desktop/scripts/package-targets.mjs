import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  getCurrentNativeTarget,
  getNativeTarget,
  verifyPackagedTarget,
  verifySharpNativeDependencies,
} from "./native-targets.mjs";

const desktopDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const stageRoot = path.join(desktopDirectory, ".package-stage");
const releaseDirectory = path.join(desktopDirectory, "release");

const requestedTargets = process.argv.slice(2);
if (requestedTargets.length === 0) {
  throw new Error(
    "Pass at least one target: current, current-platform, mac-arm64, mac-x64, or win-x64.",
  );
}

const targets = requestedTargets.flatMap((id) => {
  if (id === "current") return [getCurrentNativeTarget()];
  if (id === "current-platform") {
    if (process.platform === "darwin") {
      return [getNativeTarget("mac-arm64"), getNativeTarget("mac-x64")];
    }
    if (process.platform === "win32") return [getNativeTarget("win-x64")];
    throw new Error(
      `Packaging is not configured for the current host (${process.platform}-${process.arch}).`,
    );
  }
  return [getNativeTarget(id)];
});
for (const target of targets) {
  await packageTarget(target);
}

async function packageTarget(target) {
  const stageDirectory = path.join(stageRoot, target.id);
  console.log(`\nPackaging Palang IC for ${target.id}`);
  await prepareStage(stageDirectory);

  try {
    const npm = npmInvocation();
    await run(
      npm.command,
      [
        ...npm.args,
        "ci",
        "--omit=dev",
        "--include=optional",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        `--os=${target.npmOs}`,
        `--cpu=${target.npmCpu}`,
      ],
      stageDirectory,
    );

    const staged = await verifySharpNativeDependencies(
      path.join(stageDirectory, "node_modules"),
      target,
    );
    console.log(
      `Verified staged native dependencies: ${staged.packages.join(", ")}`,
    );

    await rm(path.join(releaseDirectory, target.appOutputDirectory), {
      recursive: true,
      force: true,
    });
    await mkdir(releaseDirectory, { recursive: true });
    await run(
      process.execPath,
      [
        path.join(
          desktopDirectory,
          "node_modules",
          "electron-builder",
          "cli.js",
        ),
        "--projectDir",
        stageDirectory,
        ...target.builderArgs,
        "--publish",
        "never",
        `--config.directories.output=${releaseDirectory}`,
        "--config.npmRebuild=false",
      ],
      desktopDirectory,
    );

    const packaged = await verifyPackagedTarget(releaseDirectory, target);
    console.log(
      `Verified packaged ${target.id} native binaries (${packaged.binaries.length}): ${packaged.packages.join(", ")}`,
    );
  } finally {
    if (process.env.KEEP_PACKAGE_STAGE === "1") {
      console.log(`Kept package stage at ${stageDirectory}`);
    } else {
      await rm(stageDirectory, { recursive: true, force: true });
    }
  }
}

async function prepareStage(stageDirectory) {
  await rm(stageDirectory, { recursive: true, force: true });
  await mkdir(stageDirectory, { recursive: true });

  for (const file of ["package-lock.json", "THIRD_PARTY_NOTICES.md"]) {
    await cp(
      path.join(desktopDirectory, file),
      path.join(stageDirectory, file),
    );
  }
  for (const directory of ["out", "build"]) {
    await cp(
      path.join(desktopDirectory, directory),
      path.join(stageDirectory, directory),
      {
        recursive: true,
      },
    );
  }

  const packageJson = JSON.parse(
    await readFile(path.join(desktopDirectory, "package.json"), "utf8"),
  );
  const packageLock = JSON.parse(
    await readFile(path.join(desktopDirectory, "package-lock.json"), "utf8"),
  );
  const electronVersion =
    packageLock.packages?.["node_modules/electron"]?.version;
  if (typeof electronVersion !== "string" || electronVersion.length === 0) {
    throw new Error(
      "Cannot determine the locked Electron version from package-lock.json.",
    );
  }
  packageJson.build = {
    ...packageJson.build,
    npmRebuild: false,
    electronVersion,
  };
  await writeFile(
    path.join(stageDirectory, "package.json"),
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );
}

function npmInvocation() {
  if (process.env.npm_execpath) {
    return { command: process.execPath, args: [process.env.npm_execpath] };
  }
  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args: [],
  };
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `${path.basename(command)} failed${signal ? ` with signal ${signal}` : ` with exit code ${code}`}.`,
          ),
        );
      }
    });
  });
}
