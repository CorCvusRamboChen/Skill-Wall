// Realm matching + signature checks, no database needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SignJWT } from "jose";

process.env.DATABASE_URL ||= "postgres://x:y@localhost/z";
process.env.REALMS = JSON.stringify([
  { id: "alpha", issuers: ["https://alpha.example/auth/v1"], secret: "alpha-secret-alpha-secret-alpha-secret" },
  { id: "beta", issuers: ["https://beta.example/auth/v1", "https://beta-backup.example/auth/v1"], secret: "beta-secret-beta-secret-beta-secret-beta", schools: ["b1", "b2"] }
]);
const { verifyWallToken, AuthError } = await import("../api/auth.mjs");

async function mint({ iss, secret, role = "authenticated", sub = "u1", exp = "1h" }) {
  const j = new SignJWT({ role }).setProtectedHeader({ alg: "HS256" }).setIssuer(iss).setIssuedAt().setExpirationTime(exp);
  if (sub) j.setSubject(sub);
  return j.sign(new TextEncoder().encode(secret));
}

test("accepts a session from a known issuer", async () => {
  const t = await mint({ iss: "https://alpha.example/auth/v1", secret: "alpha-secret-alpha-secret-alpha-secret" });
  const { realm, payload } = await verifyWallToken(t);
  assert.equal(realm.id, "alpha");
  assert.equal(payload.sub, "u1");
});

test("a realm may have several issuers (primary + backup host)", async () => {
  const t = await mint({ iss: "https://beta-backup.example/auth/v1", secret: "beta-secret-beta-secret-beta-secret-beta" });
  assert.equal((await verifyWallToken(t)).realm.id, "beta");
});

test("rejects unknown issuer", async () => {
  const t = await mint({ iss: "https://nope.example/auth/v1", secret: "alpha-secret-alpha-secret-alpha-secret" });
  await assert.rejects(verifyWallToken(t), (e) => e instanceof AuthError && e.code === "unknown_issuer");
});

test("rejects a token signed with another realm's secret", async () => {
  const t = await mint({ iss: "https://alpha.example/auth/v1", secret: "beta-secret-beta-secret-beta-secret-beta" });
  await assert.rejects(verifyWallToken(t), (e) => e.code === "bad_signature");
});

test("rejects the anon key (role=anon, no sub)", async () => {
  const t = await mint({ iss: "https://alpha.example/auth/v1", secret: "alpha-secret-alpha-secret-alpha-secret", role: "anon", sub: null });
  await assert.rejects(verifyWallToken(t), (e) => e.code === "not_a_session");
});

test("rejects expired", async () => {
  const t = await mint({ iss: "https://alpha.example/auth/v1", secret: "alpha-secret-alpha-secret-alpha-secret", exp: "-1s" });
  await assert.rejects(verifyWallToken(t), (e) => e.code === "token_expired");
});
