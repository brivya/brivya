import assert from "node:assert/strict";
import test from "node:test";

import * as Manifest from "@brivya/manifest";
import { BusinessRuntime, CapabilityRegistry } from "@brivya/runtime";

import * as sdk from "../src/index.js";

test("SDK exposes canonical manifest functions without reimplementing them", () => {
  assert.equal(
    sdk.loadBusinessAgentManifest,
    Manifest.loadBusinessAgentManifest,
  );
  assert.equal(
    sdk.validateBusinessAgentManifest,
    Manifest.validateBusinessAgentManifest,
  );
});

test("SDK exposes the canonical runtime classes", () => {
  assert.equal(sdk.BusinessRuntime, BusinessRuntime);
  assert.equal(sdk.CapabilityRegistry, CapabilityRegistry);
  assert.equal(sdk.runtime.BusinessRuntime, BusinessRuntime);
});
