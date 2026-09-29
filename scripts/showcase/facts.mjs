// Step 3b: for each shortlisted person, pull what their English Wikipedia
// article actually says — the lead, and every sentence that mentions where they
// studied — so the card text is written from a source, not from memory.
import { readFile, writeFile } from "node:fs/promises";

const UA = "SkillWallShowcase/0.1 (+https://skills.talkwalll.com)";
const NAMES = process.argv.slice(2);
const { ok } = JSON.parse(await readFile(new URL("./candidates.json", import.meta.url), "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function wiki(params) {
  const url = "https://en.wikipedia.org/w/api.php?" + new URLSearchParams({ format: "json", formatversion: "2", ...params });
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  return res.json();
}

const out = [];
for (const name of NAMES) {
  const p = ok.find((x) => x.name === name);
  const title = p?.title || (p?.wikipedia ? decodeURIComponent(p.wikipedia.split("/wiki/")[1]).replace(/_/g, " ") : name);
  const d = await wiki({ action: "query", prop: "extracts", explaintext: "1", redirects: "1", titles: title });
  const page = d.query?.pages?.[0];
  const text = page?.extract || "";
  const lead = text.split("\n\n")[0].replace(/\s+/g, " ").slice(0, 520);
  const sentences = text.replace(/\n+/g, " ").split(/(?<=[.!?])\s+/);
  const edu = sentences.filter((s) => /(Victorian College of the Arts|University of Melbourne|\bVCA\b|Melbourne University|Melbourne State College|Melbourne School of Design)/i.test(s)).slice(0, 4).map((s) => s.slice(0, 300));
  out.push({ name, qid: p?.id || null, title: page?.title, missing: !!page?.missing, site: p?.check?.finalUrl || null, schools: p?.schools, lead, edu });
  console.log(`\n### ${name}  (${p?.id || "not in candidates"})  ${p?.check?.finalUrl || ""}`);
  console.log("LEAD:", lead);
  for (const e of edu) console.log("EDU :", e);
  if (!edu.length) console.log("EDU : (article does not mention the school in prose)");
  await sleep(150);
}
await writeFile(new URL("./facts.json", import.meta.url), JSON.stringify(out, null, 2));
