// Build public/sitemap.xml: the homepage + one URL per bus stop (/stop/<code>).
// Run: node scripts/build-sitemap.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const SITE = 'https://buswhensg.me';
const stops = JSON.parse(readFileSync(new URL('../public/stops.json', import.meta.url), 'utf8'));
const routes = JSON.parse(readFileSync(new URL('../public/routes.json', import.meta.url), 'utf8'));

// Unique service numbers (strip the :direction suffix from routes.json keys).
const services = [...new Set(Object.keys(routes).map((k) => k.split(':')[0]))].sort();

const urls = [
  `  <url><loc>${SITE}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
  ...services.map((svc) => `  <url><loc>${SITE}/bus/${svc}</loc><changefreq>daily</changefreq><priority>0.7</priority></url>`),
  ...stops.map((s) => `  <url><loc>${SITE}/stop/${s.code}</loc><changefreq>daily</changefreq><priority>0.6</priority></url>`),
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
writeFileSync(new URL('../public/sitemap.xml', import.meta.url), xml);
process.stderr.write(`wrote public/sitemap.xml with ${urls.length} URLs\n`);
