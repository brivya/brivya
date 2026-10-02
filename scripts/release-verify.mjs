import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const releaseVersion = "0.1.0-alpha.1";
const packagePaths = [
  "packages/cli/package.json",
  "packages/core/package.json",
  "packages/distribution/package.json",
  "packages/experience/package.json",
  "packages/extensions/package.json",
  "packages/manifest/package.json",
  "packages/policy/package.json",
  "packages/runtime/package.json",
  "packages/sdk/package.json",
  "adapters/mcp/package.json",
  "adapters/rest/package.json",
  "adapters/wechat-ai/package.json",
  "adapters/workbuddy/package.json",
  "connectors/mock/package.json",
];

const errors = [];

for (const packagePath of packagePaths) {
  const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
  const dir = dirname(packagePath);

  if (pkg.private) {
    errors.push(`${pkg.name}: expected a public package`);
  }

  if (pkg.version !== releaseVersion) {
    errors.push(
      `${pkg.name}: version ${pkg.version} does not match ${releaseVersion}`,
    );
  }

  const typesPath = pkg.types;
  const exportTypes = pkg.exports?.["."]?.types;
  const defaultExport = pkg.exports?.["."]?.default;

  if (typesPath !== "./dist/src/index.d.ts") {
    errors.push(`${pkg.name}: types must point to ./dist/src/index.d.ts`);
  }

  if (exportTypes !== "./dist/src/index.d.ts") {
    errors.push(
      `${pkg.name}: exports["."].types must point to compiled declarations`,
    );
  }

  if (defaultExport !== "./dist/src/index.js") {
    errors.push(
      `${pkg.name}: exports["."].default must point to ./dist/src/index.js`,
    );
  }

  for (const relative of [typesPath, defaultExport]) {
    if (!relative) continue;
    const absolute = join(dir, relative.replace(/^\.\//, ""));
    if (!existsSync(absolute)) {
      errors.push(`${pkg.name}: release artifact missing: ${relative}`);
    }
  }

  for (const [dependency, version] of Object.entries(pkg.dependencies ?? {})) {
    if (dependency.startsWith("@brivya/") && version !== releaseVersion) {
      errors.push(
        `${pkg.name}: internal dependency ${dependency} must be pinned to ${releaseVersion}, got ${version}`,
      );
    }
  }

  if (pkg.name === "@brivya/cli") {
    const bin = pkg.bin?.brivya;
    if (bin !== "./dist/src/bin.js") {
      errors.push("@brivya/cli: bin must point to ./dist/src/bin.js");
    } else if (!existsSync(join(dir, "dist/src/bin.js"))) {
      errors.push("@brivya/cli: compiled CLI bin is missing");
    }
  }
}

const root = JSON.parse(readFileSync("package.json", "utf8"));
if (root.private !== true) {
  errors.push("root package must remain private");
}

const example = JSON.parse(
  readFileSync("examples/restaurant/package.json", "utf8"),
);
if (example.private !== true) {
  errors.push("@brivya/example-restaurant must remain private for alpha");
}

if (errors.length > 0) {
  console.error("Release verification failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log(
  `Release verification passed for ${packagePaths.length} public packages at ${releaseVersion}.`,
);
