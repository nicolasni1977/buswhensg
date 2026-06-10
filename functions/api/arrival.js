// Cloudflare Pages Function — GET /api/arrival?stop=CODE
// Proxies LTA DataMall v3 BusArrival, injecting the secret AccountKey (never
// exposed to the browser) and adding CORS. Normalises the upstream payload
// into the shape the BusWhenSG frontend renders:
//   [{ service, dest, arrivals: [{ min, crowding, wc }, ...] }, ...]

const LTA_URL = "https://datamall2.mytransport.sg/ltaodataservice/v3/BusArrival";

// LTA Load codes -> app crowding buckets
const LOAD_TO_CROWDING = { SEA: "low", SDA: "med", LSD: "high" };

function minutesFromNow(iso) {
  if (!iso) return null;                       // empty string = no bus
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.round((t - Date.now()) / 60000));
}

function normalizeBus(bus) {
  const min = minutesFromNow(bus && bus.EstimatedArrival);
  if (min === null) return null;
  return {
    min,
    crowding: LOAD_TO_CROWDING[bus.Load] || "low",
    wc: bus.Feature === "WAB",
  };
}

export const onRequestGet = async ({ request, env }) => {
  const headers = {
    "access-control-allow-origin": "*",
    "content-type": "application/json; charset=utf-8",
    "cache-control": "public, max-age=15", // arrivals are real-time; cache briefly
  };

  const stop = new URL(request.url).searchParams.get("stop") || "";
  if (!/^\d{5}$/.test(stop)) {
    return new Response(JSON.stringify({ error: "bad_stop" }), { status: 400, headers });
  }
  if (!env.LTA_ACCOUNT_KEY) {
    return new Response(
      JSON.stringify({ error: "missing_key", detail: "Set LTA_ACCOUNT_KEY in .dev.vars" }),
      { status: 500, headers }
    );
  }

  let upstream;
  try {
    upstream = await fetch(`${LTA_URL}?BusStopCode=${stop}`, {
      headers: { AccountKey: env.LTA_ACCOUNT_KEY, accept: "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: "network", detail: String(e) }), { status: 502, headers });
  }
  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: "upstream", status: upstream.status }), { status: 502, headers });
  }

  const data = await upstream.json();
  const services = (data.Services || [])
    .map((s) => ({
      service: s.ServiceNo,
      // DataMall gives only a destination bus-stop CODE, not a friendly name.
      dest: s.NextBus && s.NextBus.DestinationCode ? `To ${s.NextBus.DestinationCode}` : "",
      arrivals: [s.NextBus, s.NextBus2, s.NextBus3].map(normalizeBus).filter(Boolean),
    }))
    .filter((s) => s.arrivals.length > 0)
    .sort((a, b) => a.arrivals[0].min - b.arrivals[0].min);

  return new Response(JSON.stringify(services), { status: 200, headers });
};
