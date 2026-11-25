#!/usr/bin/env node
/**
 * Handover card: 10.5 x 14.5 cm @ 300 dpi = 1240 x 1712 px.
 * Tablet-width (820 CSS px) capture of the top section + overlay with QR (bottom-right)
 * and the Catalan handover line on its side. Writes the dpi into the PNG.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { extname, normalize } from "node:path";
import zlib from "node:zlib";
import puppeteer from "puppeteer";
import QRCode from "qrcode";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IMG = join(ROOT, "assets/img");
const TMP = join(ROOT, "tmp");
mkdirSync(IMG, { recursive: true });
mkdirSync(TMP, { recursive: true });

const SITE_URL = process.env.SITE_URL || "https://yourdataweb.github.io/lagambarrada/";
const W = 1240, H = 1712; // 10.5cm x 14.5cm @300dpi

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".png": "image/png", ".jpg": "image/jpeg",
  ".webmanifest": "application/manifest+json", ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
};
const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const file = normalize(join(ROOT, p));
  if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); res.end("404"); return; }
  res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const browser = await puppeteer.launch({ args: ["--no-sandbox", "--font-render-hinting=none"] });

/* ---- 1. tablet capture of the top section ---- */
const page = await browser.newPage();
// 820 CSS px = tablet layout (above the 640/900 mobile-navigation thresholds)
await page.setViewport({ width: 820, height: 1200, deviceScaleFactor: 2 });
await page.goto(BASE, { waitUntil: "networkidle2" });
await page.evaluate(async () => { await document.fonts.ready; });
await new Promise((r) => setTimeout(r, 800));
// reveal animations: force visible so nothing is half-faded in the card
await page.evaluate(() => document.querySelectorAll(".reveal").forEach((e) => e.classList.add("is-visible")));
await new Promise((r) => setTimeout(r, 400));
const shot = await page.screenshot({ encoding: "base64", clip: { x: 0, y: 0, width: 820, height: 1200 } });
writeFileSync(join(TMP, "tablet-top.png"), Buffer.from(shot, "base64"));

/* ---- 2. QR pointing at the live URL ---- */
const qrDataUrl = await QRCode.toDataURL(SITE_URL, {
  errorCorrectionLevel: "M",
  margin: 1,
  width: 520,
  color: { dark: "#06202a", light: "#ffffff" },
});

/* ---- 3. compose the card ---- */
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const card = await browser.newPage();
await card.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await card.setContent(
  `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  @font-face{font-family:Fraunces;src:url("file://${join(ROOT, "assets/fonts/fraunces-latin.woff2")}") format("woff2");font-weight:400 700}
  @font-face{font-family:Inter;src:url("file://${join(ROOT, "assets/fonts/inter-latin.woff2")}") format("woff2");font-weight:400 600}
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{width:${W}px;height:${H}px;background:#06202a}
  .card{position:relative;width:${W}px;height:${H}px;overflow:hidden}
  .shot{position:absolute;inset:0;width:${W}px;height:${H}px;object-fit:cover;object-position:top center}
  .fade{position:absolute;inset:0;background:linear-gradient(to bottom,
        rgba(6,32,42,0) 52%, rgba(6,32,42,.55) 68%, rgba(6,32,42,.92) 82%, #06202a 93%)}
  .overlay{position:absolute;left:0;right:0;bottom:0;padding:0 64px 60px;display:flex;align-items:flex-end;gap:40px}
  .copy{flex:1 1 auto;padding-bottom:14px}
  .kicker{display:flex;align-items:center;gap:12px;font:600 17px/1 Inter,sans-serif;
          letter-spacing:.2em;text-transform:uppercase;color:#d9a02c;margin-bottom:18px}
  .kicker::before{content:"";width:34px;height:2px;background:currentColor;display:block}
  .line{font:600 40px/1.16 Fraunces,Georgia,serif;letter-spacing:-.02em;color:#fdfaf4}
  .url{display:inline-block;margin-top:16px;font:600 20px/1.35 Inter,sans-serif;
       color:#8fc4cf;word-break:break-all}
  .qr{flex:none;background:#fff;border-radius:22px;padding:16px;box-shadow:0 24px 48px -18px rgba(0,0,0,.6)}
  .qr img{display:block;width:272px;height:272px}
  </style></head><body>
  <div class="card">
    <img class="shot" src="data:image/png;base64,${shot}">
    <div class="fade"></div>
    <div class="overlay">
      <div class="copy">
        <div class="kicker">La Gambarrada</div>
        <div class="line">Ja tens pàgina web:</div>
        <div class="url">${esc(SITE_URL)}</div>
      </div>
      <div class="qr"><img src="${qrDataUrl}" alt=""></div>
    </div>
  </div>
  </body></html>`,
  { waitUntil: "load" }
);
await card.evaluate(() => document.fonts.ready);
await new Promise((r) => setTimeout(r, 500));
const fit = await card.evaluate(() => {
  const out = {};
  document.querySelectorAll(".line, .url, .qr").forEach((el) => {
    const r = el.getBoundingClientRect();
    out[el.className] = {
      w: Math.round(r.width), h: Math.round(r.height),
      x: Math.round(r.x), y: Math.round(r.y),
      overflowRight: Math.round(r.right) > 1240,
      scrollOverflow: el.scrollWidth > el.clientWidth + 1,
    };
  });
  return out;
});
console.log("card layout:", JSON.stringify(fit));
const png = await card.screenshot({ type: "png" });
await browser.close();
server.close();

/* ---- 4. write 300 dpi into the PNG (pHYs) ---- */
function setDpiPng(buf, dpi) {
  // locate IHDR end, insert pHYs right after it
  let off = 8; // signature
  const chunks = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    chunks.push({ type, start: off, total: 12 + len });
    off += 12 + len;
    if (type === "IEND") break;
  }
  const ppm = Math.round(dpi / 0.0254); // pixels per metre
  const data = Buffer.alloc(9);
  data.writeUInt32BE(ppm, 0);
  data.writeUInt32BE(ppm, 4);
  data.writeUInt8(1, 8); // unit: metre
  const crc = zlib.crc32(Buffer.concat([Buffer.from("pHYs", "ascii"), data]));
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write("pHYs", 4, "ascii");
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc >>> 0, 8 + data.length);

  const ihdr = chunks.find((c) => c.type === "IHDR");
  const insertAt = ihdr.start + ihdr.total;
  const withoutExisting = stripPhys(buf, chunks);
  return finish(withoutExisting, insertAt, chunk);
}
function stripPhys(buf, chunks) {
  const phys = chunks.find((c) => c.type === "pHYs");
  if (!phys) return buf;
  return Buffer.concat([buf.slice(0, phys.start), buf.slice(phys.start + phys.total)]);
}
function finish(buf, insertAt, chunk) {
  return Buffer.concat([buf.slice(0, insertAt), chunk, buf.slice(insertAt)]);
}

const outPath = join(ROOT, "assets/photos/handover.png");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, setDpiPng(png, 300));
console.log("✓ assets/photos/handover.png", `${W}x${H}`, "300 dpi");
