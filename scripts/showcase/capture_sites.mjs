// Step 4: one screenshot of each selected person's homepage — the card cover.
//
//   node capture_sites.mjs [name substring …]   → shots/<slug>.jpg, shots/report.json
//
// One page per site, once. The browser says who it is (UA suffix below), and a
// site whose robots.txt closes "/" to everyone is left alone: that card keeps
// its typographic tile. Every shot has to be looked at by a person before it
// goes live (loaders, cookie banners, artwork that does not belong on a campus
// site) — set "cover": "tile" in selection.json for the ones that fail.
//
// No dependencies: Chrome is driven over its DevTools socket with Node's own
// WebSocket (Node 22+).
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const CHROME = process.env.CHROME || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const UA_SUFFIX = "SkillWallShowcase/0.1 (+https://skills.talkwalll.com)";
// 1280×640 CSS pixels drawn at 0.75 → a 960×480 image, the card's 2:1 slot.
const VIEW = { width: 1280, height: 640, deviceScaleFactor: 0.75, mobile: false };
const SETTLE_MS = Number(process.env.SETTLE_MS) || 2500; // entrance animations; slideshows that cross-fade want more
const only = process.argv.slice(2).map((s) => s.toLowerCase());

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slugify = (s) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

// Is "/" closed to everyone (or to us by name)? Anything short of that is fine:
// we fetch the front page only.
async function robotsClosed(site) {
  try {
    const res = await fetch(new URL("/robots.txt", site), { headers: { "User-Agent": UA_SUFFIX }, signal: AbortSignal.timeout(12000) });
    if (!res.ok) return false;
    const text = await res.text();
    if (/<html/i.test(text.slice(0, 400))) return false;
    let applies = false, fresh = true, closed = false, opened = false;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.replace(/#.*/, "").trim();
      const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
      if (!m) continue;
      const key = m[1].toLowerCase(), value = m[2].trim();
      if (key === "user-agent") {
        if (!fresh) { applies = false; fresh = true; }
        if (value === "*" || /skillwall/i.test(value)) applies = true;
      } else {
        fresh = false;
        if (!applies) continue;
        if (key === "disallow" && value === "/") closed = true;
        if (key === "allow" && (value === "/" || value === "/$")) opened = true;
      }
    }
    return closed && !opened;
  } catch {
    return false;
  }
}

async function launch() {
  const profile = await mkdtemp(path.join(os.tmpdir(), "showcase-chrome-"));
  const child = spawn(CHROME, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars", "--mute-audio",
    `--window-size=${VIEW.width},${VIEW.height}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const endpoint = await new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error("chrome did not start")), 30000);
    child.stderr.on("data", (d) => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
    child.on("exit", () => reject(new Error("chrome exited: " + buf.slice(-300))));
  });
  const ws = new WebSocket(endpoint);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error("devtools socket failed")); });
  let seq = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
    } else if (msg.method) {
      for (const fn of listeners) fn(msg);
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const close = async () => {
    try { await send("Browser.close"); } catch { /* already gone */ }
    await sleep(500);
    child.kill();
    await rm(profile, { recursive: true, force: true }).catch(() => {});
  };
  return { send, listeners, close };
}

async function shoot(browser, userAgent, site) {
  const { send, listeners } = browser;
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const cmd = (method, params) => send(method, params, sessionId);
  let inflight = 0, lastActivity = Date.now(), loaded = false, status = null;
  const onEvent = (msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === "Network.requestWillBeSent") { inflight += 1; lastActivity = Date.now(); }
    if (msg.method === "Network.loadingFinished" || msg.method === "Network.loadingFailed") { inflight = Math.max(0, inflight - 1); lastActivity = Date.now(); }
    if (msg.method === "Network.responseReceived" && msg.params.type === "Document" && status == null) status = msg.params.response.status;
    if (msg.method === "Page.loadEventFired") loaded = true;
  };
  listeners.add(onEvent);
  try {
    await cmd("Page.enable");
    await cmd("Network.enable");
    await cmd("Emulation.setDeviceMetricsOverride", VIEW);
    await cmd("Emulation.setUserAgentOverride", { userAgent });
    const nav = await cmd("Page.navigate", { url: site });
    if (nav.errorText) return { ok: false, reason: nav.errorText };
    const started = Date.now();
    while (!loaded && Date.now() - started < 30000) await sleep(200);
    // Quiet network (a couple of long-lived connections are normal), capped.
    const settleFrom = Date.now();
    while (Date.now() - settleFrom < 12000 && !(inflight <= 2 && Date.now() - lastActivity > 1500)) await sleep(200);
    await sleep(SETTLE_MS);
    const info = await cmd("Runtime.evaluate", { expression: "JSON.stringify({ url: location.href, title: document.title, text: (document.body?.innerText || '').length })", returnByValue: true });
    const page = JSON.parse(info.result.value);
    const { data } = await cmd("Page.captureScreenshot", { format: "jpeg", quality: 84 });
    return { ok: true, status, loaded, ...page, image: Buffer.from(data, "base64") };
  } catch (err) {
    return { ok: false, reason: String(err.message || err) };
  } finally {
    listeners.delete(onEvent);
    await send("Target.closeTarget", { targetId }).catch(() => {});
  }
}

const selection = JSON.parse(await readFile(path.join(here, "selection.json"), "utf8"));
const todo = selection.filter((p) => !only.length || only.some((s) => p.name.toLowerCase().includes(s)));
await mkdir(path.join(here, "shots"), { recursive: true });

let report = [];
try { report = JSON.parse(await readFile(path.join(here, "shots", "report.json"), "utf8")); } catch { /* first run */ }

const browser = await launch();
const { userAgent: base } = await browser.send("Browser.getVersion");
const userAgent = `${base} ${UA_SUFFIX}`;
try {
  for (const p of todo) {
    const slug = p.slug || slugify(p.name);
    const entry = { name: p.name, slug, site: p.site, at: new Date().toISOString() };
    if (await robotsClosed(p.site)) {
      Object.assign(entry, { ok: false, reason: "robots.txt closes / to everyone" });
    } else {
      const shot = await shoot(browser, userAgent, p.site);
      if (shot.ok) {
        const file = `${slug}.jpg`;
        await writeFile(path.join(here, "shots", file), shot.image);
        Object.assign(entry, { ok: true, file, bytes: shot.image.length, status: shot.status, finalUrl: shot.url, title: shot.title, textLength: shot.text });
      } else {
        Object.assign(entry, { ok: false, reason: shot.reason });
      }
    }
    report = report.filter((r) => r.slug !== slug).concat(entry);
    console.log(`${entry.ok ? "shot" : "SKIP"}  ${p.name.padEnd(22)} ${entry.ok ? `${String(entry.bytes).padStart(7)}B  http ${entry.status}  ${entry.finalUrl}` : entry.reason}`);
    await sleep(500);
  }
} finally {
  await browser.close();
}
await writeFile(path.join(here, "shots", "report.json"), JSON.stringify(report, null, 2));
console.log(`\n${report.filter((r) => r.ok).length}/${report.length} shots in shots/`);
