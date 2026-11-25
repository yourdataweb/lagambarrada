# La Gambarrada — website

Static marketing site for **Restaurant La Gambarrada** (Passeig del Carme, 22 — Vilanova i la Geltrú).

Three languages, server-rendered HTML per locale, no framework, no build step required at
runtime. Everything is plain HTML, CSS and a small progressive-enhancement script.

## Live site

- Spanish (default): `/`
- Catalan: `/ca/`
- English: `/en/`

## Structure

```
index.html              Spanish (default locale)
ca/index.html           Catalan
en/index.html           English
src/template.html       single template used by the build
src/data.json           business data (address, phone, coordinates, rating)
src/i18n/{es,ca,en}.json  all copy, per locale
scripts/build.mjs       emits the three locale pages + sitemap.xml, robots.txt, site.webmanifest
scripts/assets.mjs      generates app icons and the Open Graph image
scripts/card.mjs        generates assets/photos/handover.png (10.5 x 14.5 cm @300 dpi)
scripts/verify.mjs      checks the built output in a headless browser
assets/css/styles.css   all styles, responsive from 320 px up
assets/js/main.js       mobile navigation, scroll reveal, cookie consent, lazy map
assets/fonts/           self-hosted Fraunces and Inter (woff2 subset)
assets/img/             logo, icons, hero artwork, OG image
assets/photos/          handover card
```

## Build

Requires Node 20+ and `puppeteer` for the asset scripts.

```bash
node scripts/build.mjs     # regenerate the three locale pages
node scripts/assets.mjs    # regenerate icons and og-image.jpg
node scripts/card.mjs      # regenerate the handover card
node scripts/verify.mjs    # headless verification of the built output
```

`scripts/build.mjs` fails on any unresolved template placeholder or on invalid JSON-LD, so a
green build means every string was actually interpolated.

## Editing content

Text lives in `src/i18n/*.json`; shared business facts live in `src/data.json`. Change those,
run `node scripts/build.mjs`, commit the regenerated HTML. Do not hand-edit the generated
`index.html` files — they are overwritten.

## Technical notes

- **SEO**: per-locale `<title>`, description, canonical, reciprocal `hreflang` (including
  `x-default`), Open Graph and Twitter cards, `sitemap.xml` with alternates, `robots.txt`,
  and `Restaurant` structured data (address, geo, telephone, cuisine, aggregate rating).
- **Accessibility**: single `h1` per page, skip link, landmark elements, visible focus rings,
  4.5:1 body contrast, `aria-expanded` on the navigation toggle, Escape closes the drawer,
  descriptive `alt` on content images, decorative SVG marked `aria-hidden`.
- **Performance**: self-hosted woff2 subsets preloaded, one CSS file, one deferred JS file,
  SVG hero artwork, no third-party requests until the visitor opts into the map.
- **Privacy / GDPR**: only technical storage; the Google Maps embed is not requested until the
  visitor accepts third-party cookies (or presses "Load the map"). Choice is stored in
  `localStorage` under `lg-cookie-consent`.
- **Design**: Mediterranean palette (deep sea, sand, ember), Fraunces for headings and Inter
  for text. No price-per-person and no opening hours are displayed.

## Hosting

GitHub Pages, served from the `main` branch root. All asset paths are relative, so the site
also works from any subdirectory or S3 prefix.
