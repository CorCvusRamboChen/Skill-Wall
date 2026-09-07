// Wall SSO. The walls send their own Supabase session JWT as a Bearer token —
// the same way the game-squad view talks to SquadPool. We do not run accounts:
// a user IS (realm, sub) and gets a local row on first sight.
import { jwtVerify, decodeJwt, createRemoteJWKSet } from "jose";
import { HTTPException } from "hono/http-exception";
import { config, realmByIssuer } from "./config.mjs";
import { q } from "./db.mjs";

const jwksCache = new Map();

function keysFor(realm) {
  const out = [];
  if (realm.jwksUrl) {
    if (!jwksCache.has(realm.id)) jwksCache.set(realm.id, createRemoteJWKSet(new URL(realm.jwksUrl)));
    out.push(jwksCache.get(realm.id));
  }
  if (realm.secret) out.push(new TextEncoder().encode(realm.secret));
  return out;
}

export class AuthError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

// Returns { realm, payload } or throws AuthError.
export async function verifyWallToken(token) {
  let claims;
  try {
    claims = decodeJwt(token);
  } catch {
    throw new AuthError("malformed_token");
  }
  const realm = realmByIssuer(claims.iss);
  if (!realm) throw new AuthError("unknown_issuer");

  let lastErr;
  for (const key of keysFor(realm)) {
    try {
      const { payload } = await jwtVerify(token, key, { issuer: realm.issuers });
      // The anon key is also a JWT signed by the same secret; it has role=anon and
      // no sub. Only a logged-in session may act as a person.
      if (payload.role !== "authenticated" || !payload.sub) throw new AuthError("not_a_session");
      return { realm, payload };
    } catch (e) {
      lastErr = e;
      if (e instanceof AuthError) throw e;
    }
  }
  throw new AuthError(lastErr?.code === "ERR_JWT_EXPIRED" ? "token_expired" : "bad_signature");
}

function pickSchool(realm, header) {
  const s = String(header || "").trim().toLowerCase();
  return realm.schools.includes(s) ? s : realm.schools[0];
}

function displayNameFrom(payload) {
  const m = payload.user_metadata || {};
  return m.display_name || m.full_name || m.name || m.user_name || (payload.email ? payload.email.split("@")[0] : null);
}

export async function upsertUser(realm, payload, schoolHeader) {
  const { rows } = await q(
    `insert into users (realm, subject, school, email, display_name, avatar_url)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (realm, subject) do update set
       school = coalesce(excluded.school, users.school),
       email = coalesce(excluded.email, users.email),
       display_name = coalesce(users.display_name, excluded.display_name),
       avatar_url = coalesce(excluded.avatar_url, users.avatar_url),
       last_seen_at = now()
     returning *`,
    [realm.id, payload.sub, pickSchool(realm, schoolHeader), payload.email || null, displayNameFrom(payload), payload.user_metadata?.avatar_url || null]
  );
  return rows[0];
}

// Optional auth on every route: no header → anonymous; a bad header → 401.
export function authMiddleware() {
  return async (c, next) => {
    const h = c.req.header("authorization") || "";
    if (!h.startsWith("Bearer ")) {
      c.set("user", null);
      return next();
    }
    try {
      const { realm, payload } = await verifyWallToken(h.slice(7).trim());
      c.set("user", await upsertUser(realm, payload, c.req.header("x-wall-school")));
    } catch (e) {
      if (e instanceof AuthError) return c.json({ error: e.code }, 401);
      throw e;
    }
    await next();
  };
}

export function requireUser(c) {
  const u = c.get("user");
  if (!u) throw new HTTPException(401, { message: "login_required" });
  return u;
}
