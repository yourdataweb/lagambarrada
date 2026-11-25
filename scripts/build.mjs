#!/usr/bin/env node
/**
 * Static-site build: one template + one dictionary per locale -> real HTML per locale.
 * Emits:  index.html (es, default)   ca/index.html   en/index.html
 * Fails if any template hole survives into the output.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const write = (p, s) => {
  const full = join(ROOT, p);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, s);
};

/* ------------------------------------------------------------------ *
 * Tiny mustache-ish renderer: {{a.b}} {{{raw}}} {{#each x}} {{#if y}}
 * ------------------------------------------------------------------ */
function tokenize(src) {
  const out = [];
  const re = /\{\{\{([\s\S]+?)\}\}\}|\{\{([\s\S]+?)\}\}/g;
  let last = 0, m;
  while ((m = re.exec(src))) {
    if (m.index > last) out.push({ t: "text", v: src.slice(last, m.index) });
    out.push(
      m[1] !== undefined
        ? { t: "raw", v: m[1].trim() }
        : { t: "tag", v: m[2].trim() }
    );
    last = m.index + m[0].length;
  }
  if (last < src.length) out.push({ t: "text", v: src.slice(last) });
  return out;
}

function parse(tokens) {
  const root = { children: [] };
  const stack = [root];
  for (const tok of tokens) {
    const top = stack[stack.length - 1];
    if (tok.t === "text") {
      top.children.push(tok);
      continue;
    }
    if (tok.t === "raw") {
      top.children.push({ t: "raw", path: tok.v });
      continue;
    }
    const v = tok.v;
    if (v.startsWith("#each ")) {
      const node = { t: "each", path: v.slice(6).trim(), children: [] };
      top.children.push(node);
      stack.push(node);
    } else if (v.startsWith("#if ")) {
      const node = { t: "if", path: v.slice(4).trim(), children: [], alt: [] };
      top.children.push(node);
      stack.push(node);
    } else if (v === "else") {
      const node = top;
      if (node.t !== "if") throw new Error("{{else}} outside {{#if}}");
      node.inAlt = true;
      stack.push({ children: node.alt, virtual: true, parent: node });
    } else if (v.startsWith("/each") || v.startsWith("/if")) {
      let popped = stack.pop();
      if (popped.virtual) popped = stack.pop();
      if (popped.t !== v.slice(1)) throw new Error(`Mismatched closing ${v}`);
    } else {
      top.children.push({ t: "var", path: v });
    }
  }
  if (stack.length !== 1) throw new Error("Unclosed block in template");
  return root.children;
}

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function lookup(path, ctx) {
  if (path === "this" || path === ".") return ctx.value;
  let cur;
  let rest = path;
  if (path.startsWith("@root.")) {
    cur = ctx.root;
    rest = path.slice(6);
  } else if (path.startsWith("this.")) {
    cur = ctx.value;
    rest = path.slice(5);
  } else {
    // walk: prefer current scope, then root
    const tryWalk = (start) => {
      let c = start;
      for (const k of path.split(".")) {
        if (c == null) return undefined;
        c = c[k];
      }
      return c;
    };
    const local = tryWalk(ctx.value);
    if (local !== undefined) return local;
    return tryWalk(ctx.root);
  }
  for (const k of rest.split(".")) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}

