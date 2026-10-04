// Step 5: turn the curated selection into (a) one cover image per person and
// (b) an idempotent seed file for the skill-wall database.
//
// The cover is the screenshot of the person's homepage taken by
// capture_sites.mjs. A person with no usable shot (none taken, or
// "cover": "tile" in selection.json after review) gets a typographic tile
// instead: their name and domain, generated here.
//
//   node build_showcase.mjs   → covers/<uuid>.(jpg|png), ../../db/seed-showcase.sql, manifest.json
import { readFile, writeFile, mkdir, rm, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PUBLIC_BASE = "https://unimelbwall.com/skillwall/uploads";
// The card's one-line "program" slot: what they studied, which year, and the
// marker that this is a curated example. The marker stays in the text because
// the wall's own view has no badge for it.
const MARK = "精选校友";
const aboutTail = (shotDate) => `这张名片是技能墙整理的精选示例：资料来自维基百科等公开页面，链接是其官方个人网站${shotDate ? `，封面是该网站首页的截图（${shotDate}）` : ""}。本人并未入驻技能墙；如需更正或移除，请通过站内「意见反馈」联系我们。`;

const selection = JSON.parse(await readFile(path.join(here, "selection.json"), "utf8"));
let shots = [];
try { shots = JSON.parse(await readFile(path.join(here, "shots", "report.json"), "utf8")); } catch { /* no shots taken: tiles for everyone */ }

// Deterministic ids: re-running the seed replaces the same rows and files.
function uuidFrom(text) {
  const h = createHash("md5").update(text).digest("hex").split("");
  h[12] = "4";
  h[16] = "89ab"[parseInt(h[16], 16) % 4];
  const s = h.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}
const slugify = (s) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
const sql = (v) => (v == null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const hostOf = (u) => new URL(u).hostname.replace(/^www\./, "");

const PALETTES = [
  ["#e8eef8", "#0b1440"],
  ["#0b1440", "#f5f7fb"],
  ["#ffe95c", "#2a2600"],
  ["#f0f2f6", "#0b1440"],
];

async function tile(p, index, png) {
  const [bg, ink] = PALETTES[index % PALETTES.length];
  const words = p.name.toUpperCase().split(/\s+/);
  const lines = words.length > 1 ? [words.slice(0, -1).join(" "), words[words.length - 1]] : words;
  const html = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo+Black&family=IBM+Plex+Mono:wght@500&display=swap">
<style>
html,body{margin:0;width:960px;height:480px;overflow:hidden}
body{background:${bg};color:${ink};display:grid;grid-template-rows:1fr auto;padding:40px 48px;box-sizing:border-box}
.name{align-self:center;font-family:"Archivo Black","Arial Black",sans-serif;text-transform:uppercase;letter-spacing:-.035em;line-height:.9;font-size:150px;white-space:nowrap}
.foot{display:flex;justify-content:space-between;align-items:baseline;font-family:"IBM Plex Mono",Consolas,monospace;font-size:24px;font-weight:500}
.foot span:last-child{opacity:.65;letter-spacing:.08em}
</style>
<body><div class="name" id="n">${lines.map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;")).join("<br>")}</div>
<div class="foot"><span>${hostOf(p.site)} ↗</span><span>${(p.fieldEn || "").toUpperCase()}</span></div>
<script>
const n=document.getElementById("n");let s=150;
const fit=()=>{while((n.scrollWidth>864||n.offsetHeight>330)&&s>40){s-=4;n.style.fontSize=s+"px";}};
document.fonts.ready.then(fit);fit();
</script>`;
  const htmlPath = png.replace(/\.png$/, ".html");
  await writeFile(htmlPath, html);
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--window-size=960,480", "--virtual-time-budget=6000", `--screenshot=${png}`, pathToFileURL(htmlPath).href], { stdio: "ignore", timeout: 60000 });
  await rm(htmlPath, { force: true });
}

// covers/ holds exactly what has to be on the uploads volume, nothing stale.
const coversDir = path.join(here, "covers");
await rm(coversDir, { recursive: true, force: true });
await mkdir(coversDir, { recursive: true });

const manifest = [];
let i = 0;
for (const p of selection) {
  const slug = p.slug || slugify(p.name);
  const userId = uuidFrom("showcase-user:" + p.qid);
  const shot = p.cover === "tile" ? null : shots.find((s) => s.slug === slug && s.ok);
  let coverId, file, mime, kind, shotDate = null;
  if (shot) {
    const bytes = await readFile(path.join(here, "shots", shot.file));
    // The name follows the picture: uploads are served as immutable, so a
    // retaken shot must get a new URL or browsers keep the old one for a year.
    coverId = uuidFrom(`showcase-shot:${p.qid}:${createHash("sha1").update(bytes).digest("hex")}`);
    file = `${coverId}.jpg`;
    mime = "image/jpeg";
    kind = "screenshot";
    shotDate = shot.at.slice(0, 10);
    await writeFile(path.join(coversDir, file), bytes);
  } else {
    coverId = uuidFrom("showcase-tile:" + p.qid);
    file = `${coverId}.png`;
    mime = "image/png";
    kind = "tile";
    await tile(p, i, path.join(coversDir, file));
  }
  i += 1;
  const bytes = (await stat(path.join(coversDir, file))).size;
  const program = [p.edu, p.cohort, MARK].filter(Boolean).join(" · ");
  manifest.push({ ...p, slug, userId, coverId, file, mime, kind, shotDate, bytes, program, coverUrl: `${PUBLIC_BASE}/${file}` });
  console.log(`${kind.padEnd(10)} ${file}  ${String(bytes).padStart(6)}B  ${p.name} — ${program}`);
}

const users = manifest.map((m) => `  (${sql(m.userId)}, 'showcase', ${sql(m.qid)}, 'unimelb', ${sql(m.name)})`).join(",\n");
const profiles = manifest.map((m) => {
  const content = { about: `${m.about}\n\n${aboutTail(m.shotDate)}`, works: [{ title: "官方个人网站", description: hostOf(m.site), url: m.site, image: m.coverUrl }] };
  // Highlights come from the same sourced facts as the pitch; three at most.
  if (Array.isArray(m.highlights) && m.highlights.length) content.highlights = m.highlights.slice(0, 3).map((text) => ({ text: String(text).slice(0, 40) }));
  // Where the card's facts come from — the article, or for people without one,
  // the page the education claim was read off.
  const links = [{ label: m.sourceLabel || "Wikipedia", url: m.source || m.wikipedia }].filter((l) => l.url);
  const tags = `{${m.tags.map((t) => `"${t.replace(/"/g, "")}"`).join(",")}}`;
  return `  (${sql(m.userId)}, ${sql(m.slug)}, ${sql(m.program)}, ${sql(m.pitch)}, ${sql(tags)}, false, false, null, ${sql(m.site)}, ${sql(JSON.stringify(links))}, ${sql(JSON.stringify(content))}, true)`;
}).join(",\n");
const uploads = manifest.map((m) => `  (${sql(m.coverId)}, ${sql(m.userId)}, ${sql(m.file)}, ${sql(m.mime)}, ${m.bytes})`).join(",\n");

const seed = `-- 精选校友示例（showcase）：墨大 / VCA 出身、有官方个人网站的公众人物。
--
-- 这些不是用户。realm = 'showcase' 没有任何墙会签发 token，所以没人能以他们的身份
-- 登录、发帖或回复申请；名片上的「专业」一栏写的是所学专业、哪一届，并标明「精选校友」，
-- 两个开放开关都关着，点名片直接跳到其官方网站。资料来源是维基百科 / Wikidata 等公开
-- 页面（subject 列就是 Wikidata 编号），每个网站上线前都实际请求过。
--
-- 封面是对方网站首页的截图（scripts/showcase/capture_sites.mjs），截不到的用我们
-- 自己生成的字体块。
--
-- 由 scripts/showcase/build_showcase.mjs 生成，不要手改。
-- 幂等：重跑即整体替换。一句移除全部：
--   delete from users where realm = 'showcase';
begin;

delete from users where realm = 'showcase';

insert into users (id, realm, subject, school, display_name) values
${users};

insert into profiles (user_id, slug, program, pitch, tags, open_to_team, open_to_friends, template, site_url, links, content, published) values
${profiles};

insert into uploads (id, owner_id, file, mime, bytes) values
${uploads};

commit;
`;
await writeFile(path.join(here, "..", "..", "db", "seed-showcase.sql"), seed);
await writeFile(path.join(here, "manifest.json"), JSON.stringify(manifest, null, 2));
const n = (k) => manifest.filter((m) => m.kind === k).length;
console.log(`\ndb/seed-showcase.sql: ${manifest.length} cards (${n("screenshot")} screenshots, ${n("tile")} tiles)`);
