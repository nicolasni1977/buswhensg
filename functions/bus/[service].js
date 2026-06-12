// Cloudflare Pages Function: serves /bus/<service> with route-specific SEO metadata.
// One indexable page per bus service (route, origin→destination, all stops linked to
// their /stop/<code> pages), then boots the SPA.

const SITE = 'https://buswhensg.me';
let STOPS_MAP = null;
let ROUTES = null;

async function load(origin) {
  if (!STOPS_MAP) {
    try {
      const arr = await (await fetch(`${origin}/stops.json`)).json();
      STOPS_MAP = Object.fromEntries(arr.map((s) => [s.code, s]));
    } catch { STOPS_MAP = {}; }
  }
  if (!ROUTES) {
    try { ROUTES = await (await fetch(`${origin}/routes.json`)).json(); } catch { ROUTES = {}; }
  }
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const onRequestGet = async ({ params, request }) => {
  const svc = String(params.service || '').toUpperCase();
  const origin = new URL(request.url).origin;
  const shell = await (await fetch(`${origin}/index.html`)).text();

  await load(origin);
  const stops = (ROUTES[`${svc}:1`] || ROUTES[`${svc}:2`] || []);
  // Unknown service or no route data → serve the normal app shell.
  if (!/^[A-Z0-9]{1,5}$/.test(svc) || stops.length < 2) {
    return new Response(shell, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  }

  const nameOf = (code) => (STOPS_MAP[code] ? STOPS_MAP[code].name : `Stop ${code}`);
  const origin0 = nameOf(stops[0]);
  const dest = nameOf(stops[stops.length - 1]);
  const url = `${SITE}/bus/${svc}`;
  const title = `Bus ${svc} route & arrival times in Singapore · BusWhenSG`;
  const desc = `Bus service ${svc} in Singapore: route from ${origin0} to ${dest}, ${stops.length} stops. Check live bus ${svc} arrival timings at any stop, with crowding and the route on a map. Free.`;

  const jsonld = `<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BusTrip',
    name: `Bus ${svc}`,
    busNumber: svc,
    url,
    departureBusStop: { '@type': 'BusStop', name: origin0 },
    arrivalBusStop: { '@type': 'BusStop', name: dest },
    provider: { '@type': 'Organization', name: 'Singapore public bus (SBS Transit / SMRT / Tower Transit / Go-Ahead)' },
  })}</script>`;

  // Crawlable: list every stop, each linking to its /stop/<code> page (internal link graph).
  const items = stops.map((code, i) =>
    `<li>${i + 1}. <a href="/stop/${esc(code)}">${esc(code)} ${esc(nameOf(code))}</a></li>`).join('');
  const seoBlock = `<div class="sr-only" id="seo-intro">
    <h1>Bus ${esc(svc)} — route &amp; live arrival times in Singapore</h1>
    <p>Bus service ${esc(svc)} runs from ${esc(origin0)} to ${esc(dest)} (${stops.length} stops) in Singapore. Check live bus ${esc(svc)} arrival timings, crowding and the route on a map — free. Stops on the route:</p>
    <ol>${items}</ol>
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
