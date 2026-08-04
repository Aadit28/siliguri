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

await writeFile(INDEX, withViewport.replace('</head>', `${TAGS}</head>`), 'utf8');
console.log('inject-web-head: head tags written to dist/index.html');
