// Step 3: merge both crawls, keep living art/design people with a site, and
// actually request each site — a link that 404s or now points at a parked
// domain must not end up on a card.
//
//   node verify_sites.mjs   → candidates.json + a table
import { readFile, writeFile } from "node:fs/promises";

const UA = "SkillWallShowcase/0.1 (+https://skills.talkwalll.com)";
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const ART = new Set(["设计", "插画漫画", "摄影", "视觉艺术", "建筑", "影视动画"]);
// Not a personal site: social profiles, databases, employers.
const NOT_PERSONAL = /(facebook|twitter|x|instagram|linkedin|youtube|imdb|myspace|tiktok|wikipedia|peoplepill|blogspot|wordpress)\.(com|org)|\.edu(\.|\/|$)|\.gov(\.|\/|$)|unimelb\.edu\.au|monash\.edu|rmit\.edu|\.ac\.uk/i;

const a = JSON.parse(await readFile(new URL("./alumni_all.json", import.meta.url), "utf8"));
const b = JSON.parse(await readFile(new URL("./wiki_people.json", import.meta.url), "utf8"));

const merged = new Map();
for (const p of a) merged.set(p.id, { ...p, source: ["wikidata P69"] });
for (const p of b) {
  const cur = merged.get(p.id);
  if (cur) {
    cur.schools = [...new Set([...cur.schools, ...p.schools])];
    cur.source.push("enwiki category");
    if (!cur.wikipedia) cur.wikipedia = p.wikipedia;
    if (!cur.sites.length && p.sites.length) cur.sites = p.sites;
  } else {
    merged.set(p.id, { ...p, sitelinks: p.sitelinks ?? 0, source: ["enwiki category"] });
  }
}

const pool = [...merged.values()].filter((p) => !p.death && p.sites.length && p.fields.some((f) => ART.has(f)));
console.log(`merged people=${merged.size}; art/design living with a site=${pool.length}`);

async function probe(url) {
  for (const ua of [UA, BROWSER_UA]) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const res = await fetch(url, { headers: { "User-Agent": ua, Accept: "text/html,*/*" }, redirect: "follow", signal: ctl.signal });
      const text = res.ok ? (await res.text()).slice(0, 200000) : "";
      clearTimeout(timer);
      if (res.status === 403 && ua === UA) continue; // some hosts refuse unknown agents; retry once as a browser
      const title = (text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim().slice(0, 90);
      const parked = /domain (is )?for sale|buy this domain|parked|godaddy|sedo|hugedomains|expired/i.test(text.slice(0, 20000));
      return { status: res.status, finalUrl: res.url, title, parked, bytes: text.length };
    } catch (e) {
      clearTimeout(timer);
      if (ua === BROWSER_UA) return { status: 0, error: String(e.cause?.code || e.name || e).slice(0, 40) };
    }
  }
  return { status: 403 };
}

const out = [];
const queue = [...pool];
async function worker() {
  while (queue.length) {
    const p = queue.shift();
    const site = p.sites[0];
    const r = NOT_PERSONAL.test(site) ? { status: -1, error: "not a personal site" } : await probe(site);
    out.push({ ...p, site, check: r });
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

const ok = out.filter((p) => p.check.status === 200 && !p.check.parked && p.check.bytes > 500);
ok.sort((x, y) => (y.sitelinks || 0) - (x.sitelinks || 0));
await writeFile(new URL("./candidates.json", import.meta.url), JSON.stringify({ ok, rejected: out.filter((p) => !ok.includes(p)) }, null, 2));

console.log(`\nreachable personal sites: ${ok.length} / ${out.length}`);
for (const p of ok) {
  console.log(`${String(p.sitelinks || 0).padStart(3)}  ${p.name.padEnd(26)} ${(p.birth || "?").padEnd(5)} [${p.fields.join(",")}]  ${p.schools.map((s) => s.replace("University of Melbourne", "UoM").replace("Victorian College of the Arts", "VCA").replace("Melbourne Conservatorium of Music", "MCM")).join("+")}  ${p.check.finalUrl}  «${p.check.title}»`);
}
console.log("\nrejected:");
for (const p of out.filter((x) => !ok.includes(x))) console.log(`  ${p.name.padEnd(26)} ${p.site}  → ${p.check.status} ${p.check.error || (p.check.parked ? "parked" : "")}`);
