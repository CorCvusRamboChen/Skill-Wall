// Applies db/migrations/*.sql in name order, once each, recording them in
// schema_migrations. Runs at container start (see docker-compose command) and by
// hand with `npm run migrate`. Each file is one transaction.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "db", "migrations");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
const done = new Set((await client.query(`select name from schema_migrations`)).rows.map((r) => r.name));
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

let applied = 0;
for (const f of files) {
  if (done.has(f)) continue;
  const sql = await readFile(path.join(dir, f), "utf8");
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(`insert into schema_migrations (name) values ($1)`, [f]);
    await client.query("COMMIT");
    console.log(`applied ${f}`);
    applied += 1;
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(`FAILED ${f}: ${e.message}`);
    await client.end();
    process.exit(1);
  }
}
console.log(applied ? `${applied} migration(s) applied` : "schema up to date");
await client.end();
