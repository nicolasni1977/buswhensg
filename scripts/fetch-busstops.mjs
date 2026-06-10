// Fetch the full LTA DataMall BusStops list (paginated, 500/page) and write a
// compact public/stops.json: [{ code, name, road, lat, lng }, ...].
// Usage: LTA_ACCOUNT_KEY=xxx node scripts/fetch-busstops.mjs
//        (or it reads the key from ./.dev.vars)
import { readFileSync, writeFileSync } from "node:fs";

function readKey() {
  if (process.env.LTA_ACCOUNT_KEY) return process.env.LTA_ACCOUNT_KEY.trim();
  try {
    const m = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8")
      .split(/\r?\n/).find((l) => l.startsWith("LTA_ACCOUNT_KEY="));
    if (m) return m.slice("LTA_ACCOUNT_KEY=".length).trim();
  } catch {}
  throw new Error("No LTA_ACCOUNT_KEY (env or .dev.vars)");
}

const KEY = readKey();
const BASE = "https://datamall2.mytransport.sg/ltaodataservice/BusStops";
const all = [];

for (let skip = 0; ; skip += 500) {
  const res = await fetch(`${BASE}?$skip=${skip}`, {
    headers: { AccountKey: KEY, accept: "application/json" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} at skip=${skip}`);
  const page = (await res.json()).value || [];
  for (const s of page) {
    all.push({
      code: s.BusStopCode,
      name: (s.Description || "").trim(),
      road: (s.RoadName || "").trim(),
      lat: s.Latitude,
      lng: s.Longitude,
    });
  }
  process.stderr.write(`fetched skip=${skip} (+${page.length}) total=${all.length}\n`);
  if (page.length < 500) break;
}

// Keep only well-formed 5-digit codes, dedupe, sort by code.
const seen = new Set();
const stops = all
  .filter((s) => /^\d{5}$/.test(s.code) && !seen.has(s.code) && seen.add(s.code))
  .sort((a, b) => a.code.localeCompare(b.code));

writeFileSync(new URL("../public/stops.json", import.meta.url), JSON.stringify(stops));
process.stderr.write(`wrote public/stops.json with ${stops.length} stops\n`);
