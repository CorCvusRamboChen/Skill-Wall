// Public name cards — the 找人 tab. Only published cards are listed.
import { Hono } from "hono";
import { q } from "../db.mjs";
import { str, int } from "../validate.mjs";

const profiles = new Hono();

const CARD = `
  p.user_id, p.slug, p.program, p.pitch, p.tags, p.open_to_team, p.open_to_friends,
  p.template, p.site_url, p.links, p.updated_at,
  u.display_name, u.avatar_url, u.school, u.realm`;

profiles.get("/", async (c) => {
  const tag = str(c.req.query("tag"), "tag", { max: 24 });
  const school = str(c.req.query("school"), "school", { max: 24 });
  const open = c.req.query("open") === "1";
  const search = str(c.req.query("q"), "q", { max: 60 });
  const limit = int(c.req.query("limit"), "limit", { min: 1, max: 100, fallback: 48 });
  const offset = int(c.req.query("offset"), "offset", { min: 0, max: 10_000, fallback: 0 });

  const where = ["p.published"];
  const params = [];
  if (tag) { params.push(tag); where.push(`$${params.length} = any(p.tags)`); }
  if (school) { params.push(school); where.push(`u.school = $${params.length}`); }
  if (open) where.push("p.open_to_team");
  if (search) {
    params.push(`%${search}%`);
    where.push(`(u.display_name ilike $${params.length} or p.program ilike $${params.length} or p.pitch ilike $${params.length} or array_to_string(p.tags, ' ') ilike $${params.length})`);
  }
  params.push(limit, offset);
  const { rows } = await q(
    `select ${CARD} from profiles p join users u on u.id = p.user_id
     where ${where.join(" and ")}
     order by p.updated_at desc
     limit $${params.length - 1} offset $${params.length}`,
    params
  );
  return c.json({ items: rows, limit, offset });
});

// Tag cloud for the filter strip: every tag in use, most common first.
profiles.get("/tags", async (c) => {
  const { rows } = await q(
    `select t as tag, count(*)::int as n from profiles p, unnest(p.tags) t
     where p.published group by t order by n desc, t limit 60`
  );
  return c.json({ items: rows });
});

profiles.get("/:slug", async (c) => {
  const { rows } = await q(
    `select ${CARD}, p.content from profiles p join users u on u.id = p.user_id
     where p.slug = $1 and p.published`,
    [c.req.param("slug")]
  );
  if (!rows[0]) return c.json({ error: "not_found" }, 404);
  return c.json({ profile: rows[0] });
});

export default profiles;
