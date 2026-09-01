const LEGACY_SOURCES = {
  '/legacy-source/XAUUSD_M15.csv': 'https://raw.githubusercontent.com/bless25min/SoyaPlayableAd/main/public/XAUUSD_M15.csv',
  '/legacy-source/NAS100_M15.csv': 'https://raw.githubusercontent.com/bless25min/SoyaPlayableAd/main/public/NAS100_M15.csv',
  '/legacy-source/SoyaRecord.json': 'https://raw.githubusercontent.com/bless25min/SoyaPlayableAd/main/public/SoyaRecord.json',
  '/legacy-source/KentRecord.json': 'https://raw.githubusercontent.com/bless25min/SoyaPlayableAd/main/public/KentRecord.json',
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const upstream = LEGACY_SOURCES[url.pathname];

    if (upstream) {
      const response = await fetch(upstream, {
        headers: { 'User-Agent': 'TradeStrategyReplay-Demo' },
      });

      if (!response.ok) {
        return new Response(`Legacy demo source unavailable: ${url.pathname}`, {
          status: 502,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }

      const headers = new Headers(response.headers);
      headers.set('Cache-Control', 'public, max-age=300');
      headers.set(
        'Content-Type',
        url.pathname.endsWith('.json')
          ? 'application/json; charset=utf-8'
          : 'text/csv; charset=utf-8',
      );
      return new Response(response.body, { status: 200, headers });
    }

    return env.ASSETS.fetch(request);
  },
};
