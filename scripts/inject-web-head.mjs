// Adds the head tags that crawlers and link unfurlers need to dist/index.html
// after `expo export --platform web`.
//
// Why a post-build step instead of app/+html.tsx: that file is only rendered
// when web output is "static". This app exports as a single-page bundle, where
// Expo writes index.html from its own fixed template and never reads +html.tsx.
// Switching to static output would mean making every screen server-renderable,
// which is a much larger change than adding six meta tags.
//
// Facebook, WhatsApp, X and Google all read the HTML without running the
// bundle, so tags injected at runtime by the app are invisible to them. These
// have to be in the exported file.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const INDEX = path.resolve('dist/index.html');

const SITE_URL = 'https://www.saathi.community';
const TITLE = 'Saathi — verified local help for elders in India';
const DESCRIPTION =
  'Saathi connects elders in Siliguri, Bengaluru and Ahilyanagar to phone-verified local help, and lets family set reminders and check in from anywhere.';
const OG_IMAGE = `${SITE_URL}/og-image.jpg`;

const TAGS = `
    <meta name="description" content="${DESCRIPTION}" />
    <link rel="canonical" href="${SITE_URL}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Saathi" />
    <meta property="og:title" content="${TITLE}" />
    <meta property="og:description" content="${DESCRIPTION}" />
    <meta property="og:url" content="${SITE_URL}" />
    <meta property="og:image" content="${OG_IMAGE}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:locale" content="en_IN" />
    <meta property="og:locale:alternate" content="hi_IN" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${TITLE}" />
    <meta name="twitter:description" content="${DESCRIPTION}" />
    <meta name="twitter:image" content="${OG_IMAGE}" />
    <link rel="manifest" href="/manifest.json" />
    <link rel="apple-touch-icon" href="/icons/icon-192.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="Saathi" />
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="#FFFFFF" />
    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0A0A0A" />
  `;

const html = await readFile(INDEX, 'utf8');

if (html.includes('property="og:title"')) {
  console.log('inject-web-head: tags already present, nothing to do');
  process.exit(0);
}

if (!html.includes('</head>')) {
  console.error('inject-web-head: no </head> in dist/index.html — did the export succeed?');
  process.exit(1);
}

const withTitle = html.replace(
  /<title>[\s\S]*?<\/title>/,
  `<title>${TITLE}</title>`,
);
// viewport-fit=cover keeps the floating tab dock clear of the iPhone home indicator.
const withViewport = withTitle.replace(
  /(<meta name="viewport" content="[^"]*?)(" \/>)/,
  (match, head, tail) => (match.includes('viewport-fit') ? match : `${head}, viewport-fit=cover${tail}`),
);

// The bundle is ~3.7MB. On the mobile networks this app is actually used on
// that is several seconds of blank white page before React paints anything,
// which reads as a broken site to someone who is not sure the tap worked.
// React clears the container when it mounts, so markup placed inside #root is
// the splash and needs no teardown code.
const SPLASH = `
      <div id="saathi-splash" style="position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:#FFFFFF;color:#0A0A0A;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif">
        <div style="font-size:30px;font-weight:600;letter-spacing:-0.5px">Saathi</div>
        <div style="font-size:15px;opacity:0.6">Loading…</div>
        <div style="width:120px;height:3px;border-radius:2px;background:rgba(10,10,10,0.1);overflow:hidden">
          <div style="width:40%;height:100%;border-radius:2px;background:#0A0A0A;animation:saathi-slide 1.1s ease-in-out infinite"></div>
        </div>
      </div>`;

const SPLASH_STYLE = `
    <style id="saathi-splash-style">
      @keyframes saathi-slide { 0% { transform: translateX(-100%) } 100% { transform: translateX(350%) } }
      @media (prefers-color-scheme: dark) {
        #saathi-splash { background: #0A0A0A !important; color: #FFFFFF !important }
        #saathi-splash div[style*="rgba(10,10,10,0.1)"] { background: rgba(255,255,255,0.14) !important }
        #saathi-splash div[style*="background:#0A0A0A"] { background: #FFFFFF !important }
      }
      @media (prefers-reduced-motion: reduce) {
        #saathi-splash div[style*="animation"] { animation: none !important; width: 100% !important }
      }
    </style>
  `;

const withHead = withViewport.replace('</head>', `${TAGS}${SPLASH_STYLE}</head>`);

if (!withHead.includes('<div id="root"></div>')) {
  console.error('inject-web-head: no empty <div id="root"></div> — Expo changed its template');
  process.exit(1);
}

const withSplash = withHead.replace(
  '<div id="root"></div>',
  `<div id="root">${SPLASH}\n    </div>`,
);

await writeFile(INDEX, withSplash, 'utf8');
console.log('inject-web-head: head tags and loading splash written to dist/index.html');
