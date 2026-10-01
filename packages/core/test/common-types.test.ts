import assert from "node:assert/strict";
import test from "node:test";

import {
  createMoney,
  createZonedBusinessTime,
  parseAbsoluteInstant,
  parseCurrencyCode,
  parseDateOnly,
  parseDecimalString,
  type ActionRequest,
} from "../src/index.js";

test("DecimalString preserves exact decimal text", () => {
  assert.equal(parseDecimalString("12.50"), "12.50");
  assert.equal(parseDecimalString("0"), "0");
  assert.equal(parseDecimalString("-0.25"), "-0.25");

  for (const invalid of ["01.00", "1e3", "1,000.00", "$12.50", ""]) {
    assert.throws(() => parseDecimalString(invalid), TypeError);
  }
});

test("Money is decimal string plus uppercase currency", () => {
  assert.deepEqual(createMoney("48.80", "USD"), {
    amount: "48.80",
    currency: "USD",
  });
  assert.throws(() => parseCurrencyCode("usd"), TypeError);
});

test("absolute instants require RFC3339 Z or numeric offset", () => {
  assert.equal(
    parseAbsoluteInstant("2026-10-01T19:00:00+08:00"),
    "2026-10-01T19:00:00+08:00",
  );
  assert.throws(
    () => parseAbsoluteInstant("2026-10-01T19:00:00"),
    TypeError,
  );
});

test("scheduled business time preserves IANA zone and verifies offset", () => {
  assert.deepEqual(
    createZonedBusinessTime(
      "2026-10-01T19:00:00+08:00",
      "Asia/Singapore",
    ),
    {
      dateTime: "2026-10-01T19:00:00+08:00",
      timeZone: "Asia/Singapore",
    },
  );

  assert.throws(
    () =>
      createZonedBusinessTime(
        "2026-10-01T19:00:00+09:00",
        "Asia/Singapore",
      ),
    /Offset\/time-zone mismatch/,
  );
});

test("date-only validates calendar dates without implying UTC-midnight semantics", () => {
  assert.equal(parseDateOnly("2026-10-01"), "2026-10-01");
  assert.throws(() => parseDateOnly("2026-02-30"), TypeError);
});

test("actor identity and principal/delegation remain distinct fields", () => {
  const request: ActionRequest<{ guests: number }> = {
    requestId: "req_1",
    capability: "reservation.create",
    actor: { type: "agent", id: "personal-agent-123" },
    principal: { type: "user", id: "user-456" },
    delegation: { type: "oauth", scopes: ["reservation:create"] },
    input: { guests: 2 },
  };

  assert.equal(request.actor.id, "personal-agent-123");
  assert.equal(request.principal?.id, "user-456");
  assert.deepEqual(request.delegation?.scopes, ["reservation:create"]);
});
