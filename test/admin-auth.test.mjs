import assert from "node:assert/strict";
import test from "node:test";
import { isAdminPassword } from "../lib/admin-auth.mjs";

test("rejects a missing or incorrect password for administrator actions", () => {
  assert.equal(isAdminPassword("moving-admin", null), false);
  assert.equal(isAdminPassword("moving-admin", "wrong-password"), false);
});

test("accepts the configured administrator password", () => {
  assert.equal(isAdminPassword("moving-admin", "moving-admin"), true);
});