function render(nodes, ctx) {
  let out = "";
  for (const n of nodes) {
    if (n.t === "text") out += n.v;
    else if (n.t === "var") {
      const val = lookup(n.path, ctx);
      if (val === undefined || val === null) {
        throw new Error(`Unresolved template key: {{${n.path}}}`);
      }
      out += esc(val);
    } else if (n.t === "raw") {
      const val = lookup(n.path, ctx);
      if (val === undefined || val === null) {
        throw new Error(`Unresolved template key: {{{${n.path}}}}`);
      }
      out += String(val);
    } else if (n.t === "if") {
      const val = lookup(n.path, ctx);
      const truthy = Array.isArray(val) ? val.length > 0 : !!val;
      out += render(truthy ? n.children : n.alt, ctx);
    } else if (n.t === "each") {
      const list = lookup(n.path, ctx);
      if (!Array.isArray(list)) throw new Error(`{{#each ${n.path}}} is not an array`);
      list.forEach((item, i) => {
        out += render(n.children, {
          ...ctx,
          value: item,
          index: i,
        });
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Icons
 * ------------------------------------------------------------------ */
const ico = (paths) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const ICONS = {
  dine: ico('<path d="M4 3v8a3 3 0 0 0 6 0V3"/><path d="M7 11v10"/><path d="M17 3c-1.4 1.6-2 3.4-2 5.5S16 12 17 13v8"/>'),
  reserve: ico('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 11h18"/><path d="m9.5 16 1.8 1.8 3.4-3.6"/>'),
  outdoor: ico('<path d="M12 3v3"/><path d="M4 21h16"/><path d="M12 21V9"/><path d="M12 9 6 15h12L12 9Z"/>'),
  groups: ico('<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.2a3.2 3.2 0 0 1 0 5.6"/><path d="M17.5 14.4A5.6 5.6 0 0 1 21.5 20"/>'),
  kids: ico('<circle cx="12" cy="7" r="4"/><path d="M5.5 21a6.5 6.5 0 0 1 13 0"/><path d="M9 7h.01M15 7h.01"/><path d="M10 9.5c1.2.9 2.8.9 4 0"/>'),
  dessert: ico('<path d="M6 10h12l-1.2 8.2A2 2 0 0 1 14.8 20H9.2a2 2 0 0 1-2-1.8L6 10Z"/><path d="M8 10a4 4 0 0 1 8 0"/><path d="M12 6V4"/>'),
  payment: ico('<rect x="2" y="5" width="20" height="14" rx="2.5"/><path d="M2 10h20"/><path d="M6 15h4"/>'),
  access: ico('<circle cx="12" cy="4.5" r="1.6"/><path d="M12 8v5h4"/><path d="M12 13a4.6 4.6 0 1 0 4.3 6.3"/><path d="M17.5 15.5h3.5"/>'),
  parking: ico('<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M9.5 17V7.5h3.2a3 3 0 0 1 0 6H9.5"/>'),
  wave: ico('<path d="M2 8c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 20c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/>'),
};

/* Flags (inline SVG, 3:2) */
const FLAGS = {
  es: '<svg viewBox="0 0 24 16"><rect width="24" height="16" fill="#c60b1e"/><rect y="4" width="24" height="8" fill="#ffc400"/></svg>',
  ca: '<svg viewBox="0 0 24 16"><rect width="24" height="16" fill="#fcdd09"/><g fill="#da121a"><rect y="1.6" width="24" height="1.6"/><rect y="6.4" width="24" height="1.6"/><rect y="11.2" width="24" height="1.6"/></g></svg>',
  en: '<svg viewBox="0 0 24 16"><rect width="24" height="16" fill="#00247d"/><path d="M0 0 24 16M24 0 0 16" stroke="#fff" stroke-width="3.2"/><path d="M0 0 24 16M24 0 0 16" stroke="#cf142b" stroke-width="1.6"/><path d="M12 0v16M0 8h24" stroke="#fff" stroke-width="5.2"/><path d="M12 0v16M0 8h24" stroke="#cf142b" stroke-width="3"/>  </svg>',
};

/* ------------------------------------------------------------------ *
 * Data
 * ------------------------------------------------------------------ */
const biz = JSON.parse(read("src/data.json"));
const SITE_URL = process.env.SITE_URL || biz.siteUrl;

const LANGS = [
  { code: "es", name: "Español", dir: "" },
  { code: "ca", name: "Català", dir: "ca/" },
  { code: "en", name: "English", dir: "en/" },
];
const DEFAULT_LANG = "es";
const LOCALES = LANGS.map((l) => l.code);

// Only keep locales we actually have dictionaries for.
const dicts = {};
for (const code of LOCALES) dicts[code] = JSON.parse(read(`src/i18n/${code}.json`));

/* Derived business values */
const addressQuery = encodeURIComponent(
  `${biz.legalName}, ${biz.street}, ${biz.postalCode} ${biz.city}, ${biz.region}`
);
const coords = `${biz.latitude},${biz.longitude}`;

const links = {
  place: "https://maps.google.com/?cid=2712153289287698489",
  directions: `https://www.google.com/maps/dir/?api=1&destination=${coords}`,
  reviews: "https://www.google.com/maps/place//data=!4m4!3m3!1s0x12a387115aeea807:0x25a3810c08668839!9m1!1b1",
  mapEmbed: (hl) =>
    `https://www.google.com/maps?q=${biz.latitude},${biz.longitude}&hl=${hl}&z=16&output=embed`,
};

/* Feature cards: derived from the data, per locale titles */
const featuredKeys = [
  "dineIn", "reserve", "outdoor", "groups", "kids", "dessert", "payment", "access", "parking",
];
const iconFor = {
  dineIn: ICONS.dine, reserve: ICONS.reserve, outdoor: ICONS.outdoor,
  groups: ICONS.groups, kids: ICONS.kids, dessert: ICONS.dessert,
  payment: ICONS.payment, access: ICONS.access, parking: ICONS.parking,
};

const dishKeys = ["mussels", "croquettes", "squid", "rice", "tapas", "carpaccio"];
const quoteKeys = ["r1", "r2", "r3", "r4"];

const ratingLabelFor = (lang, n) =>
  ({ es: `${n} de 5 estrellas`, ca: `${n} de 5 estrelles`, en: `${n} out of 5 stars` }[lang]);

/* ------------------------------------------------------------------ *
 * JSON-LD
 * ------------------------------------------------------------------ */
function jsonLd(t, lang) {
  const data = {
    "@context": "https://schema.org",
    "@type": "Restaurant",
    "@id": `${SITE_URL}/#restaurant`,
    name: biz.legalName,
    url: SITE_URL,
    image: `${SITE_URL}/assets/img/og-image.jpg`,
    telephone: biz.phoneE164,
    servesCuisine: ["Mediterranean", "Spanish", "Tapas", "European"],
    priceRange: "€€",
    address: {
      "@type": "PostalAddress",
      streetAddress: biz.street,
      postalCode: biz.postalCode,
      addressLocality: biz.city,
      addressRegion: biz.region,
      addressCountry: biz.country,
    },
    geo: { "@type": "GeoCoordinates", latitude: biz.latitude, longitude: biz.longitude },
    hasMap: links.place,
    acceptsReservations: "https://schema.org/True",
    menu: biz.website,
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: biz.rating,
      reviewCount: biz.ratingCount,
      bestRating: 5,
      worstRating: 1,
    },
    amenityFeature: [
      { "@type": "LocationFeatureSpecification", name: "Outdoor seating", value: true },
      { "@type": "LocationFeatureSpecification", name: "Wheelchair accessible entrance", value: true },
      { "@type": "LocationFeatureSpecification", name: "Good for groups", value: true },
    ],
    inLanguage: lang,
  };
  return JSON.stringify(data, null, 2);
}

/* ------------------------------------------------------------------ *
 * Build
 * ------------------------------------------------------------------ */
const templateSrc = read("src/template.html");
const ast = parse(tokenize(templateSrc));
const YEAR = new Date().getFullYear();

function buildLocale(lang) {
  const t = dicts[lang];
  const prefix = t.pathPrefix;
  const others = LANGS.filter((l) => l.code !== lang);

  const alternates = LANGS.map((l) => ({
    hreflang: l.code === "es" ? "es-ES" : l.code === "ca" ? "ca-ES" : "en-GB",
    path: l.dir,
  }));
  alternates.push({ hreflang: "x-default", path: "" });

  const langs = LANGS.map((l) => ({
    code: l.code,
    name: l.name,
    flag: FLAGS[l.code],
    current: l.code === lang,
    href: prefix + l.dir,
  }));

  const ctx = {
    root: {},
    value: {},
  };
  const model = {
    meta: {
      lang,
      title: t.meta.title,
      description: t.meta.description,
      ogAlt: t.meta.ogAlt,
      ogLocale: t.ogLocale,
      assetBase: prefix,
      canonicalPath: lang === DEFAULT_LANG ? "" : lang + "/",
    },
    site: { url: SITE_URL },
    business: {
      name: biz.name,
      street: biz.street,
      postalCode: biz.postalCode,
      city: biz.city,
      cityShort: biz.city,
      region: biz.region,
      countryName: "España",
      phoneNational: biz.phoneNational,
      phoneE164: biz.phoneE164,
      website: biz.website,
      websiteHost: biz.website.replace(/^https?:\/\//, "").replace(/\/$/, ""),
      rating: biz.rating,
      ratingFormatted: biz.rating.toFixed(1),
      ratingCount: biz.ratingCount.toLocaleString(lang === "en" ? "en-GB" : "es-ES"),
      plusCode: "6P8G+4P Vilanova i la Geltrú",
    },
    links: {
      place: links.place,
      directions: links.directions,
      reviews: links.reviews,
      mapEmbed: links.mapEmbed(lang),
    },
    t,
    langs,
    alternates,
    year: YEAR,
    jsonLd: jsonLd(t, lang),
    featureCards: featuredKeys.map((k) => ({
      icon: iconFor[k],
      title: t.features.items[k].title,
      text: t.features.items[k].text,
    })),
    dishes: dishKeys.map((k) => ({
      title: t.menu.items[k].title,
      text: t.menu.items[k].text,
    })),
    quotes: quoteKeys.map((k, i) => {
      const q = t.reviews.items[k];
      const stars = [5, 5, 5, 5][i];
      return {
        text: q.text,
        author: q.author,
        meta: q.meta,
        initial: q.author.trim().charAt(0).toUpperCase(),
        ratingLabel: ratingLabelFor(lang, stars),
        stars: Array.from({ length: stars }, (_, s) => ({ s })),
      };
    }),
  };

  const html = render(ast, { root: model, value: model });

  // Gate: no unresolved holes, no stray marker comments
  if (/\{\{|\}\}/.test(html)) {
    const m = html.match(/.{0,60}\{\{.{0,60}/);
    throw new Error(`[${lang}] unresolved template hole near: ${m && m[0]}`);
  }
  if (/href=""/.test(html) || /src=""/.test(html)) {
    throw new Error(`[${lang}] empty href/src emitted`);
  }
  // JSON-LD must parse
  const ld = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!ld) throw new Error(`[${lang}] JSON-LD block missing`);
  JSON.parse(ld[1]);

  const target = lang === DEFAULT_LANG ? "index.html" : `${lang}/index.html`;
  write(target, html);
  console.log(`✓ ${target} (${(html.length / 1024).toFixed(1)} kB)`);
}

for (const l of LANGS) buildLocale(l.code);

/* sitemap + robots + manifest */
const today = new Date().toISOString().slice(0, 10);
write(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${LANGS.map((l) => {
    const loc = `${SITE_URL}/${l.dir}`;
    const alts = LANGS.map(
      (o) => `    <xhtml:link rel="alternate" hreflang="${o.code}" href="${SITE_URL}/${o.dir}"/>`
    ).join("\n");
    return `  <url>
    <loc>${loc}</loc>
${alts}
    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}/"/>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${l.code === DEFAULT_LANG ? "1.0" : "0.8"}</priority>
  </url>`;
  }).join("\n")}
</urlset>
`
);
write("robots.txt", `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`);
write("site.webmanifest", JSON.stringify({
  name: biz.legalName,
  short_name: biz.name,
  start_url: "./",
  display: "standalone",
  background_color: "#fdfaf4",
  theme_color: "#0a2f3b",
  icons: [{ src: "assets/img/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "assets/img/icon-512.png", sizes: "512x512", type: "image/png" }],
}, null, 2) + "\n");

console.log("✓ sitemap.xml, robots.txt, site.webmanifest");
