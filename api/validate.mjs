// Tiny input helpers. Every write route runs its body through these so bad
// input turns into a 400 with a field name, never a 500 from Postgres.
import { HTTPException } from "hono/http-exception";

export function bad(field, why) {
  throw new HTTPException(400, { message: `${field}: ${why}` });
}

export function str(v, field, { max = 200, min = 0, required = false } = {}) {
  if (v == null || v === "") {
    if (required) bad(field, "required");
    return null;
  }
  if (typeof v !== "string") bad(field, "must be a string");
  const s = v.trim();
  if (s.length < min) bad(field, `min ${min} chars`);
  if (s.length > max) bad(field, `max ${max} chars`);
  return s;
}

export function tags(v, field = "tags", { max = 5 } = {}) {
  if (v == null) return [];
  if (!Array.isArray(v)) bad(field, "must be an array");
  const out = [...new Set(v.map((t) => String(t).trim()).filter(Boolean))];
  if (out.length > max) bad(field, `max ${max}`);
  for (const t of out) if (t.length > 24) bad(field, "each tag max 24 chars");
  return out;
}

export function oneOf(v, field, allowed, { required = false } = {}) {
  if (v == null || v === "") {
    if (required) bad(field, "required");
    return null;
  }
  if (!allowed.includes(v)) bad(field, `must be one of ${allowed.join(", ")}`);
  return v;
}

export function bool(v, field, fallback = false) {
  if (v == null) return fallback;
  if (typeof v !== "boolean") bad(field, "must be true/false");
  return v;
}

export function url(v, field) {
  const s = str(v, field, { max: 300 });
  if (!s) return null;
  let u;
  try {
    u = new URL(s.includes("://") ? s : `https://${s}`);
  } catch {
    bad(field, "not a valid URL");
  }
  if (!/^https?:$/.test(u.protocol)) bad(field, "must be http(s)");
  return u.toString();
}

export function int(v, field, { min = 0, max = 99, fallback = null } = {}) {
  if (v == null || v === "") return fallback;
  const n = Number(v);
  if (!Number.isInteger(n)) bad(field, "must be an integer");
  if (n < min || n > max) bad(field, `must be ${min}..${max}`);
  return n;
}

export function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// Portfolio works — the one content shape every template renders (cv as a
// list, gallery as an image grid, dev as repo cards). Up to 8 entries.
export function works(v, field = "works") {
  if (v == null) return [];
  if (!Array.isArray(v)) bad(field, "must be an array");
  if (v.length > 8) bad(field, "max 8");
  return v.map((w, i) => ({
    title: str(w?.title, `${field}[${i}].title`, { max: 60, min: 1, required: true }),
    description: str(w?.description, `${field}[${i}].description`, { max: 200 }),
    url: url(w?.url, `${field}[${i}].url`),
    image: url(w?.image, `${field}[${i}].image`)
  }));
}
