#!/usr/bin/env node
/**
 * Generates brand assets: icons + OG image, from local SVG (no external fetches).
 * Run: node scripts/assets.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "assets/img");
mkdirSync(OUT, { recursive: true });

const favicon = readFileSync(join(OUT, "favicon.svg"), "utf8");
const dataUri = "data:image/svg+xml;base64," + Buffer.from(favicon).toString("base64");

const browser = await puppeteer.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage();

// ---- icons ----
for (const size of [180, 192, 512]) {
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(
    `<!DOCTYPE html><html><head><style>
      html,body{margin:0;padding:0;background:transparent}
      img{display:block;width:${size}px;height:${size}px}
    </style></head><body><img src="${dataUri}"></body></html>`,
    { waitUntil: "load" }
  );
  const name = size === 180 ? "apple-touch-icon.png" : `icon-${size}.png`;
  await page.screenshot({ path: join(OUT, name), omitBackground: true });
  console.log("✓", name);
}

// ---- OG image 1200x630 ----
const hero = readFileSync(join(OUT, "hero.svg"), "utf8");
const heroUri =
  "data:image/svg+xml;base64," + Buffer.from(hero).toString("base64");

await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
await page.setContent(
  `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @font-face{font-family:Fraunces;src:url("file://${join(ROOT, "assets/fonts/fraunces-latin.woff2")}") format("woff2");font-weight:400 700}
    @font-face{font-family:Inter;src:url("file://${join(ROOT, "assets/fonts/inter-latin.woff2")}") format("woff2");font-weight:400 600}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;width:1200px;height:630px}
    .card{position:relative;width:1200px;height:630px;overflow:hidden;background:#0a2f3b}
    .art{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:62% 55%}
    .scrim{position:absolute;inset:0;background:linear-gradient(100deg,rgba(6,32,42,.94) 0%,rgba(6,32,42,.86) 46%,rgba(6,32,42,.34) 100%)}
    .body{position:absolute;inset:0;padding:64px 72px;display:flex;flex-direction:column;justify-content:center;color:#fdfaf4}
    .eyebrow{font:600 15px/1 Inter,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#d9a02c;margin:0 0 22px;display:flex;align-items:center;gap:12px}
    .eyebrow::before{content:"";width:32px;height:2px;background:currentColor;display:block}
    h1{font:600 66px/1.04 Fraunces,Georgia,serif;letter-spacing:-.025em;margin:0 0 20px;max-width:760px;color:#fff}
    .sub{font:400 21px/1.5 Inter,sans-serif;color:rgba(253,250,244,.85);margin:0 0 34px;max-width:600px}
    .meta{display:flex;align-items:center;gap:14px}
    .pill{display:inline-flex;align-items:center;gap:9px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.28);border-radius:999px;padding:11px 20px;font:600 16px/1 Inter,sans-serif;color:#fff}
    .star{width:17px;height:17px;fill:#d9a02c}
    .addr{font:500 16px/1 Inter,sans-serif;color:rgba(253,250,244,.75)}
    .mark{position:absolute;right:64px;top:56px;width:64px;height:64px;opacity:.95}
  </style></head><body>
  <div class="card">
    <img class="art" src="${heroUri}">
    <div class="scrim"></div>
    <svg class="mark" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="rgba(10,47,59,.55)" stroke="rgba(217,160,44,.5)"/><path d="M16 40c4 2.6 8 3.8 16 3.8S44 42.6 48 40" stroke="#d9a02c" stroke-width="3.4" fill="none" stroke-linecap="round"/><path d="M19 32c3-4 6.4-6 13-6s10 2 13 6" stroke="#8fc4cf" stroke-width="3.4" fill="none" stroke-linecap="round"/><circle cx="32" cy="19.6" r="3.2" fill="#d9a02c"/></svg>
    <div class="body">
      <p class="eyebrow">Vilanova i la Geltrú · Passeig del Carme</p>
      <h1>La Gambarrada</h1>
      <p class="sub">Cocina mediterránea de mar, brasa de leña y producto de lonja frente al paseo marítimo.</p>
      <div class="meta">
        <span class="pill"><svg class="star" viewBox="0 0 24 24"><path d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.4l-5.8 3.1 1.1-6.45-4.7-4.6 6.5-.95L12 2.6Z"/></svg>4,6 · 1.009 opiniones</span>
        <span class="addr">Pg. del Carme, 22 · 934 86 07 13</span>
      </div>
    </div>
  </div>
  </body></html>`,
  { waitUntil: "load" }
);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(OUT, "og-image.jpg"), type: "jpeg", quality: 88 });
console.log("✓ og-image.jpg");

await browser.close();
