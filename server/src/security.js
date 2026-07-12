import crypto from "node:crypto";

const PASSWORD_SALT = "devtrack-demo-salt";

export function hashPassword(password) {
  return crypto
    .createHash("sha256")
    .update(`${PASSWORD_SALT}:${password}`)
    .digest("hex");
}

export function verifyPassword(password, expectedHash) {
  const actual = Buffer.from(hashPassword(password), "hex");
  const expected = Buffer.from(expectedHash, "hex");

  if (actual.length !== expected.length) {
    return false;
  }

  return crypto.timingSafeEqual(actual, expected);
}

export function createSessionToken() {
  return crypto.randomBytes(32).toString("hex");
}
