import path from "node:path";
import { access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  NATIVE_TARGETS,
  getNativeTarget,
  verifyPackagedTarget,
} from "./native-targets.mjs";

const desktopDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const releaseDirectory = path.join(desktopDirectory, "release");
let ids = process.argv.slice(2);

if (ids.length === 0) {
  ids = [];
  for (const target of Object.values(NATIVE_TARGETS)) {
    if (await exists(path.join(releaseDirectory, target.appOutputDirectory)))
      ids.push(target.id);
  }
  if (ids.length === 0)
    throw new Error(
      `No unpacked applications were found in ${releaseDirectory}.`,
    );
}

for (const id of ids) {
  const target = getNativeTarget(id);
  const result = await verifyPackagedTarget(releaseDirectory, target);
  console.log(
    `${target.id}: verified ${result.packages.join(", ")} and ${result.binaries.length} native binaries`,
  );
}

async function exists(file) {
  return access(file).then(
    () => true,
    () => false,
  );
}
