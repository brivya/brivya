import {
  access,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import { basename, resolve } from "node:path";

import {
  BrivyaError,
  ManifestParseError,
  ManifestValidationError,
  loadManifest,
  validateManifest,
} from "@brivya/sdk";

import {
  createDevSession,
} from "./dev.js";
import {
  inspectManifest,
} from "./inspect.js";
import {
  normalizeProjectId,
  starterDevProfile,
  starterGitignore,
  starterManifest,
} from "./templates.js";

export interface CliRunOptions {
  cwd?: string;
}

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runCli(
  argv: readonly string[],
  options: CliRunOptions = {},
): Promise<CliResult> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const command = argv[0] ?? "help";

  try {
    switch (command) {
      case "init":
        return await runInit(argv.slice(1), cwd);
      case "validate":
        return await runValidate(argv.slice(1), cwd);
      case "inspect":
        return await runInspect(argv.slice(1), cwd);
      case "dev":
        return await runDev(argv.slice(1), cwd);
      case "help":
      case "--help":
      case "-h":
        return ok(helpText());
      case "--version":
      case "-v":
        return ok("0.1.0-alpha.1\n");
      default:
        return fail(
          `Unknown command: ${command}\n\n${helpText()}`,
          2,
        );
    }
  } catch (error) {
    return fail(
      JSON.stringify(
        {
          ok: false,
          error: serializeError(error),
        },
        null,
        2,
      ) + "\n",
      1,
    );
  }
}

async function runInit(
  args: readonly string[],
  cwd: string,
): Promise<CliResult> {
  const force = args.includes("--force");
  const targetArg = firstPositional(args);
  const target = resolve(
    cwd,
    targetArg ?? ".",
  );
  const manifestPath = resolve(
    target,
    "business.agent.yaml",
  );
  const profilePath = resolve(
    target,
    "brivya.dev.json",
  );
  const gitignorePath = resolve(
    target,
    ".gitignore",
  );

  if (!force && (await exists(manifestPath))) {
    throw new BrivyaError(
      "CONFLICT",
      "business.agent.yaml already exists. Use --force to replace the starter files.",
      {
        details: {
          path: manifestPath,
        },
      },
    );
  }

  await mkdir(target, { recursive: true });

  const projectId = normalizeProjectId(
    basename(target),
  );

  await writeFile(
    manifestPath,
    starterManifest(projectId),
    "utf8",
  );
  await writeFile(
    profilePath,
    starterDevProfile(),
    "utf8",
  );

  if (!(await exists(gitignorePath))) {
    await writeFile(
      gitignorePath,
      starterGitignore,
      "utf8",
    );
  }

  return ok(
    JSON.stringify(
      {
        ok: true,
        command: "init",
        project: projectId,
        path: target,
        files: [
          "business.agent.yaml",
          "brivya.dev.json",
          ".gitignore",
        ],
        cloudRequired: false,
      },
      null,
      2,
    ) + "\n",
  );
}

async function runValidate(
  args: readonly string[],
  cwd: string,
): Promise<CliResult> {
  const manifestPath = resolveManifestPath(
    args,
    cwd,
  );
  const source = await readFile(
    manifestPath,
    "utf8",
  );
  const result = validateManifest(source);

  const body = {
    ok: result.valid,
    command: "validate",
    path: manifestPath,
    valid: result.valid,
    issues: result.issues,
  };

  return result.valid
    ? ok(JSON.stringify(body, null, 2) + "\n")
    : {
        exitCode: 1,
        stdout:
          JSON.stringify(body, null, 2) + "\n",
        stderr: "",
      };
}

async function runInspect(
  args: readonly string[],
  cwd: string,
): Promise<CliResult> {
  const manifestPath = resolveManifestPath(
    args,
    cwd,
  );
  const source = await readFile(
    manifestPath,
    "utf8",
  );
  const manifest = loadManifest(source);
  const inspection = inspectManifest(manifest);

  return ok(
    JSON.stringify(
      {
        ok: true,
        command: "inspect",
        path: manifestPath,
        ...inspection,
      },
      null,
      2,
    ) + "\n",
  );
}

