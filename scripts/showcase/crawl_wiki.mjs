// Step 2: the people Wikidata's "educated at" misses. English Wikipedia files
// alumni under categories; walk those, resolve each page to its Wikidata item,
// and for art/design people with no official-website claim, read the article's
// own {{Official website}} / infobox website.
//
//   node crawl_wiki.mjs   → wiki_people.json
import { writeFile } from "node:fs/promises";

const UA = "SkillWallShowcase/0.1 (+https://skills.talkwalll.com)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CATEGORIES = {
  "Category:Victorian College of the Arts alumni": "Victorian College of the Arts",
  "Category:University of Melbourne alumni": "University of Melbourne",
  "Category:Melbourne Conservatorium of Music alumni": "Melbourne Conservatorium of Music",
};

// maxlag is the polite flag ("refuse me while replicas are behind"). Wikidata's
// replicas are behind for long stretches, so: honour it for a few tries with the
// server's own Retry-After, then send the (small, read-only) request without it.
// Counted per host for the whole run, not per request: once a host has shown
// it is lagged, waiting it out again on each of 40 batches is 40 minutes.
const lagRefusalsByHost = {};
async function api(host, params) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const withLag = (lagRefusalsByHost[host] || 0) < 3;
    const url = `https://${host}/w/api.php?` + new URLSearchParams({ format: "json", formatversion: "2", ...(withLag ? { maxlag: "5" } : {}), ...params });
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    const retryAfter = Math.min(Number(res.headers.get("retry-after")) || 0, 20);
    if (res.status === 429 || res.status === 503) { await sleep((retryAfter || 3 * (attempt + 1)) * 1000); continue; }
    let data;
    try { data = await res.json(); } catch { await sleep(2000); continue; }
    if (data.error?.code === "maxlag") { lagRefusalsByHost[host] = (lagRefusalsByHost[host] || 0) + 1; await sleep(Math.min(retryAfter || 5, 5) * 1000); continue; }
    return data;
  }
  throw new Error("api gave up: " + host + " " + JSON.stringify(params).slice(0, 120));
}

// 1. category members (articles only)
const pages = new Map(); // title -> Set(school)
for (const [cat, school] of Object.entries(CATEGORIES)) {
  let cont = null, n = 0;
  do {
    const d = await api("en.wikipedia.org", { action: "query", list: "categorymembers", cmtitle: cat, cmnamespace: "0", cmlimit: "500", ...(cont ? { cmcontinue: cont } : {}) });
    for (const m of d.query?.categorymembers || []) {
      if (!pages.has(m.title)) pages.set(m.title, new Set());
      pages.get(m.title).add(school);
      n += 1;
    }
    cont = d.continue?.cmcontinue || null;
    await sleep(200);
  } while (cont);
  console.log(`${cat}: ${n}`);
}

// 2. title -> wikidata item
const titles = [...pages.keys()];
const qidOf = new Map();
for (let i = 0; i < titles.length; i += 50) {
  const d = await api("en.wikipedia.org", { action: "query", prop: "pageprops", ppprop: "wikibase_item", titles: titles.slice(i, i + 50).join("|") });
  for (const p of d.query?.pages || []) if (p.pageprops?.wikibase_item) qidOf.set(p.title, p.pageprops.wikibase_item);
  await sleep(150);
}
console.log(`pages=${titles.length} with wikidata item=${qidOf.size}`);

