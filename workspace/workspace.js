(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const SYMBOLS = ['XAUUSD', 'NAS100', 'BTCUSD'];
  const TIMEFRAMES = ['M5', 'M15', 'M30', 'H1', 'H4', 'D1'];
  const BASELINE = 10000;

  const state = {
    charts: [],
    visibleCount: 2,
    playing: false,
    speed: 1,
    currentSec: 0,
    startSec: 0,
    endSec: 0,
    lastRaf: 0,
    chartSeq: 0,
    prices: {},
    strategies: new Map(),
  };

  const builtins = [
    { id: 'none', name: '無策略', builtin: true, actions: [] },
    { id: 'soya', name: 'SOYA', builtin: true, source: '/legacy-source/SoyaRecord.json', actions: null },
    { id: 'kent', name: 'KENT', builtin: true, source: '/legacy-source/KentRecord.json', actions: null },
  ];
  builtins.forEach((s) => state.strategies.set(s.id, s));

  const toSec = (dateStr, endOfDay = false) => {
    if (!dateStr) return 0;
    const suffix = endOfDay ? 'T23:59:59Z' : 'T00:00:00Z';
    return Math.floor(Date.parse(`${dateStr}${suffix}`) / 1000);
  };
  const toDateValue = (sec) => new Date(sec * 1000).toISOString().slice(0, 10);
  const fmtClock = (sec) => new Date(sec * 1000).toLocaleString('zh-TW', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  const parseNum = (v) => {
    const n = Number(String(v ?? '').replace(/,/g, '').trim());
    return Number.isFinite(n) ? n : null;
  };
  const normalizeTime = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value > 1e10 ? Math.floor(value / 1000) : Math.floor(value);
    const raw = String(value ?? '').trim();
    if (/^\d{10,13}$/.test(raw)) {
      const n = Number(raw); return n > 1e10 ? Math.floor(n / 1000) : Math.floor(n);
    }
    const normalized = raw.replace(/\//g, '-').replace(/^(\d{4})\.(\d{2})\.(\d{2})/, '$1-$2-$3').replace(' ', 'T');
    const ms = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(normalized) ? normalized : `${normalized}Z`);
    if (!Number.isFinite(ms)) throw new Error(`無法解析時間：${raw}`);
    return Math.floor(ms / 1000);
  };

  const detectDelimiter = (line) => {
    const counts = [[',', line.split(',').length], ['\t', line.split('\t').length], [';', line.split(';').length]];
    counts.sort((a, b) => b[1] - a[1]);
    return counts[0][1] > 1 ? counts[0][0] : /\s+/;
  };
  const splitQuoted = (line, delimiter) => {
    if (delimiter instanceof RegExp) return line.trim().split(delimiter);
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q;
      } else if (c === delimiter && !q) { out.push(cur.trim()); cur = ''; }
      else cur += c;
    }
    out.push(cur.trim()); return out;
  };
  const parseTable = (text) => {
    const lines = String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n').filter((x) => x.trim());
    if (lines.length < 2) return [];
    const delimiter = detectDelimiter(lines[0]);
    const split = (line) => splitQuoted(line, delimiter);
    const normalizeHeader = (h) => String(h).trim().replace(/^<|>$/g, '').replace(/\s+/g, '_').toLowerCase();
    const headers = split(lines[0]).map(normalizeHeader);
    return lines.slice(1).map((line) => {
      const vals = split(line); const row = {};
      headers.forEach((h, i) => row[h] = vals[i] ?? '');
      return row;
    });
  };

  const completedToActions = (row, defaultSymbol) => {
    const rawSide = String(row.side ?? row.type ?? row.direction ?? '').toUpperCase();
    const side = ['LONG', 'BUY', '多'].includes(rawSide) ? 'LONG' : ['SHORT', 'SELL', '空'].includes(rawSide) ? 'SHORT' : null;
    if (!side) throw new Error(`未知交易方向：${rawSide || '(空白)'}`);
    const symbol = String(row.symbol ?? row.contract ?? row.instrument ?? defaultSymbol).trim().toUpperCase();
    const entryTime = row.entry_time ?? row.entrytime ?? row.open_time ?? row.opentime ?? row.entryTime ?? row.openTime;
    const exitTime = row.exit_time ?? row.exittime ?? row.close_time ?? row.closetime ?? row.exitTime ?? row.closeTime;
    const entryPrice = parseNum(row.entry_price ?? row.entryprice ?? row.open_price ?? row.openprice ?? row.entryPrice ?? row.openPrice);
    const exitPrice = parseNum(row.exit_price ?? row.exitprice ?? row.close_price ?? row.closeprice ?? row.exitPrice ?? row.closePrice);
    const qty = parseNum(row.qty ?? row.quantity ?? row.volume ?? row.lots) ?? 1;
    if (!entryTime || !exitTime || entryPrice == null || exitPrice == null) throw new Error('completed trade 缺少進出場時間或價格。');
    const profit = parseNum(row.profit ?? row.pnl_amount ?? row.pnlAmount ?? row.net_pnl ?? row.netPnl);
    return [
      { symbol, time: normalizeTime(entryTime), type: side === 'LONG' ? 'buy' : 'sell', price: entryPrice, qty },
      { symbol, time: normalizeTime(exitTime), type: side === 'LONG' ? 'close_buy' : 'close_sell', price: exitPrice, qty, ...(profit != null ? { profit } : {}) },
    ];
  };

  const parseStrategyFile = async (file, defaultSymbol) => {
    const text = await file.text();
    let rows;
    if (file.name.toLowerCase().endsWith('.json')) {
      const json = JSON.parse(text);
      rows = Array.isArray(json) ? json : (json.trades || json.actions || []);
    } else rows = parseTable(text);
    if (!Array.isArray(rows)) throw new Error('找不到交易陣列。');
    const looksActions = rows.length > 0 && rows.every((r) => r && r.time != null && r.type && r.price != null);
    let actions;
    if (looksActions) {
      actions = rows.map((r) => ({
        ...r,
        symbol: String(r.symbol ?? r.contract ?? r.instrument ?? defaultSymbol).toUpperCase(),
        time: normalizeTime(r.time),
        price: Number(r.price),
        qty: Number(r.qty ?? r.volume ?? r.lots ?? 1),
      }));
    } else actions = rows.flatMap((r) => completedToActions(r, defaultSymbol));
    return actions.filter((a) => a.symbol && Number.isFinite(a.time) && Number.isFinite(a.price) && Number.isFinite(a.qty) && a.qty > 0).sort((a, b) => a.time - b.time);
  };

  const ensureStrategyLoaded = async (id) => {
    const strategy = state.strategies.get(id);
    if (!strategy) return null;
    if (Array.isArray(strategy.actions)) return strategy;
    const res = await fetch(strategy.source, { cache: 'no-store' });
    if (!res.ok) throw new Error(`無法載入 ${strategy.name}`);
    const rows = await res.json();
    strategy.actions = (Array.isArray(rows) ? rows : []).map((r) => ({ ...r, symbol: String(r.symbol || (id === 'soya' ? 'XAUUSD' : 'NAS100')).toUpperCase(), time: normalizeTime(r.time), price: Number(r.price), qty: Number(r.qty ?? r.volume ?? 1) })).filter((r) => Number.isFinite(r.time) && Number.isFinite(r.price));
    return strategy;
  };

  const strategyOptions = (selected) => [...state.strategies.values()].map((s) => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${s.name}</option>`).join('');
  const chartDefaultStrategy = (symbol) => symbol === 'XAUUSD' ? 'soya' : symbol === 'NAS100' ? 'kent' : 'none';

  const makeChart = (symbol = 'XAUUSD', timeframe = 'M15', strategyId = null) => {
    const chart = { id: `chart-${++state.chartSeq}`, symbol, timeframe, strategyId: strategyId || chartDefaultStrategy(symbol), ready: false, win: null };
    state.charts.push(chart); return chart;
  };

  const renderStrategyLibrary = () => {
    const root = $('#strategyLibrary');
    root.innerHTML = [...state.strategies.values()].filter((s) => s.id !== 'none').map((s) => {
      const symbols = Array.isArray(s.actions) ? [...new Set(s.actions.map((a) => a.symbol).filter(Boolean))] : [];
      return `<div class="strategy-item"><strong>${s.name}</strong><small>${s.builtin ? '內建示範策略' : '已匯入'}${symbols.length ? ` · ${symbols.join(' / ')}` : ''}</small></div>`;
    }).join('') || '<div class="empty">尚無策略</div>';
  };

  const renderCharts = () => {
    const grid = $('#chartGrid');
    grid.className = `chart-grid layout-${state.visibleCount}`;
    grid.innerHTML = '';
    state.charts.forEach((chart, index) => {
      const card = document.createElement('article');
      card.className = `chart-card ${index >= state.visibleCount ? 'hidden-card' : ''}`;
      card.dataset.chartId = chart.id;
      card.innerHTML = `<div class="chart-head">
        <span class="status-dot loading"></span>
        <select class="chart-symbol">${SYMBOLS.map((s) => `<option ${s === chart.symbol ? 'selected' : ''}>${s}</option>`).join('')}</select>
        <select class="chart-tf">${TIMEFRAMES.map((tf) => `<option ${tf === chart.timeframe ? 'selected' : ''}>${tf}</option>`).join('')}</select>
        <select class="chart-strategy">${strategyOptions(chart.strategyId)}</select>
        <button class="btn icon remove-chart" title="移除圖表">×</button>
      </div><div class="frame-wrap"><div class="frame-loading">載入 ${chart.symbol} 歷史行情…</div><iframe title="${chart.symbol} ${chart.timeframe}"></iframe></div>`;
      grid.appendChild(card);
      const iframe = card.querySelector('iframe');
      chart.card = card; chart.iframe = iframe;
      card.querySelector('.chart-symbol').addEventListener('change', (e) => {
        chart.symbol = e.target.value;
        if (chart.strategyId === 'soya' || chart.strategyId === 'kent' || chart.strategyId === 'none') chart.strategyId = chartDefaultStrategy(chart.symbol);
        renderCharts(); updatePerformance();
      });
      card.querySelector('.chart-tf').addEventListener('change', (e) => { chart.timeframe = e.target.value; loadFrame(chart); });
      card.querySelector('.chart-strategy').addEventListener('change', async (e) => { chart.strategyId = e.target.value; await sendStrategy(chart); updatePerformance(); });
      card.querySelector('.remove-chart').addEventListener('click', () => {
        if (state.charts.length <= 1) return;
        state.charts = state.charts.filter((c) => c.id !== chart.id);
        state.visibleCount = Math.min(state.visibleCount, state.charts.length === 3 ? 4 : Math.max(1, state.charts.length));
        if (state.visibleCount === 3) state.visibleCount = 4;
        renderCharts(); updateLayoutButtons(); updatePerformance();
      });
      loadFrame(chart);
    });
    $('#sessionStatus').textContent = `${Math.min(state.visibleCount, state.charts.length)} Charts · Shared Clock`;
  };

  const frameUrl = (chart) => {
    const p = new URLSearchParams({
      workspace: '1', chartId: chart.id, symbol: chart.symbol, timeframe: chart.timeframe,
      start: $('#startDate').value, end: $('#endDate').value,
    });
    return `/performance/game.html?${p.toString()}`;
  };
  const loadFrame = (chart) => {
    chart.ready = false;
    if (!chart.iframe) return;
    chart.card?.querySelector('.status-dot')?.classList.remove('ready');
    chart.card?.querySelector('.status-dot')?.classList.add('loading');
    chart.card?.querySelector('.frame-wrap')?.classList.remove('ready');
    chart.iframe.src = frameUrl(chart);
  };

  const sendTime = (chart) => {
    if (!chart.ready || !chart.win) return;
    chart.win.postMessage({ type: 'tsr-workspace-seek', chartId: chart.id, timeSec: state.currentSec }, location.origin);
  };
  const broadcastTime = () => state.charts.slice(0, state.visibleCount).forEach(sendTime);

  const sendStrategy = async (chart) => {
    if (!chart.ready || !chart.win) return;
    const strategy = await ensureStrategyLoaded(chart.strategyId);
    if (!strategy || strategy.id === 'none') {
      chart.win.postMessage({ type: 'tsr-workspace-strategy', chartId: chart.id, strategy: null }, location.origin); return;
    }
    const actions = (strategy.actions || []).filter((a) => String(a.symbol).toUpperCase() === chart.symbol);
    chart.win.postMessage({ type: 'tsr-workspace-strategy', chartId: chart.id, strategy: { id: strategy.id, name: strategy.name, actions } }, location.origin);
  };

  const setRange = () => {
    const start = toSec($('#startDate').value, false);
    const end = toSec($('#endDate').value, true);
    if (!start || !end || end <= start) { alert('日期區間不正確。'); return; }
    state.startSec = start; state.endSec = end; state.currentSec = start; state.playing = false; state.lastRaf = 0;
    updatePlay(); updateClock(); renderCharts(); updatePerformance();
  };

  const updateClock = () => $('#currentClock').textContent = fmtClock(state.currentSec);
  const updatePlay = () => $('#playBtn').textContent = state.playing ? '❚❚' : '▶';
  const setPlaying = (value) => { state.playing = value; state.lastRaf = 0; updatePlay(); };

  const tick = (ts) => {
    if (state.playing) {
      if (!state.lastRaf) state.lastRaf = ts;
      const dtMs = Math.min(100, ts - state.lastRaf);
      state.lastRaf = ts;
      // Original engine: one M5 candle / 500 ms at 1x => 0.6 simulated seconds per real ms.
      state.currentSec += (dtMs * 0.6 * state.speed);
      if (state.currentSec >= state.endSec) { state.currentSec = state.endSec; setPlaying(false); }
      updateClock(); broadcastTime(); updatePerformance();
    }
    requestAnimationFrame(tick);
  };

  const bookClose = (book, qty, price, explicitProfit, sideSign, contractSize = 100) => {
    if (!book.qty || qty <= 0) return { closed: 0, pnl: 0 };
    const closed = Math.min(book.qty, qty);
    let pnl;
    if (explicitProfit != null && Number.isFinite(Number(explicitProfit))) pnl = Number(explicitProfit);
    else pnl = (price - book.avg) * sideSign * closed * contractSize;
    book.qty -= closed;
    if (book.qty <= 1e-9) { book.qty = 0; book.avg = 0; }
    return { closed, pnl };
  };

  const pnlForExecution = (actions, symbol, currentPrice) => {
    if (!Number.isFinite(currentPrice)) return 0;
    const filtered = actions.filter((a) => String(a.symbol).toUpperCase() === symbol && a.time >= state.startSec && a.time <= state.currentSec).sort((a, b) => a.time - b.time);
    const long = { qty: 0, avg: 0 }, short = { qty: 0, avg: 0 };
    let realized = 0;
    const add = (book, qty, price) => {
      const next = book.qty + qty;
      book.avg = next > 0 ? ((book.avg * book.qty) + (price * qty)) / next : 0;
      book.qty = next;
    };
    for (const a of filtered) {
      const type = String(a.type).toLowerCase(); const qty = Number(a.qty ?? a.volume ?? 1); const price = Number(a.price);
      if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price)) continue;
      if (type === 'buy') add(long, qty, price);
      else if (type === 'sell') add(short, qty, price);
      else if (type === 'close_buy') realized += bookClose(long, qty, price, a.profit, +1).pnl;
      else if (type === 'close_sell') realized += bookClose(short, qty, price, a.profit, -1).pnl;
    }
    const unrealized = long.qty * (currentPrice - long.avg) * 100 + short.qty * (short.avg - currentPrice) * 100;
    return realized + unrealized;
  };

  const updatePerformance = async () => {
    const root = $('#performanceList');
    const visible = state.charts.slice(0, state.visibleCount);
    const byStrategy = new Map();
    for (const chart of visible) {
      if (!chart.strategyId || chart.strategyId === 'none') continue;
      const strategy = await ensureStrategyLoaded(chart.strategyId).catch(() => null);
      if (!strategy) continue;
      if (!byStrategy.has(strategy.id)) byStrategy.set(strategy.id, { strategy, symbols: new Set() });
      byStrategy.get(strategy.id).symbols.add(chart.symbol); // dedupe same strategy + same symbol across timeframes
    }
    if (!byStrategy.size) { root.innerHTML = '<div class="empty">尚未掛載策略。<br>在圖表上方選擇策略即可開始比較。</div>'; return; }
    const rows = [];
    for (const { strategy, symbols } of byStrategy.values()) {
      let total = 0;
      for (const symbol of symbols) total += pnlForExecution(strategy.actions || [], symbol, state.prices[symbol]);
      const pct = total / BASELINE * 100;
      rows.push(`<div class="perf-row"><div class="perf-top"><span class="perf-name">${strategy.name}</span><span class="perf-pct ${pct > 0 ? 'pos' : pct < 0 ? 'neg' : ''}">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</span></div><div class="perf-symbols">${[...symbols].join(' · ')} · ${symbols.size} 個執行實例</div></div>`);
    }
    root.innerHTML = rows.join('');
  };

  const updateLayoutButtons = () => $$('.layout-switch [data-layout]').forEach((b) => b.classList.toggle('active', Number(b.dataset.layout) === state.visibleCount));
  const setVisibleCount = (count) => {
    count = Number(count);
    while (state.charts.length < count) {
      const nextSymbol = SYMBOLS[state.charts.length % SYMBOLS.length];
      makeChart(nextSymbol, 'M15', chartDefaultStrategy(nextSymbol));
    }
    state.visibleCount = count; renderCharts(); updateLayoutButtons(); updatePerformance();
  };

  window.addEventListener('message', async (event) => {
    if (event.origin !== location.origin) return;
    const msg = event.data || {};
    const chart = state.charts.find((c) => c.id === msg.chartId);
    if (!chart) return;
    if (msg.type === 'tsr-frame-ready') {
      chart.ready = true; chart.win = event.source;
      chart.card?.querySelector('.status-dot')?.classList.remove('loading');
      chart.card?.querySelector('.status-dot')?.classList.add('ready');
      chart.card?.querySelector('.frame-wrap')?.classList.add('ready');
      await sendStrategy(chart); sendTime(chart);
    } else if (msg.type === 'tsr-frame-status') {
      if (Number.isFinite(msg.price)) state.prices[chart.symbol] = msg.price;
      updatePerformance();
    }
  });

  $('#playBtn').addEventListener('click', () => setPlaying(!state.playing));
  $('#stepBtn').addEventListener('click', () => { setPlaying(false); state.currentSec = clamp(state.currentSec + 300, state.startSec, state.endSec); updateClock(); broadcastTime(); updatePerformance(); });
  $$('#speedGroup [data-speed]').forEach((b) => b.addEventListener('click', () => { state.speed = Number(b.dataset.speed); $$('#speedGroup [data-speed]').forEach((x) => x.classList.toggle('active', x === b)); }));
  $('#applyRangeBtn').addEventListener('click', setRange);
  $('#randomRangeBtn').addEventListener('click', () => {
    const yearStart = Date.UTC(2025, 0, 2) / 1000; const yearEnd = Date.UTC(2025, 7, 1) / 1000; const dur = 30 * 86400;
    const start = Math.floor(yearStart + Math.random() * Math.max(1, yearEnd - yearStart - dur));
    $('#startDate').value = toDateValue(start); $('#endDate').value = toDateValue(start + dur - 1); setRange();
  });
  $$('.layout-switch [data-layout]').forEach((b) => b.addEventListener('click', () => setVisibleCount(b.dataset.layout)));
  $('#addChartBtn').addEventListener('click', () => { if (state.visibleCount < 4) setVisibleCount(state.visibleCount === 1 ? 2 : 4); });

  const modal = $('#importModal');
  const closeModal = () => modal.classList.remove('open');
  $('#importStrategyBtn').addEventListener('click', () => modal.classList.add('open'));
  $('#closeImportBtn').addEventListener('click', closeModal); $('#cancelImportBtn').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  $('#confirmImportBtn').addEventListener('click', async () => {
    const status = $('#importStatus'); status.textContent = '';
    try {
      const file = $('#strategyFile').files?.[0]; if (!file) throw new Error('請先選擇策略交易檔。');
      const name = $('#strategyName').value.trim() || file.name.replace(/\.[^.]+$/, '');
      const actions = await parseStrategyFile(file, $('#defaultSymbol').value);
      if (!actions.length) throw new Error('沒有可用交易紀錄。');
      const id = `import-${Date.now().toString(36)}`;
      state.strategies.set(id, { id, name, builtin: false, actions });
      renderStrategyLibrary(); renderCharts(); closeModal();
    } catch (error) { status.textContent = error instanceof Error ? error.message : String(error); }
  });

  makeChart('XAUUSD', 'M15', 'soya');
  makeChart('NAS100', 'M15', 'kent');
  renderStrategyLibrary();
  setRange();
  requestAnimationFrame(tick);
})();