async function runDev(
  args: readonly string[],
  cwd: string,
): Promise<CliResult> {
  const manifestPath = resolveManifestPath(
    args,
    cwd,
  );
  const profilePath = resolve(
    cwd,
    optionValue(args, "--profile") ??
      "brivya.dev.json",
  );

  const [manifestSource, profileSource] =
    await Promise.all([
      readFile(manifestPath, "utf8"),
      readFile(profilePath, "utf8"),
    ]);

  const session = createDevSession(
    manifestSource,
    profileSource,
  );

  return ok(
    JSON.stringify(
      {
        ok: true,
        command: "dev",
        manifestPath,
        profilePath,
        ready: true,
        ...session.descriptor,
      },
      null,
      2,
    ) + "\n",
  );
}

function resolveManifestPath(
  args: readonly string[],
  cwd: string,
): string {
  const explicit = optionValue(
    args,
    "--manifest",
  );
  if (explicit) {
    return resolve(cwd, explicit);
  }

  const positional = firstPositional(args);
  return resolve(
    cwd,
    positional ?? "business.agent.yaml",
  );
}

function optionValue(
  args: readonly string[],
  name: string,
): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) {
    return undefined;
  }

  const value = args[index + 1];
  if (
    !value ||
    value.startsWith("--")
  ) {
    throw new BrivyaError(
      "INVALID_INPUT",
      `Option ${name} requires a value.`,
    );
  }
  return value;
}

function firstPositional(
  args: readonly string[],
): string | undefined {
  const optionsWithValues = new Set([
    "--manifest",
    "--profile",
  ]);
  let skipNext = false;

  for (const arg of args) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (optionsWithValues.has(arg)) {
      skipNext = true;
      continue;
    }
    if (arg.startsWith("--")) {
      continue;
    }
    return arg;
  }
  return undefined;
}

async function exists(
  path: string,
): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

interface SerializedCliError {
  code: string;
  message: string;
  retryable: boolean;
  details: Record<string, unknown>;
}

function serializeError(
  error: unknown,
): SerializedCliError {
  if (error instanceof BrivyaError) {
    return error.toJSON();
  }

  if (error instanceof ManifestValidationError) {
    return {
      code: "INVALID_INPUT",
      message: error.message,
      retryable: false,
      details: {
        issues: error.issues,
      },
    };
  }

  if (error instanceof ManifestParseError) {
    return {
      code: "INVALID_INPUT",
      message: error.message,
      retryable: false,
      details: {
        reason: "manifest_parse_error",
      },
    };
  }

  if (error instanceof Error) {
    return {
      code: "INTERNAL_ERROR",
      message: error.message,
      retryable: false,
      details: {},
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message: "Unknown CLI failure.",
    retryable: false,
    details: {},
  };
}

function ok(stdout: string): CliResult {
  return {
    exitCode: 0,
    stdout,
    stderr: "",
  };
}

function fail(
  stderr: string,
  exitCode: number,
): CliResult {
  return {
    exitCode,
    stdout: "",
    stderr,
  };
}

function helpText(): string {
  return `Brivya CLI v0.1.0-alpha.1

Usage:
  brivya init [directory] [--force]
  brivya validate [manifest] [--manifest path]
  brivya inspect [manifest] [--manifest path]
  brivya dev [manifest] [--manifest path] [--profile path]

Commands:
  init      Create a secret-free local Brivya starter project.
  validate  Validate business.agent.yaml.
  inspect   Inspect public manifest posture without exposing secret references.
  dev       Bootstrap the canonical BusinessRuntime from local development fixtures.

Brivya CLI is local-first and does not require Brivya Cloud.
`;
}