// 3. claims
const people = [];
const occIds = new Set();
const qids = [...new Set(qidOf.values())];
const byQid = new Map();
for (let i = 0; i < qids.length; i += 50) {
  const d = await api("www.wikidata.org", { action: "wbgetentities", ids: qids.slice(i, i + 50).join("|"), props: "claims|labels|sitelinks", languages: "en|zh", sitefilter: "enwiki" });
  for (const [id, e] of Object.entries(d.entities || {})) {
    const claim = (p) => (e.claims?.[p] || []).map((c) => c.mainsnak?.datavalue?.value).filter(Boolean);
    const occ = claim("P106").map((v) => v.id);
    occ.forEach((o) => occIds.add(o));
    byQid.set(id, {
      id, name: e.labels?.en?.value || id, zh: e.labels?.zh?.value || null,
      sites: claim("P856"),
      occIds: occ,
      human: claim("P31").some((v) => v.id === "Q5"),
      birth: claim("P569")[0]?.time?.slice(1, 5) || null,
      death: claim("P570")[0]?.time?.slice(1, 5) || null,
    });
  }
  await sleep(150);
}

// occupation labels
const occLabel = new Map();
const occList = [...occIds];
for (let i = 0; i < occList.length; i += 50) {
  const d = await api("www.wikidata.org", { action: "wbgetentities", ids: occList.slice(i, i + 50).join("|"), props: "labels", languages: "en" });
  for (const [id, e] of Object.entries(d.entities || {})) occLabel.set(id, e.labels?.en?.value || id);
  await sleep(150);
}

const FIELDS = [
  ["设计", /\b(graphic designer|designer|typographer|industrial designer|fashion designer|interior designer|web designer|game designer|jewell?ery designer|costume designer|scenographer|set designer|production designer)\b/i],
  ["插画漫画", /\b(illustrator|cartoonist|comics artist|caricaturist|comic)\b/i],
  ["摄影", /\bphotographer\b/i],
  ["视觉艺术", /\b(painter|sculptor|visual artist|installation artist|printmaker|video artist|performance artist|ceramicist|ceramist|street artist|muralist|conceptual artist|multimedia artist|new media artist|artist|drawer|draughtsperson|textile artist)\b/i],
  ["建筑", /\b(architect|landscape architect|urban planner)\b/i],
  ["影视动画", /\b(film director|animator|cinematographer|documentary filmmaker|filmmaker|film producer|television director)\b/i],
];
const ART = new Set(FIELDS.map(([n]) => n));

for (const [title, schools] of pages) {
  const q = qidOf.get(title);
  const e = q && byQid.get(q);
  if (!e || !e.human) continue;
  const occupations = e.occIds.map((o) => occLabel.get(o) || o);
  const occText = occupations.join(" | ");
  const fields = FIELDS.filter(([, re]) => re.test(occText)).map(([n]) => n);
  people.push({ ...e, title, schools: [...schools], occupations, fields, wikipedia: "https://en.wikipedia.org/wiki/" + encodeURIComponent(title.replace(/ /g, "_")) });
}

// 4. art/design, living, no P856 → read the article for an official site
const need = people.filter((p) => !p.death && p.fields.some((f) => ART.has(f)) && !p.sites.length);
console.log(`art/design living: ${people.filter((p) => !p.death && p.fields.some((f) => ART.has(f))).length}, of which no website claim: ${need.length}`);
let found = 0;
for (const p of need) {
  const d = await api("en.wikipedia.org", { action: "parse", page: p.title, prop: "wikitext", redirects: "1" });
  const wt = d.parse?.wikitext || "";
  const m = wt.match(/\{\{\s*official(?: website| URL)?\s*\|\s*(?:1\s*=\s*)?([^|}\s]+)/i)
    || wt.match(/\|\s*website\s*=\s*\{\{\s*URL\s*\|\s*([^|}\s]+)/i)
    || wt.match(/\|\s*website\s*=\s*\[?(https?:\/\/[^\s\]|}]+)/i);
  if (m) {
    let u = m[1].trim();
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    p.sites = [u];
    p.siteSource = "enwiki article";
    found += 1;
  }
  await sleep(120);
}
console.log(`official site recovered from article text: ${found}`);

await writeFile(new URL("./wiki_people.json", import.meta.url), JSON.stringify(people, null, 2));
const art = people.filter((p) => !p.death && p.fields.some((f) => ART.has(f)) && p.sites.length);
console.log(`art/design living WITH a site (category crawl): ${art.length}`);
