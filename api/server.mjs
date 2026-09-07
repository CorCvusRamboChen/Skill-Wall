import { serve } from "@hono/node-server";
import { createApp } from "./app.mjs";
import { config } from "./config.mjs";
import { pool } from "./db.mjs";

const app = createApp();
const server = serve({ fetch: app.fetch, port: config.port, hostname: "0.0.0.0" }, (info) => {
  console.log(`skill-wall api on :${info.port} — realms: ${config.realms.map((r) => r.id).join(", ")}`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    server.close(() => pool.end().finally(() => process.exit(0)));
  });
}
