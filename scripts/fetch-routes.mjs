// Fetch the full LTA DataMall BusRoutes list (paginated, 500/page) and write
// public/routes.json: { "<ServiceNo>:<Direction>": [stopCode, ...ordered by StopSequence] }
// Usage: node scripts/fetch-routes.mjs  (reads key from env or ./.dev.vars)
import { readFileSync, writeFileSync } from 'node:fs';

function readKey() {
  if (process.env.LTA_ACCOUNT_KEY) return process.env.LTA_ACCOUNT_KEY.trim();
  const m = readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8')
    .split(/\r?\n/).find((l) => l.startsWith('LTA_ACCOUNT_KEY='));
  if (m) return m.slice('LTA_ACCOUNT_KEY='.length).trim();
  throw new Error('No LTA_ACCOUNT_KEY');
}

const KEY = readKey();
const BASE = 'https://datamall2.mytransport.sg/ltaodataservice/BusRoutes';
const rows = [];
for (let skip = 0; ; skip += 500) {
  const res = await fetch(`${BASE}?$skip=${skip}`, { headers: { AccountKey: KEY, accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} at skip=${skip}`);
  const page = (await res.json()).value || [];
  rows.push(...page);
  process.stderr.write(`skip=${skip} (+${page.length}) total=${rows.length}\n`);
  if (page.length < 500) break;
}

// Group by ServiceNo:Direction, keep stops ordered by StopSequence.
const grouped = {};
for (const r of rows) {
  const key = `${r.ServiceNo}:${r.Direction}`;
  (grouped[key] ||= []).push([r.StopSequence, r.BusStopCode]);
}
const routes = {};
for (const [key, list] of Object.entries(grouped)) {
  list.sort((a, b) => a[0] - b[0]);
  routes[key] = list.map((x) => x[1]);
}

writeFileSync(new URL('../public/routes.json', import.meta.url), JSON.stringify(routes));
process.stderr.write(`wrote public/routes.json: ${Object.keys(routes).length} service-directions\n`);
