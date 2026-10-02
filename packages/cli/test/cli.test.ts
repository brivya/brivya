import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runCli } from "../src/run.js";

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: (message: string) => stdout.push(message),
      stderr: (message: string) => stderr.push(message),
    },
  };
}

test("init creates a manifest accepted by validate", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "brivya-cli-"));
  const output = capture();

  assert.equal(await runCli(["init"], { cwd, io: output.io }), 0);
  assert.match(
    readFileSync(join(cwd, "business.agent.yaml"), "utf8"),
    /apiVersion: brivya\.dev\/v0alpha1/,
  );

  assert.equal(
    await runCli(["validate"], { cwd, io: output.io }),
    0,
  );
  assert.match(output.stdout.at(-1) ?? "", /example-business@0\.1\.0/);
});

test("inspect and dev read the same validated manifest contract", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "brivya-cli-"));
  const output = capture();
  await runCli(["init"], { cwd, io: output.io });

  assert.equal(
    await runCli(["inspect"], { cwd, io: output.io }),
    0,
  );
  const inspected = JSON.parse(output.stdout.at(-1) ?? "{}");
  assert.equal(inspected.business.id, "example-business");

  assert.equal(
    await runCli(["dev"], { cwd, io: output.io }),
    0,
  );
  const dev = JSON.parse(output.stdout.at(-1) ?? "{}");
  assert.equal(dev.status, "ready");
  assert.match(dev.note, /canonical BusinessRuntime/);
});

test("validate fails closed on invalid manifests", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "brivya-cli-"));
  const output = capture();

  writeFileSync(
    join(cwd, "business.agent.yaml"),
    "apiVersion: brivya.dev/v0alpha1\nkind: BusinessAgent\n",
    "utf8",
  );

  assert.equal(
    await runCli(["validate"], { cwd, io: output.io }),
    1,
  );
  assert.ok(output.stderr.some((line) => line.includes("validation failed")));
});
