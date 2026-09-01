const RAW_BASE = 'https://raw.githubusercontent.com/bless25min/SoyaPlayableAd/main/public';

const LEGACY_SOURCES = {
  '/legacy-source/XAUUSD_M5.csv': `${RAW_BASE}/XAUUSD_M5.csv`,
  '/legacy-source/NAS100_M5.csv': `${RAW_BASE}/NAS100_M5.csv`,
  '/legacy-source/BTCUSD_M5.csv': `${RAW_BASE}/BTCUSD_M5.csv`,
  '/legacy-source/SoyaRecord.json': `${RAW_BASE}/SoyaRecord.json`,
  '/legacy-source/KentRecord.json': `${RAW_BASE}/KentRecord.json`,
  // Compatibility aliases for the original relative fetch paths. These prevent
  // SPA fallback from returning index.html when a cached/original main.js asks
  // for SoyaRecord.json or KentRecord.json under a mode directory.
  '/SoyaRecord.json': `${RAW_BASE}/SoyaRecord.json`,
  '/KentRecord.json': `${RAW_BASE}/KentRecord.json`,
  '/classic/SoyaRecord.json': `${RAW_BASE}/SoyaRecord.json`,
  '/classic/KentRecord.json': `${RAW_BASE}/KentRecord.json`,
  '/performance/SoyaRecord.json': `${RAW_BASE}/SoyaRecord.json`,
  '/performance/KentRecord.json': `${RAW_BASE}/KentRecord.json`,
};

const fetchLegacy = async (upstream, contentType) => {
  const response = await fetch(upstream, {
    headers: { 'User-Agent': 'TradeStrategyReplay-Demo' },
  });

  if (!response.ok) {
    return new Response('Legacy demo source unavailable', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'public, max-age=300');
  headers.set('Content-Type', contentType);
  return new Response(response.body, { status: 200, headers });
};

const ghostReplay = async (url) => {
  const instrument = (url.searchParams.get('instrument') || '').toUpperCase();
  const config = instrument === 'XAUUSD'
    ? { file: 'SoyaRecord.json', label: 'SOYA' }
    : instrument === 'NAS100'
      ? { file: 'KentRecord.json', label: 'KENT' }
      : null;

  if (!config) {
    return Response.json([], { headers: { 'Cache-Control': 'no-store' } });
  }

  const upstream = await fetch(`${RAW_BASE}/${config.file}`, {
    headers: { 'User-Agent': 'TradeStrategyReplay-Demo' },
  });
  if (!upstream.ok) {
    return Response.json({ error: `Unable to load ${config.file}` }, { status: 502 });
  }

  let actions = await upstream.json();
  if (!Array.isArray(actions)) actions = [];
  actions = actions.filter((action) => !action.symbol || String(action.symbol).toUpperCase() === instrument);

  const fromSec = Number(url.searchParams.get('fromSec'));
  const toSec = Number(url.searchParams.get('toSec'));
  if (Number.isFinite(fromSec) && Number.isFinite(toSec) && fromSec > 0 && toSec >= fromSec) {
    actions = actions.filter((action) => {
      const time = Number(action.time);
      return Number.isFinite(time) && time >= fromSec && time <= toSec;
    });
  }

  const profit = actions.reduce((sum, action) => {
    const value = Number(action.profit);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  return Response.json([
    {
      instrument,
      session: 'SoyaPlayableAd legacy demo',
      label: config.label,
      equity: 0,
      profit,
      actions: actions.map((action) => ({
        type: action.type,
        time: action.time,
        price: action.price,
        ...(Number.isFinite(Number(action.qty ?? action.volume)) ? { qty: Number(action.qty ?? action.volume) } : {}),
        ...(Number.isFinite(Number(action.profit)) ? { profit: Number(action.profit) } : {}),
      })),
    },
  ], {
    headers: { 'Cache-Control': 'public, max-age=300' },
  });
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/ghost-replay') {
      return ghostReplay(url);
    }

    const upstream = LEGACY_SOURCES[url.pathname];
    if (upstream) {
      return fetchLegacy(
        upstream,
        url.pathname.endsWith('.json')
          ? 'application/json; charset=utf-8'
          : 'text/csv; charset=utf-8',
      );
    }

    return env.ASSETS.fetch(request);
  },
};
