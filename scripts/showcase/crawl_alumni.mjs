// Step 1 of the showcase research: who studied at the University of Melbourne
// (or its arts schools) AND has an official website on record. Source is
// Wikidata (educated at = P69, official website = P856), so every row is
// traceable to a public, editable record rather than to my memory.
//
//   node crawl_alumni.mjs            → writes alumni_all.json + prints a summary
//
// Etiquette: one SPARQL request, custom User-Agent, no personal data beyond what
// Wikidata already publishes.
import { writeFile } from "node:fs/promises";

const UA = "SkillWallShowcase/0.1 (+https://skills.talkwalll.com)";
const SCHOOLS = {
  Q319078: "University of Melbourne",
  Q27530148: "Victorian College of the Arts",
  Q56273987: "Melbourne Conservatorium of Music",
  Q6811823: "Melbourne Law School",
};

const sparql = `
SELECT ?p ?pLabel ?zh ?site ?school ?occLabel ?birth ?death ?links ?article WHERE {
  VALUES ?school { ${Object.keys(SCHOOLS).map((q) => "wd:" + q).join(" ")} }
  ?p wdt:P31 wd:Q5 ; wdt:P69 ?school ; wdt:P856 ?site ; wikibase:sitelinks ?links .
  OPTIONAL { ?p wdt:P106 ?occ . ?occ rdfs:label ?occLabel . FILTER(LANG(?occLabel) = "en") }
  OPTIONAL { ?p wdt:P569 ?birth }
  OPTIONAL { ?p wdt:P570 ?death }
  OPTIONAL { ?article schema:about ?p ; schema:isPartOf <https://en.wikipedia.org/> }
  OPTIONAL { ?p rdfs:label ?zh . FILTER(LANG(?zh) = "zh") }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en" . }
}`;

const res = await fetch("https://query.wikidata.org/sparql?query=" + encodeURIComponent(sparql), {
  headers: { "User-Agent": UA, Accept: "application/sparql-results+json" },
});
if (!res.ok) { console.error("SPARQL failed", res.status, await res.text()); process.exit(1); }
const rows = (await res.json()).results.bindings;

const people = new Map();
for (const r of rows) {
  const id = r.p.value.split("/").pop();
  let p = people.get(id);
  if (!p) {
    p = {
      id, name: r.pLabel?.value || id, zh: r.zh?.value || null,
      sites: new Set(), schools: new Set(), occupations: new Set(),
      birth: r.birth?.value?.slice(0, 4) || null, death: r.death?.value?.slice(0, 4) || null,
      sitelinks: Number(r.links?.value || 0),
      wikipedia: r.article?.value || null,
    };
    people.set(id, p);
  }
  p.sites.add(r.site.value);
  p.schools.add(SCHOOLS[r.school.value.split("/").pop()]);
  if (r.occLabel) p.occupations.add(r.occLabel.value);
}

// Field buckets. A person can land in several; the first match in this order is
// their primary field for the summary.
const FIELDS = [
  ["设计", /\b(graphic designer|designer|typographer|industrial designer|fashion designer|interior designer|web designer|game designer|jewell?ery designer|costume designer|scenographer|set designer|production designer)\b/i],
  ["插画漫画", /\b(illustrator|cartoonist|comics artist|caricaturist|comic)\b/i],
  ["摄影", /\bphotographer\b/i],
  ["视觉艺术", /\b(painter|sculptor|visual artist|installation artist|printmaker|video artist|performance artist|ceramicist|ceramist|street artist|muralist|conceptual artist|multimedia artist|new media artist|artist|drawer|draughtsperson|textile artist)\b/i],
  ["建筑", /\b(architect|landscape architect|urban planner)\b/i],
  ["影视动画", /\b(film director|animator|cinematographer|documentary filmmaker|filmmaker|film producer|screenwriter|television director)\b/i],
  ["音乐", /\b(composer|musician|singer|pianist|conductor|violinist|guitarist|songwriter|opera singer|cellist|jazz musician|record producer)\b/i],
  ["表演", /\b(actor|actress|comedian|dancer|choreographer|theatre director|theatrical director|playwright)\b/i],
  ["写作", /\b(writer|novelist|poet|author|journalist|essayist|historian|biographer|children's writer)\b/i],
  ["科技商业", /\b(entrepreneur|businessperson|computer scientist|engineer|programmer|software|inventor|business)\b/i],
  ["学术", /\b(professor|academic|researcher|scientist|physicist|chemist|biologist|mathematician|economist|philosopher|psychologist|physician|university teacher|sociologist|linguist)\b/i],
  ["政法", /\b(politician|lawyer|judge|barrister|diplomat|solicitor|jurist)\b/i],
];
function fieldsOf(p) {
  const occ = [...p.occupations].join(" | ");
  return FIELDS.filter(([, re]) => re.test(occ)).map(([name]) => name);
}

const out = [...people.values()].map((p) => ({
  ...p, sites: [...p.sites], schools: [...p.schools], occupations: [...p.occupations], fields: fieldsOf(p),
})).sort((a, b) => b.sitelinks - a.sitelinks);

await writeFile(new URL("./alumni_all.json", import.meta.url), JSON.stringify(out, null, 2));

const living = out.filter((p) => !p.death);
const tally = {};
for (const p of living) for (const f of (p.fields.length ? p.fields : ["其他"])) tally[f] = (tally[f] || 0) + 1;
console.log(`rows=${rows.length} people=${out.length} living=${living.length}`);
console.log("by field (living, a person may count in several):");
for (const [f, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) console.log(`  ${f.padEnd(6)} ${n}`);

const ART = new Set(["设计", "插画漫画", "摄影", "视觉艺术", "建筑", "影视动画"]);
const art = living.filter((p) => p.fields.some((f) => ART.has(f)));
console.log(`\nart/design living with official site: ${art.length}`);
for (const p of art) {
  console.log(`${String(p.sitelinks).padStart(3)}  ${p.name.padEnd(26)} ${p.birth || "?"}  [${p.fields.join(",")}]  ${p.schools.map((s) => s.replace("University of Melbourne", "UoM").replace("Victorian College of the Arts", "VCA")).join("+")}  ${p.sites[0]}`);
}
