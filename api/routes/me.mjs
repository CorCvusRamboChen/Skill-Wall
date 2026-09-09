// The caller's own name card. Everything here needs a wall session.
import { Hono } from "hono";
import { q } from "../db.mjs";
import { requireUser } from "../auth.mjs";
import { str, tags, oneOf, bool, url, slugify, works } from "../validate.mjs";

export const TEMPLATES = ["cv", "gallery", "dev"];
const me = new Hono();

async function loadProfile(userId) {
  const { rows } = await q(`select * from profiles where user_id = $1`, [userId]);
  return rows[0] || null;
}

me.get("/", async (c) => {
  const user = requireUser(c);
  return c.json({ user, profile: await loadProfile(user.id) });
});

// Create-or-replace the name card. Slug is minted once from the display name
// and kept stable afterwards, so shared links do not break on a rename.
me.put("/profile", async (c) => {
  const user = requireUser(c);
  const b = await c.req.json().catch(() => ({}));
  const displayName = str(b.displayName, "displayName", { max: 40 });
  const program = str(b.program, "program", { max: 80 });
  const pitch = str(b.pitch, "pitch", { max: 200 });
  const skillTags = tags(b.tags);
  const openToTeam = bool(b.openToTeam, "openToTeam", false);
  const openToFriends = bool(b.openToFriends, "openToFriends", true);
  const template = oneOf(b.template, "template", TEMPLATES);
  const siteUrl = url(b.siteUrl, "siteUrl");
  const links = Array.isArray(b.links) ? b.links.slice(0, 6).map((l) => ({ label: str(l?.label, "links.label", { max: 24, required: true }), url: url(l?.url, "links.url") })) : [];
  // `content` is the template payload. Only known keys survive, each validated,
  // so a card can never carry arbitrary JSON to the renderer.
  const raw = b.content && typeof b.content === "object" && !Array.isArray(b.content) ? b.content : {};
  const content = {
    about: str(raw.about, "content.about", { max: 600 }),
    works: works(raw.works, "content.works")
  };
  const published = bool(b.published, "published", true);

  if (displayName) await q(`update users set display_name = $2 where id = $1`, [user.id, displayName]);

  const existing = await loadProfile(user.id);
  let slug = existing?.slug || null;
  if (!slug) {
    const base = slugify(displayName || user.display_name || user.subject.slice(0, 8)) || user.subject.slice(0, 8);
    slug = base;
    for (let i = 2; ; i += 1) {
      const { rowCount } = await q(`select 1 from profiles where slug = $1`, [slug]);
      if (!rowCount) break;
      slug = `${base}-${i}`;
    }
  }

  const { rows } = await q(
    `insert into profiles (user_id, slug, program, pitch, tags, open_to_team, open_to_friends, template, site_url, links, content, published)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     on conflict (user_id) do update set
       program = excluded.program, pitch = excluded.pitch, tags = excluded.tags,
       open_to_team = excluded.open_to_team, open_to_friends = excluded.open_to_friends,
       template = excluded.template, site_url = excluded.site_url, links = excluded.links,
       content = excluded.content, published = excluded.published, updated_at = now()
     returning *`,
    [user.id, slug, program, pitch, skillTags, openToTeam, openToFriends, template, siteUrl, JSON.stringify(links), JSON.stringify(content), published]
  );
  return c.json({ profile: rows[0] });
});

// Posts I own (every stage, closed included) — for the 管理 view.
me.get("/posts", async (c) => {
  const user = requireUser(c);
  const { rows } = await q(
    `select t.*, u.display_name as owner_name,
       coalesce((select json_agg(json_build_object('id', r.id, 'name', r.name, 'needed', r.needed, 'filled', r.filled) order by r.position)
                 from team_roles r where r.post_id = t.id), '[]'::json) as roles,
       (select count(*)::int from team_applications a where a.post_id = t.id and a.status = 'pending') as pending_count
     from team_posts t join users u on u.id = t.owner_id
     where t.owner_id = $1 order by t.updated_at desc`,
    [user.id]
  );
  return c.json({ items: rows });
});

// Applications I sent, with the post they belong to.
me.get("/applications", async (c) => {
  const user = requireUser(c);
  const { rows } = await q(
    `select a.id, a.post_id, a.role_id, a.status, a.message, a.created_at, a.updated_at,
       t.title as post_title, t.stage as post_stage, r.name as role_name,
       u.display_name as owner_name
     from team_applications a
     join team_posts t on t.id = a.post_id
     join users u on u.id = t.owner_id
     left join team_roles r on r.id = a.role_id
     where a.applicant_id = $1 order by a.updated_at desc`,
    [user.id]
  );
  return c.json({ items: rows });
});

me.delete("/profile", async (c) => {
  const user = requireUser(c);
  await q(`delete from profiles where user_id = $1`, [user.id]);
  return c.json({ ok: true });
});

export default me;
