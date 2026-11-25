#!/usr/bin/env node
/**
 * Verification of the BUILT output, not the build log.
 * - per-locale: html[lang], title, h1, canonical, hreflang reciprocity, JSON-LD parse
 * - tel:, map src, no horizontal overflow at 360 / 768 / 1920
 * - drawer: aria-expanded flips, Escape closes, no pageerror
 * - screenshots: desktop + mobile per locale, tablet for the handover card
 */
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, extname, join, resolve, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "tmp/shots");
mkdirSync(OUT, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".woff2": "font/woff2",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
};

const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const file = normalize(join(ROOT, p));
  if (!file.startsWith(ROOT) || !existsSync(file)) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("404");
    return;
  }
  res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const LOCALES = [
  { code: "es", path: "", expectLang: "es" },
  { code: "ca", path: "ca/", expectLang: "ca" },
  { code: "en", path: "en/", expectLang: "en" },
];

const fails = [];
const passes = [];
const ok = (cond, label, extra = "") => {
  if (cond) passes.push(label);
  else fails.push(label + (extra ? ` — ${extra}` : ""));
};

const browser = await puppeteer.launch({ args: ["--no-sandbox", "--font-render-hinting=none"] });

for (const l of LOCALES) {
  const url = BASE + l.path;
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });

  await page.setViewport({ width: 1280, height: 900 });
  const resp = await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
  ok(resp.status() === 200, `[${l.code}] 200 response`, String(resp.status()));

  const info = await page.evaluate(() => {
    const ld = document.querySelector('script[type="application/ld+json"]');
    let ldOk = false, ldType = null;
    try { const j = JSON.parse(ld.textContent); ldOk = true; ldType = j["@type"]; } catch (e) { ldOk = false; }
    return {
      lang: document.documentElement.lang,
      title: document.title,
      h1: (document.querySelector("h1") || {}).textContent,
      h1Count: document.querySelectorAll("h1").length,
      canonical: (document.querySelector('link[rel="canonical"]') || {}).href,
      hreflangs: [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map((n) => [n.hreflang, n.getAttribute("href")]),
      ldOk, ldType,
      telLinks: [...document.querySelectorAll('a[href^="tel:"]')].map((a) => a.getAttribute("href")),
      mapSrc: (document.getElementById("map-template") || {}).innerHTML || "",
      cookieBar: !!document.getElementById("cookiebar"),
      imgsNoAlt: [...document.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt")).length,
      internalEmptyLinks: [...document.querySelectorAll("a")].filter((a) => {
        const h = a.getAttribute("href");
        return h === "" || h === null;
      }).length,
      langLinks: [...document.querySelectorAll(".langs__link")].map((a) => a.getAttribute("href")),
      quotes: document.querySelectorAll(".quote").length,
    };
  });

  ok(info.lang === l.expectLang, `[${l.code}] html[lang]=${l.expectLang}`, info.lang);
  ok(!!info.title && info.title.length > 20, `[${l.code}] title present`, info.title);
  ok(info.h1Count === 1 && !!info.h1.trim(), `[${l.code}] single non-empty h1`, info.h1);
  ok(!!info.canonical, `[${l.code}] canonical present`, info.canonical);
  ok(info.ldOk && info.ldType === "Restaurant", `[${l.code}] JSON-LD parses as Restaurant`, `${info.ldOk}/${info.ldType}`);
  ok(info.telLinks.some((h) => h === "tel:+34934860713"), `[${l.code}] tel: link correct`, JSON.stringify(info.telLinks));
  ok(/output=embed/.test(info.mapSrc) && /41\.2153657/.test(info.mapSrc), `[${l.code}] map embed src with coords`);
  ok(info.cookieBar, `[${l.code}] cookie notice present`);
  ok(info.imgsNoAlt === 0, `[${l.code}] all <img> have alt`, String(info.imgsNoAlt));
  ok(info.internalEmptyLinks === 0, `[${l.code}] no empty href`, String(info.internalEmptyLinks));

  // hreflang reciprocity
  const hf = Object.fromEntries(info.hreflangs.filter(([k]) => k !== "x-default"));
  ok(Object.keys(hf).length === 3, `[${l.code}] 3 hreflang alternates`, JSON.stringify(Object.keys(hf)));
  ok(/lagambarrada\/ca\/?$/.test(hf["ca-ES"] || ""), `[${l.code}] ca alternate points at /ca/`, hf["ca-ES"]);
  ok(/lagambarrada(\/|$)/.test(hf["es-ES"] || ""), `[${l.code}] es alternate points at root`, hf["es-ES"]);

  // language switch links resolve
  for (const href of info.langLinks) {
    const abs = new URL(href, url).href;
    const r = await page.goto(abs, { waitUntil: "domcontentloaded" });
    ok(r.status() === 200, `[${l.code}] lang link 200 ${href}`, String(r.status()));
  }
  await page.goto(url, { waitUntil: "networkidle2" });

  // overflow check at 3 widths
  for (const w of [360, 768, 1920]) {
    await page.setViewport({ width: w, height: 900 });
    await new Promise((r) => setTimeout(r, 250));
    const ov = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth,
    }));
    ok(ov.scrollW <= ov.clientW + 1, `[${l.code}] no h-overflow @${w}`, `${ov.scrollW}>${ov.clientW}`);
  }

  // drawer behaviour at mobile width
  await page.setViewport({ width: 390, height: 844 });
  await new Promise((r) => setTimeout(r, 200));
  const drawer = await page.evaluate(async () => {
    const t = document.querySelector(".nav-toggle");
    const n = document.getElementById("site-nav");
    if (!t || !n) return { found: false };
    const before = t.getAttribute("aria-expanded");
    t.click();
    await new Promise((r) => setTimeout(r, 60));
    const after = t.getAttribute("aria-expanded");
    const visible = getComputedStyle(n).display !== "none";
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await new Promise((r) => setTimeout(r, 60));
    const afterEsc = t.getAttribute("aria-expanded");
    const hiddenAfterEsc = getComputedStyle(n).display === "none";
    return { found: true, before, after, visible, afterEsc, hiddenAfterEsc };
  });
  ok(drawer.found, `[${l.code}] drawer exists`);
  if (drawer.found) {
    ok(drawer.before === "false" && drawer.after === "true", `[${l.code}] aria-expanded flips open`, `${drawer.before}->${drawer.after}`);
    ok(drawer.visible, `[${l.code}] nav visible when open`);
    ok(drawer.afterEsc === "false" && drawer.hiddenAfterEsc, `[${l.code}] Escape closes nav`, `${drawer.afterEsc}`);
  }

  ok(errors.length === 0, `[${l.code}] no page errors`, errors.join(" | ").slice(0, 300));

  // screenshots: desktop + mobile
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(url, { waitUntil: "networkidle2" });
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: join(OUT, `desktop-${l.code}.png`) });

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.goto(url, { waitUntil: "networkidle2" });
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: join(OUT, `mobile-${l.code}.png`) });

  // full-page sweep to prove the lower sections render
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(url, { waitUntil: "networkidle2" });
  await page.evaluate(async () => {
    const step = 700;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 90));
    }
    window.scrollTo(0, 0);
  });
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: join(OUT, `full-${l.code}.png`), fullPage: true });

  await page.close();
}

// --- print card screenshot: tablet width 820 CSS px -> 1240x1712 px @300dpi (10.5 x 14.5 cm)
const cardPage = await browser.newPage();
await cardPage.setViewport({
  width: 820,
  height: Math.round((1712 * 820) / 1240),
  deviceScaleFactor: 1240 / 820,
});
await cardPage.goto(BASE, { waitUntil: "networkidle2" });
await new Promise((r) => setTimeout(r, 700));
await cardPage.screenshot({ path: join(OUT, "tablet-raw.png") });

await browser.close();
server.close();

console.log(`\n${passes.length} passed, ${fails.length} failed`);
if (fails.length) {
  console.log("\nFAILURES:");
  fails.forEach((f) => console.log(" ✗ " + f));
  process.exit(1);
}
console.log("✓ all checks passed");
