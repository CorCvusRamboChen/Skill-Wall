import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { config } from "./config.mjs";
import { authMiddleware } from "./auth.mjs";
import { q } from "./db.mjs";
import me from "./routes/me.mjs";
import profiles from "./routes/profiles.mjs";
import posts from "./routes/posts.mjs";
import uploads from "./routes/uploads.mjs";

export function createApp() {
  const app = new Hono();

  app.get("/health", async (c) => {
    await q("select 1");
    return c.json({ ok: true });
  });

  if (config.corsOrigins.length) {
    app.use("*", cors({ origin: config.corsOrigins, allowHeaders: ["Authorization", "Content-Type", "X-Wall-School"] }));
  }
  app.use("*", authMiddleware());

  app.route("/me", me);
  app.route("/profiles", profiles);
  app.route("/posts", posts);
  app.route("/uploads", uploads);

  app.notFound((c) => c.json({ error: "not_found" }, 404));
  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    // Postgres unique/foreign-key violations are client mistakes, not crashes.
    if (err.code === "23505") return c.json({ error: "duplicate" }, 409);
    if (err.code === "23503") return c.json({ error: "missing_reference" }, 400);
    if (err.code === "22P02") return c.json({ error: "bad_id" }, 400);
    console.error("unhandled:", err);
    return c.json({ error: "internal" }, 500);
  });

  return app;
}
