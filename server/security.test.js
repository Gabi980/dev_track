import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "./src/security.js";

test("password hashing verifies the original password only", () => {
  const hash = hashPassword("admin123");

  assert.equal(verifyPassword("admin123", hash), true);
  assert.equal(verifyPassword("wrong-password", hash), false);
});
