// Team-up posts — the 组队 tab. A post lists the roles it still needs; people
// apply for a role; the owner accepts or rejects, and accepting fills a seat.
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { q, tx } from "../db.mjs";
import { requireUser } from "../auth.mjs";
import { str, tags, oneOf, int, bad, url } from "../validate.mjs";

export const STAGES = ["idea", "recruiting", "active", "closed"];
const MAX_OPEN_POSTS = 10;
const posts = new Hono();

// The caller's own application on each post (null when anonymous) so the
// card can say 已申请 / 已接受 instead of offering 申请加入 again.
function myStatusSql(user, params) {
  if (!user) return "null::text as my_status";
  params.push(user.id);
  return `(select a.status from team_applications a where a.post_id = t.id and a.applicant_id = $${params.length}) as my_status`;
}

const POST = `
  t.id, t.title, t.stage, t.commitment, t.description, t.tags, t.cover_url, t.created_at, t.updated_at,
  t.owner_id, u.display_name as owner_name, u.avatar_url as owner_avatar, u.school as owner_school,
  coalesce((select json_agg(json_build_object('id', r.id, 'name', r.name, 'needed', r.needed, 'filled', r.filled) order by r.position)
            from team_roles r where r.post_id = t.id), '[]'::json) as roles`;

function parseRoles(v) {
  if (!Array.isArray(v) || !v.length) bad("roles", "at least one role");
  if (v.length > 8) bad("roles", "max 8");
  return v.map((r, i) => ({
    name: str(r?.name, `roles[${i}].name`, { max: 30, required: true }),
    needed: int(r?.needed, `roles[${i}].needed`, { min: 1, max: 20, fallback: 1 }),
    filled: int(r?.filled, `roles[${i}].filled`, { min: 0, max: 20, fallback: 0 })
  }));
}

posts.get("/", async (c) => {
  const stage = oneOf(c.req.query("stage"), "stage", STAGES);
  const tag = str(c.req.query("tag"), "tag", { max: 24 });
  const search = str(c.req.query("q"), "q", { max: 60 });
  const limit = int(c.req.query("limit"), "limit", { min: 1, max: 100, fallback: 30 });
  const offset = int(c.req.query("offset"), "offset", { min: 0, max: 10_000, fallback: 0 });

  const where = stage ? [`t.stage = $1`] : [`t.stage <> 'closed'`];
  const params = stage ? [stage] : [];
  if (tag) { params.push(tag); where.push(`$${params.length} = any(t.tags)`); }
  if (search) { params.push(`%${search}%`); where.push(`(t.title ilike $${params.length} or t.description ilike $${params.length})`); }
  const mine = myStatusSql(c.get("user"), params);
  params.push(limit, offset);
  const { rows } = await q(
    `select ${POST}, ${mine} from team_posts t join users u on u.id = t.owner_id
     where ${where.join(" and ")}
     order by t.updated_at desc limit $${params.length - 1} offset $${params.length}`,
    params
  );
  return c.json({ items: rows, limit, offset });
});

