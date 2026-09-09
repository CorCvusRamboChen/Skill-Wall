// Image uploads — covers on recruit posts and thumbnails on portfolio works.
// Bytes go to UPLOAD_DIR (a docker volume on forum-app), rows to `uploads`.
// Served back through the same proxy prefix the API lives under, so the URL
// we hand out is absolute and same-origin for the wall that uploaded it:
//   https://unimelbwall.com/skillwall/uploads/<id>.jpg
// No image processing here (no native deps in the container); the cap is on
// bytes and the type is checked by magic number, not by the client's say-so.
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { serveStatic } from "@hono/node-server/serve-static";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { q } from "../db.mjs";
import { requireUser } from "../auth.mjs";
import { config } from "../config.mjs";

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_PER_USER = 60;

const uploads = new Hono();

function sniff(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return ["jpg", "image/jpeg"];
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return ["png", "image/png"];
  if (buf.length > 6 && buf.subarray(0, 4).toString("ascii") === "GIF8") return ["gif", "image/gif"];
  if (buf.length > 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return ["webp", "image/webp"];
  return null;
}

// Absolute URL for a stored file, built from what the proxy tells us.
export function publicUrl(c, file) {
  const host = c.req.header("x-forwarded-host") || c.req.header("host") || "localhost";
  // The walls sit behind a Cloudflare Tunnel: nginx sees plain http and so
  // forwards "http" even though the visitor is on https. Cloudflare's own
  // cf-visitor header carries the real scheme; failing that, anything that is
  // not a local address is https in practice.
  const cf = c.req.header("cf-visitor") || "";
  const forwarded = c.req.header("x-forwarded-proto") || "";
  const local = /^(localhost|127\.|172\.|10\.|192\.168\.)/.test(host);
  const proto = /"scheme":"https"/.test(cf) || forwarded === "https" || !local ? "https" : "http";
  const prefix = (c.req.header("x-forwarded-prefix") || "").replace(/\/+$/, "");
  return `${proto}://${host}${prefix}/uploads/${file}`;
}

uploads.post("/", async (c) => {
  const user = requireUser(c);
  const declared = Number(c.req.header("content-length") || 0);
  if (declared > MAX_BYTES + 64 * 1024) throw new HTTPException(413, { message: "too_large" });

  const { rows: cnt } = await q(`select count(*)::int as n from uploads where owner_id = $1`, [user.id]);
  if (cnt[0].n >= MAX_PER_USER) throw new HTTPException(429, { message: "upload_quota" });

  const body = await c.req.parseBody().catch(() => ({}));
  const file = body.file;
  if (!(file instanceof File)) throw new HTTPException(400, { message: "file: required" });
  if (file.size > MAX_BYTES) throw new HTTPException(413, { message: "too_large" });
  const buf = Buffer.from(await file.arrayBuffer());
  const kind = sniff(buf);
  if (!kind) throw new HTTPException(415, { message: "not_an_image" });
  const [ext, mime] = kind;

  const id = randomUUID();
  const name = `${id}.${ext}`;
  await mkdir(config.uploadDir, { recursive: true });
  await writeFile(path.join(config.uploadDir, name), buf, { flag: "wx" });
  await q(`insert into uploads (id, owner_id, file, mime, bytes) values ($1, $2, $3, $4, $5)`, [id, user.id, name, mime, buf.length]);
  return c.json({ id, url: publicUrl(c, name), bytes: buf.length, mime }, 201);
});

// GET /uploads/<file>. Names are uuid.ext, so nothing here is guessable and
// nothing outside UPLOAD_DIR is reachable (serveStatic refuses "..").
uploads.use("/*", async (c, next) => {
  if (c.req.method !== "GET" && c.req.method !== "HEAD") return next();
  if (!/^[0-9a-f-]{36}\.(jpg|png|gif|webp)$/.test(c.req.path.split("/").pop() || "")) return next();
  c.header("Cache-Control", "public, max-age=31536000, immutable");
  return next();
});
uploads.get("/*", serveStatic({
  root: config.uploadDir,
  rewriteRequestPath: (p) => p.replace(/^\/uploads\//, "/")
}));

export default uploads;
