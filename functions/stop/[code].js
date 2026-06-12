// Cloudflare Pages Function: serves /stop/<code> with stop-specific SEO metadata.
// Crawlers get a unique title/description/canonical/JSON-LD + crawlable text per bus
// stop (5,000+ indexable pages); the same HTML boots the SPA which auto-loads the stop.

const SITE = 'https://buswhensg.me'; // canonical host (consolidate ranking here)
let STOPS_MAP = null; // cached per isolate

async function getStops(origin) {
  if (STOPS_MAP) return STOPS_MAP;
  try {
    const arr = await (await fetch(`${origin}/stops.json`)).json();
    STOPS_MAP = Object.fromEntries(arr.map((s) => [s.code, s]));
  } catch { STOPS_MAP = {}; }
  return STOPS_MAP;
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const onRequestGet = async ({ params, request }) => {
  const code = String(params.code || '');
  const origin = new URL(request.url).origin;

  // Anything not a 5-digit code → just serve the normal app shell.
  const shell = await (await fetch(`${origin}/index.html`)).text();
  if (!/^\d{5}$/.test(code)) {
    return new Response(shell, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  }

  const stops = await getStops(origin);
  const s = stops[code];
  const name = s ? s.name : `Stop ${code}`;
  const road = s ? s.road : '';
  const url = `${SITE}/stop/${code}`;
  const title = `Bus arrival times at ${name} (${code})${road ? ', ' + road : ''} · BusWhenSG`;
  const desc = `Live bus arrival timings at bus stop ${code} ${name}${road ? ' on ' + road : ''}, Singapore. See when the next buses arrive for every service, plus crowding and the route on a map. Free.`;

  const jsonld = `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BusStop',
    name,
    identifier: code,
    url,
    ...(s ? { geo: { '@type': 'GeoCoordinates', latitude: s.lat, longitude: s.lng } } : {}),
    address: { '@type': 'PostalAddress', streetAddress: road, addressLocality: 'Singapore', addressCountry: 'SG' },
    areaServed: { '@type': 'Country', name: 'Singapore' },
  })}</script>`;

  const seoBlock = `<div class="sr-only" id="seo-intro">
    <h1>Bus arrival times at ${esc(name)} — bus stop ${esc(code)}</h1>
    <p>Live bus arrivals at ${esc(name)}${road ? ', ' + esc(road) : ''}, Singapore (bus stop code ${esc(code)}). See the next buses for every service stopping here (SBS Transit, SMRT, Tower Transit, Go-Ahead), updated in real time, with crowding and the route on a map. Free to use.</p>
  </div>`;

  const html = shell
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*(">)/, `$1${esc(desc)}$2`)
    .replace(/(<link rel="canonical" href=")[^"]*(">)/, `$1${url}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(">)/, `$1${esc(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(">)/, `$1${esc(desc)}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(">)/, `$1${url}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(">)/, `$1${esc(desc)}$2`)
    .replace('</head>', `${jsonld}\n</head>`)
    .replace(/<div class="sr-only" id="seo-intro">[\s\S]*?<\/div>/, seoBlock);

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
};