posts.post("/", async (c) => {
  const user = requireUser(c);
  const b = await c.req.json().catch(() => ({}));
  const title = str(b.title, "title", { max: 60, min: 2, required: true });
  const stage = oneOf(b.stage, "stage", STAGES.filter((s) => s !== "closed")) || "recruiting";
  const commitment = str(b.commitment, "commitment", { max: 60 });
  const description = str(b.description, "description", { max: 1000 });
  const postTags = tags(b.tags);
  const coverUrl = url(b.coverUrl, "coverUrl");
  const roles = parseRoles(b.roles);
  const { rows: open } = await q(`select count(*)::int as n from team_posts where owner_id = $1 and stage <> 'closed'`, [user.id]);
  if (open[0].n >= MAX_OPEN_POSTS) throw new HTTPException(429, { message: "too_many_open_posts" });

  const id = await tx(async (db) => {
    const { rows } = await db.query(
      `insert into team_posts (owner_id, title, stage, commitment, description, tags, cover_url)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
      [user.id, title, stage, commitment, description, postTags, coverUrl]
    );
    for (const [i, r] of roles.entries()) {
      await db.query(`insert into team_roles (post_id, position, name, needed, filled) values ($1, $2, $3, $4, $5)`, [rows[0].id, i, r.name, r.needed, r.filled]);
    }
    return rows[0].id;
  });
  return c.json(await loadPost(id), 201);
});

async function loadPost(id, user = null) {
  const params = [id];
  const mine = myStatusSql(user, params);
  const { rows } = await q(`select ${POST}, ${mine} from team_posts t join users u on u.id = t.owner_id where t.id = $1`, params);
  if (!rows[0]) throw new HTTPException(404, { message: "not_found" });
  return rows[0];
}

posts.get("/:id", async (c) => c.json(await loadPost(c.req.param("id"), c.get("user"))));

posts.delete("/:id", async (c) => {
  const user = requireUser(c);
  const post = await loadPost(c.req.param("id"));
  if (post.owner_id !== user.id) throw new HTTPException(403, { message: "not_owner" });
  await q(`delete from team_posts where id = $1`, [post.id]); // roles + applications cascade
  return c.json({ ok: true });
});

// Withdraw my application. An accepted seat goes back to the pool.
posts.delete("/:id/apply", async (c) => {
  const user = requireUser(c);
  const post = await loadPost(c.req.param("id"));
  await tx(async (db) => {
    const { rows } = await db.query(`delete from team_applications where post_id = $1 and applicant_id = $2 returning role_id, status`, [post.id, user.id]);
    if (!rows[0]) throw new HTTPException(404, { message: "not_found" });
    if (rows[0].status === "accepted") await db.query(`update team_roles set filled = greatest(filled - 1, 0) where id = $1`, [rows[0].role_id]);
  });
  return c.json({ ok: true });
});

posts.patch("/:id", async (c) => {
  const user = requireUser(c);
  const post = await loadPost(c.req.param("id"));
  if (post.owner_id !== user.id) throw new HTTPException(403, { message: "not_owner" });
  const b = await c.req.json().catch(() => ({}));
  const title = str(b.title, "title", { max: 60, min: 2 }) ?? post.title;
  const stage = oneOf(b.stage, "stage", STAGES) ?? post.stage;
  const commitment = b.commitment === undefined ? post.commitment : str(b.commitment, "commitment", { max: 60 });
  const description = b.description === undefined ? post.description : str(b.description, "description", { max: 1000 });
  const postTags = b.tags === undefined ? post.tags : tags(b.tags);
  const coverUrl = b.coverUrl === undefined ? post.cover_url : url(b.coverUrl, "coverUrl");
  await q(`update team_posts set title=$2, stage=$3, commitment=$4, description=$5, tags=$6, cover_url=$7, updated_at=now() where id=$1`, [post.id, title, stage, commitment, description, postTags, coverUrl]);
  return c.json(await loadPost(post.id));
});

posts.post("/:id/apply", async (c) => {
  const user = requireUser(c);
  const post = await loadPost(c.req.param("id"));
  if (post.owner_id === user.id) throw new HTTPException(400, { message: "own_post" });
  if (post.stage === "closed") throw new HTTPException(400, { message: "closed" });
  const b = await c.req.json().catch(() => ({}));
  const roleId = str(b.roleId, "roleId", { max: 40, required: true });
  const message = str(b.message, "message", { max: 300 });
  const role = post.roles.find((r) => r.id === roleId);
  if (!role) bad("roleId", "no such role on this post");
  if (role.filled >= role.needed) throw new HTTPException(400, { message: "role_full" });
  const { rows } = await q(
    `insert into team_applications (post_id, role_id, applicant_id, message)
     values ($1, $2, $3, $4)
     on conflict (post_id, applicant_id) do update set role_id = excluded.role_id, message = excluded.message, status = 'pending', updated_at = now()
     returning *`,
    [post.id, roleId, user.id, message]
  );
  return c.json({ application: rows[0] }, 201);
});

// Owner's inbox for one post.
posts.get("/:id/applications", async (c) => {
  const user = requireUser(c);
  const post = await loadPost(c.req.param("id"));
  if (post.owner_id !== user.id) throw new HTTPException(403, { message: "not_owner" });
  const { rows } = await q(
    `select a.*, u.display_name, u.avatar_url, u.school, p.slug as applicant_slug
     from team_applications a join users u on u.id = a.applicant_id
     left join profiles p on p.user_id = a.applicant_id
     where a.post_id = $1 order by a.created_at`,
    [post.id]
  );
  return c.json({ items: rows });
});

posts.patch("/:id/applications/:appId", async (c) => {
  const user = requireUser(c);
  const post = await loadPost(c.req.param("id"));
  if (post.owner_id !== user.id) throw new HTTPException(403, { message: "not_owner" });
  const b = await c.req.json().catch(() => ({}));
  const status = oneOf(b.status, "status", ["accepted", "rejected"], { required: true });
  const out = await tx(async (db) => {
    const { rows } = await db.query(`select * from team_applications where id = $1 and post_id = $2 for update`, [c.req.param("appId"), post.id]);
    const app = rows[0];
    if (!app) throw new HTTPException(404, { message: "not_found" });
    if (app.status === status) return app;
    // Seats move with the decision: accept takes one, un-accepting gives it back.
    if (status === "accepted") {
      const r = await db.query(`update team_roles set filled = filled + 1 where id = $1 and filled < needed returning id`, [app.role_id]);
      if (!r.rowCount) throw new HTTPException(400, { message: "role_full" });
    } else if (app.status === "accepted") {
      await db.query(`update team_roles set filled = greatest(filled - 1, 0) where id = $1`, [app.role_id]);
    }
    const upd = await db.query(`update team_applications set status = $2, updated_at = now() where id = $1 returning *`, [app.id, status]);
    return upd.rows[0];
  });
  return c.json({ application: out });
});

export default posts;
