# BusWhenSG 🚌

A free, dead-simple web app for live bus arrival times in Singapore. Open it, allow location (or type a 5-digit stop code), and see the next arrivals per service — built for everyone, including the elderly, children, and visitors.

**Live:** https://buswhensg.me

## Features

- **Live arrivals** from the LTA DataMall API (next buses per service, with crowding and wheelchair-accessibility indicators)
- **Search** by 5-digit bus stop code
- **Near Me** — geolocation finds your nearest stop (location stays on-device)
- **Top-5 favourites** — remembers the stops you check most
- **Three languages** — English / 简体中文 / Bahasa Melayu
- **Accessible** — large text, high contrast, dark/light, keyboard navigation
- **OneMap mini-map** (Singapore Land Authority basemap; no Google dependency)

## Architecture

A static frontend + a Cloudflare Pages Function proxy:

- `public/` — the static app (HTML/CSS/JS), served from Cloudflare's edge
- `functions/api/arrival.js` — Pages Function that injects the secret LTA `AccountKey`, calls DataMall, adds CORS, and normalises the response. **The key is never exposed to the browser.**

The browser cannot call LTA DataMall directly (it requires a secret header and sends no CORS headers), so all arrival requests go through `/api/arrival?stop=CODE`.

## Local development

Requires Node 20+ and a free [LTA DataMall AccountKey](https://datamall.lta.gov.sg/content/datamall/en/request-for-api.html).

```bash
npm install
cp .dev.vars.example .dev.vars     # then paste your AccountKey into .dev.vars
npm run dev                        # → http://localhost:8788
```

`.dev.vars` is gitignored — your key is never committed.

## Deploy (Cloudflare Pages, free tier)

```bash
npx wrangler login
npx wrangler pages project create buswhensg --production-branch main
npx wrangler pages secret put LTA_ACCOUNT_KEY --project-name buswhensg   # production key
npx wrangler pages deploy public --project-name buswhensg
```

The `LTA_ACCOUNT_KEY` secret is set on the Cloudflare project (the production equivalent of `.dev.vars`) — it is **not** read from this repo.

## Attribution

- Bus data © [LTA DataMall](https://datamall.lta.gov.sg/)
- Map tiles © OneMap, © Singapore Land Authority

## License

MIT
