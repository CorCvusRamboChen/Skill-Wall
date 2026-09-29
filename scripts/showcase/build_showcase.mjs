// Step 4: turn the curated selection into (a) one typographic cover tile per
// person and (b) an idempotent seed file for the skill-wall database.
//
// The tiles are generated type, not screenshots: an artist's homepage IS their
// artwork, and a card has no business re-hosting it. The card links out; the
// tile only says whose site it is.
//
//   node build_showcase.mjs   → tiles/<uuid>.png, seed-showcase.sql, manifest.json
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const PUBLIC_BASE = "https://unimelbwall.com/skillwall/uploads";
const PROGRAM = "精选校友 · 非本人入驻";
const ABOUT_TAIL = "这张名片是技能墙整理的精选示例：资料来自维基百科与 Wikidata 的公开条目，链接是其官方个人网站。本人并未入驻技能墙；如需更正或移除，请通过站内「意见反馈」联系我们。";

const selection = JSON.parse(await readFile(path.join(here, "selection.json"), "utf8"));

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

await mkdir(path.join(here, "tiles"), { recursive: true });
const manifest = [];
let i = 0;
for (const p of selection) {
  const userId = uuidFrom("showcase-user:" + p.qid);
  const tileId = uuidFrom("showcase-tile:" + p.qid);
  const file = `${tileId}.png`;
  const [bg, ink] = PALETTES[i % PALETTES.length];
  i += 1;
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
  const htmlPath = path.join(here, "tiles", `${tileId}.html`);
  await writeFile(htmlPath, html);
  const png = path.join(here, "tiles", file);
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1", "--window-size=960,480", "--virtual-time-budget=6000", `--screenshot=${png}`, pathToFileURL(htmlPath).href], { stdio: "ignore", timeout: 60000 });
  const bytes = (await stat(png)).size;
  manifest.push({ ...p, userId, tileId, file, bytes, slug: p.slug || slugify(p.name), tileUrl: `${PUBLIC_BASE}/${file}` });
  console.log(`tile ${file}  ${String(bytes).padStart(6)}B  ${p.name}`);
}

const users = manifest.map((m) => `  (${sql(m.userId)}, 'showcase', ${sql(m.qid)}, 'unimelb', ${sql(m.name)})`).join(",\n");
const profiles = manifest.map((m) => {
  const content = { about: `${m.about}\n\n${ABOUT_TAIL}`, works: [{ title: "官方个人网站", description: hostOf(m.site), url: m.site, image: m.tileUrl }] };
  // Where the card's facts come from — the article, or for people without one,
  // the page the education claim was read off.
  const links = [{ label: m.sourceLabel || "Wikipedia", url: m.source || m.wikipedia }].filter((l) => l.url);
  const tags = `{${m.tags.map((t) => `"${t.replace(/"/g, "")}"`).join(",")}}`;
  return `  (${sql(m.userId)}, ${sql(m.slug)}, ${sql(PROGRAM)}, ${sql(m.pitch)}, ${sql(tags)}, false, false, null, ${sql(m.site)}, ${sql(JSON.stringify(links))}, ${sql(JSON.stringify(content))}, true)`;
}).join(",\n");
const uploads = manifest.map((m) => `  (${sql(m.tileId)}, ${sql(m.userId)}, ${sql(m.file)}, 'image/png', ${m.bytes})`).join(",\n");

const seed = `-- 精选校友示例（showcase）：墨大 / VCA 出身、有官方个人网站的公众人物。
--
-- 这些不是用户。realm = 'showcase' 没有任何墙会签发 token，所以没人能以他们的身份
-- 登录、发帖或回复申请；名片上的「专业」一栏写明「精选校友 · 非本人入驻」，两个开放
-- 开关都关着，点名片直接跳到其官方网站。资料来源是维基百科 / Wikidata 的公开条目
-- （subject 列就是 Wikidata 编号），每个网站上线前都实际请求过。
--
-- 封面图是我们自己生成的字体块（人名 + 域名），不是对方网站的截图。
--
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
await writeFile(path.join(here, "seed-showcase.sql"), seed);
await writeFile(path.join(here, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`\nseed-showcase.sql: ${manifest.length} cards`);
