import {
  existsSync,
  readFileSync,
  watch,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";

import { workbuddyProfile } from "@brivya/adapter-workbuddy";
import { wechatAiProfile } from "@brivya/adapter-wechat-ai";
import {
  validateDistributionProfile,
  type DistributionProfile,
} from "@brivya/distribution";

import {
  ManifestParseError,
  ManifestValidationError,
  loadBusinessAgentManifest,
  type BusinessAgentManifest,
} from "@brivya/manifest";

export interface CliIo {
  stdout(message: string): void;
  stderr(message: string): void;
}

export interface CliContext {
  cwd?: string;
  io?: CliIo;
}

const DEFAULT_MANIFEST = "business.agent.yaml";

const DEFAULT_IO: CliIo = {
  stdout: (message) => process.stdout.write(`${message}\n`),
  stderr: (message) => process.stderr.write(`${message}\n`),
};

export async function runCli(
  args: readonly string[],
  context: CliContext = {},
): Promise<number> {
  const cwd = context.cwd ?? process.cwd();
  const io = context.io ?? DEFAULT_IO;
  const [command, ...rest] = args;

  try {
    switch (command) {
      case "init":
        return runInit(rest, cwd, io);
      case "validate":
        return runValidate(rest, cwd, io);
      case "inspect":
        return runInspect(rest, cwd, io);
      case "dev":
        return runDev(rest, cwd, io);
      case "target":
        return runTarget(rest, io);
      case "help":
      case "--help":
      case "-h":
      case undefined:
        io.stdout(helpText());
        return 0;
      default:
        io.stderr(`Unknown command: ${command}`);
        io.stderr(helpText());
        return 2;
    }
  } catch (error) {
    renderError(error, io);
    return 1;
  }
}


const BUILTIN_TARGETS: readonly DistributionProfile[] = [
  workbuddyProfile,
  wechatAiProfile,
];

function runTarget(
  args: readonly string[],
  io: CliIo,
): number {
  const [subcommand, targetId] = args;

  switch (subcommand) {
    case "list":
      io.stdout(
        JSON.stringify(
          BUILTIN_TARGETS.map((profile) => ({
            id: profile.metadata.id,
            name: profile.metadata.displayName,
            version: profile.metadata.version,
            category: profile.target.category,
            renderer: profile.experience.renderer,
            support: profile.support,
          })),
          null,
          2,
        ),
      );
      return 0;

    case "inspect": {
      if (!targetId) {
        throw new Error("Usage: brivya target inspect <target>");
      }
      const profile = resolveTarget(targetId);
      io.stdout(JSON.stringify(profile, null, 2));
      return 0;
    }

    case "validate": {
      if (!targetId) {
        throw new Error("Usage: brivya target validate <target>");
      }
      const profile = resolveTarget(targetId);
      const result = validateDistributionProfile(profile);
      io.stdout(JSON.stringify(result, null, 2));
      return result.status === "fail" ? 1 : 0;
    }

    case "publish":
      throw new Error(
        "Target publishing is not enabled in the Phase 1 local CLI baseline. Publication requires an explicit authorization workflow.",
      );

    default:
      throw new Error(
        "Usage: brivya target <list|inspect|validate> [target]",
      );
  }
}

function resolveTarget(targetId: string): DistributionProfile {
  const profile = BUILTIN_TARGETS.find(
    (candidate) => candidate.metadata.id === targetId,
  );
  if (!profile) {
    throw new Error(`Unknown distribution target: ${targetId}`);
  }
  return profile;
}

function runInit(
  args: readonly string[],
  cwd: string,
  io: CliIo,
): number {
  const force = args.includes("--force");
  const pathArg = firstPositional(args);
  const manifestPath = resolve(cwd, pathArg ?? DEFAULT_MANIFEST);

  if (existsSync(manifestPath) && !force) {
    throw new Error(
      `${manifestPath} already exists. Re-run with --force to replace it.`,
    );
  }

  writeFileSync(manifestPath, starterManifest(), "utf8");
  io.stdout(`Created ${manifestPath}`);
  return 0;
}

function runValidate(
  args: readonly string[],
  cwd: string,
  io: CliIo,
): number {
  const manifestPath = resolve(
    cwd,
    firstPositional(args) ?? DEFAULT_MANIFEST,
  );
  const manifest = loadManifestFile(manifestPath);
  io.stdout(
    `Valid Business Agent Manifest: ${manifest.metadata.id}@${manifest.metadata.version}`,
  );
  return 0;
}

function runInspect(
  args: readonly string[],
  cwd: string,
  io: CliIo,
): number {
  const manifestPath = resolve(
    cwd,
    firstPositional(args) ?? DEFAULT_MANIFEST,
  );
  const manifest = loadManifestFile(manifestPath);
  io.stdout(JSON.stringify(inspectManifest(manifest), null, 2));
  return 0;
}

function runDev(
  args: readonly string[],
  cwd: string,
  io: CliIo,
): number {
  const manifestPath = resolve(
    cwd,
    firstPositional(args) ?? DEFAULT_MANIFEST,
  );

  renderDevSnapshot(manifestPath, io);

  if (args.includes("--watch")) {
    io.stdout("Watching manifest for changes. Runtime execution remains owned by your application BusinessRuntime.");
    watch(manifestPath, { persistent: true }, () => {
      try {
        renderDevSnapshot(manifestPath, io);
      } catch (error) {
        renderError(error, io);
      }
    });
  }

  return 0;
}

function renderDevSnapshot(
  manifestPath: string,
  io: CliIo,
): void {
  const manifest = loadManifestFile(manifestPath);
  const enabledProtocols = Object.entries(manifest.protocols ?? {})
    .filter(([, config]) => config?.enabled)
    .map(([name, config]) => ({
      name,
      path: config?.endpoint ?? config?.basePath ?? null,
    }));

  io.stdout(
    JSON.stringify(
      {
        status: "ready",
        manifest: {
          path: manifestPath,
          id: manifest.metadata.id,
          version: manifest.metadata.version,
        },
        capabilities: manifest.capabilities,
        protocols: enabledProtocols,
        runtime: manifest.runtime ?? null,
        note:
          "CLI dev mode validates and observes local configuration only; capability execution uses the canonical BusinessRuntime.",
      },
      null,
      2,
    ),
  );
}

function loadManifestFile(path: string): BusinessAgentManifest {
  if (!existsSync(path)) {
    throw new Error(`Manifest not found: ${path}`);
  }
  return loadBusinessAgentManifest(readFileSync(path, "utf8"));
}

function inspectManifest(manifest: BusinessAgentManifest): unknown {
  return {
    apiVersion: manifest.apiVersion,
    kind: manifest.kind,
    business: {
      id: manifest.metadata.id,
      name: manifest.metadata.name,
      version: manifest.metadata.version,
      canonicalUrl: manifest.identity.canonicalUrl,
      domains: manifest.identity.domains,
    },
    discovery: manifest.discovery,
    capabilities: manifest.capabilities,
    protocols: manifest.protocols ?? {},
    security: {
      defaultAuth: manifest.security.defaultAuth,
      audit: manifest.security.audit,
      scopes: manifest.security.scopes ?? {},
    },
    connectors: (manifest.connectors ?? []).map((connector) => ({
      id: connector.id,
      type: connector.type,
      credentialRef: connector.credentialRef,
    })),
    runtime: manifest.runtime ?? null,
  };
}

function firstPositional(args: readonly string[]): string | undefined {
  return args.find((arg) => !arg.startsWith("-"));
}

function renderError(error: unknown, io: CliIo): void {
  if (error instanceof ManifestValidationError) {
    io.stderr(error.message);
    for (const issue of error.issues) {
      io.stderr(`- [${issue.code}] ${issue.path}: ${issue.message}`);
    }
    return;
  }

  if (error instanceof ManifestParseError || error instanceof Error) {
    io.stderr(error.message);
    return;
  }

  io.stderr(String(error));
}

function starterManifest(): string {
  return `apiVersion: brivya.dev/v0alpha1
kind: BusinessAgent
metadata:
  id: example-business
  name: Example Business
  version: 0.1.0
identity:
  canonicalUrl: https://example.com
  domains:
    - example.com
discovery:
  public: false
  locales:
    - en
capabilities: []
security:
  defaultAuth: none
  audit: required
runtime:
  mode: stateless
`;
}

function helpText(): string {
  return `Brivya CLI

Usage:
  brivya init [path] [--force]
  brivya validate [path]
  brivya inspect [path]
  brivya dev [path] [--watch]
  brivya target list
  brivya target inspect <target>
  brivya target validate <target>

Commands:
  init      Create a starter Business Agent Manifest.
  validate  Parse and validate a manifest using @brivya/manifest.
  inspect   Print a normalized, non-secret manifest summary.
  dev       Validate local developer configuration; optionally watch for changes.
  target    Inspect and validate built-in Distribution Profiles.

The CLI does not implement alternate authorization, policy, approval, connector,
transaction, or runtime semantics. Target publish is intentionally unavailable
until an explicit publication authorization workflow is implemented.`;
}
