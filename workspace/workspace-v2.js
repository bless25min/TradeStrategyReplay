(() => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
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
    chartSeq: 0,
    prices: {},
    strategies: new Map(),
    perfScheduled: false,
  };

  const builtins = [
    { id: 'none', name: '無策略', builtin: true, actions: [] },
    { id: 'soya', name: 'SOYA', builtin: true, source: '/legacy-source/SoyaRecord.json', actions: null },
    { id: 'kent', name: 'KENT', builtin: true, source: '/legacy-source/KentRecord.json', actions: null },
  ];
  builtins.forEach((strategy) => state.strategies.set(strategy.id, strategy));

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const toSec = (dateString, endOfDay = false) => {
    if (!dateString) return 0;
    const suffix = endOfDay ? 'T23:59:59Z' : 'T00:00:00Z';
    return Math.floor(Date.parse(`${dateString}${suffix}`) / 1000);
  };
  const toDateValue = (sec) => new Date(sec * 1000).toISOString().slice(0, 10);
  const formatClock = (sec) => {
    if (!Number.isFinite(sec) || sec <= 0) return '--';
    return new Date(sec * 1000).toLocaleString('zh-TW', {
      timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    });
  };

  const parseNum = (value) => {
    const number = Number(String(value ?? '').replace(/,/g, '').trim());
    return Number.isFinite(number) ? number : null;
  };
  const normalizeTime = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value > 1e10 ? Math.floor(value / 1000) : Math.floor(value);
    const raw = String(value ?? '').trim();
    if (/^\d{10,13}$/.test(raw)) {
      const number = Number(raw);
      return number > 1e10 ? Math.floor(number / 1000) : Math.floor(number);
    }
    const normalized = raw.replace(/\//g, '-').replace(/^(\d{4})\.(\d{2})\.(\d{2})/, '$1-$2-$3').replace(' ', 'T');
    const timestamp = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(normalized) ? normalized : `${normalized}Z`);
    if (!Number.isFinite(timestamp)) throw new Error(`無法解析時間：${raw}`);
    return Math.floor(timestamp / 1000);
  };

  const detectDelimiter = (line) => {
    const candidates = [[',', line.split(',').length], ['\t', line.split('\t').length], [';', line.split(';').length]];
    candidates.sort((a, b) => b[1] - a[1]);
    return candidates[0][1] > 1 ? candidates[0][0] : /\s+/;
  };
  const splitQuoted = (line, delimiter) => {
    if (delimiter instanceof RegExp) return line.trim().split(delimiter);
    const values = [];
    let current = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"') {
        if (quoted && line[index + 1] === '"') { current += '"'; index += 1; }
        else quoted = !quoted;
      } else if (char === delimiter && !quoted) {
        values.push(current.trim()); current = '';
      } else current += char;
    }
    values.push(current.trim());
    return values;
  };
  const parseTable = (text) => {
    const lines = String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n').filter((line) => line.trim());
    if (lines.length < 2) return [];
    const delimiter = detectDelimiter(lines[0]);
    const split = (line) => splitQuoted(line, delimiter);
    const normalizeHeader = (header) => String(header).trim().replace(/^<|>$/g, '').replace(/\s+/g, '_').toLowerCase();
    const headers = split(lines[0]).map(normalizeHeader);
    return lines.slice(1).map((line) => {
      const values = split(line);
      const row = {};
      headers.forEach((header, index) => { row[header] = values[index] ?? ''; });
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
    const actionStyle = rows.length > 0 && rows.every((row) => row && row.time != null && row.type && row.price != null);
    const actions = actionStyle
      ? rows.map((row) => ({
        ...row,
        symbol: String(row.symbol ?? row.contract ?? row.instrument ?? defaultSymbol).toUpperCase(),
        time: normalizeTime(row.time),
        price: Number(row.price),
        qty: Number(row.qty ?? row.volume ?? row.lots ?? 1),
      }))
      : rows.flatMap((row) => completedToActions(row, defaultSymbol));
    return actions
      .filter((action) => action.symbol && Number.isFinite(action.time) && Number.isFinite(action.price) && Number.isFinite(action.qty) && action.qty > 0)
      .sort((a, b) => a.time - b.time);
  };

  const ensureStrategyLoaded = async (strategyId) => {
    const strategy = state.strategies.get(strategyId);
    if (!strategy) return null;
    if (Array.isArray(strategy.actions)) return strategy;
    const response = await fetch(strategy.source, { cache: 'no-store' });
    if (!response.ok) throw new Error(`無法載入 ${strategy.name}`);
    const rows = await response.json();
    strategy.actions = (Array.isArray(rows) ? rows : [])
      .map((row) => ({
        ...row,
        symbol: String(row.symbol || (strategyId === 'soya' ? 'XAUUSD' : 'NAS100')).toUpperCase(),
        time: normalizeTime(row.time),
        price: Number(row.price),
        qty: Number(row.qty ?? row.volume ?? 1),
      }))
      .filter((row) => Number.isFinite(row.time) && Number.isFinite(row.price) && Number.isFinite(row.qty) && row.qty > 0);
    return strategy;
  };

  const strategyOptions = (selected) => [...state.strategies.values()]
    .map((strategy) => `<option value="${strategy.id}" ${strategy.id === selected ? 'selected' : ''}>${strategy.name}</option>`)
    .join('');
  const defaultStrategyFor = (symbol) => symbol === 'XAUUSD' ? 'soya' : symbol === 'NAS100' ? 'kent' : 'none';

  const makeChart = (symbol = 'XAUUSD', timeframe = 'M15', strategyId = null) => {
    const chart = {
      id: `chart-${++state.chartSeq}`,
      symbol,
      timeframe,
      strategyId: strategyId || defaultStrategyFor(symbol),
      ready: false,
      win: null,
      status: null,
    };
    state.charts.push(chart);
    return chart;
  };

  const visibleCharts = () => state.charts.slice(0, state.visibleCount).filter((chart) => chart.card && !chart.card.classList.contains('hidden-card'));
  const masterChart = () => visibleCharts().find((chart) => chart.ready && chart.status) || visibleCharts().find((chart) => chart.ready) || null;

  const renderStrategyLibrary = () => {
    const root = $('#strategyLibrary');
    root.innerHTML = [...state.strategies.values()].filter((strategy) => strategy.id !== 'none').map((strategy) => {
      const symbols = Array.isArray(strategy.actions) ? [...new Set(strategy.actions.map((action) => action.symbol).filter(Boolean))] : [];
      return `<div class="strategy-item"><strong>${strategy.name}</strong><small>${strategy.builtin ? '內建示範策略' : '已匯入'}${symbols.length ? ` · ${symbols.join(' / ')}` : ''}</small></div>`;
    }).join('') || '<div class="empty">尚無策略</div>';
  };

  const frameUrl = (chart) => {
    const params = new URLSearchParams({
      workspace: '1',
      chartId: chart.id,
      symbol: chart.symbol,
      timeframe: chart.timeframe,
      start: $('#startDate').value,
      end: $('#endDate').value,
    });
    return `/performance/game.html?${params.toString()}`;
  };

  const loadFrame = (chart) => {
    chart.ready = false;
    chart.win = null;
    chart.status = null;
    if (!chart.iframe) return;
    chart.card?.querySelector('.status-dot')?.classList.remove('ready');
    chart.card?.querySelector('.status-dot')?.classList.add('loading');
    chart.card?.querySelector('.frame-wrap')?.classList.remove('ready');
    chart.iframe.src = frameUrl(chart);
  };

  const send = (chart, message) => {
    if (!chart.ready || !chart.win) return;
    chart.win.postMessage({ ...message, chartId: chart.id }, location.origin);
  };
  const broadcast = (message) => visibleCharts().forEach((chart) => send(chart, message));

  const sendStrategy = async (chart) => {
    if (!chart.ready || !chart.win) return;
    const strategy = await ensureStrategyLoaded(chart.strategyId);
    if (!strategy || strategy.id === 'none') {
      send(chart, { type: 'tsr-workspace-strategy', strategy: null });
      return;
    }
    const actions = (strategy.actions || []).filter((action) => String(action.symbol).toUpperCase() === chart.symbol);
    send(chart, {
      type: 'tsr-workspace-strategy',
      strategy: { id: strategy.id, name: strategy.name, actions },
    });
  };

  const renderCharts = () => {
    const grid = $('#chartGrid');
    grid.className = `chart-grid layout-${state.visibleCount}`;
    grid.innerHTML = '';

    state.charts.forEach((chart, index) => {
      const card = document.createElement('article');
      card.className = `chart-card ${index >= state.visibleCount ? 'hidden-card' : ''}`;
      card.dataset.chartId = chart.id;
      card.innerHTML = `
        <div class="chart-head">
          <span class="status-dot loading"></span>
          <select class="chart-symbol">${SYMBOLS.map((symbol) => `<option ${symbol === chart.symbol ? 'selected' : ''}>${symbol}</option>`).join('')}</select>
          <select class="chart-tf">${TIMEFRAMES.map((timeframe) => `<option ${timeframe === chart.timeframe ? 'selected' : ''}>${timeframe}</option>`).join('')}</select>
          <select class="chart-strategy">${strategyOptions(chart.strategyId)}</select>
          <button class="btn icon remove-chart" title="移除圖表">×</button>
        </div>
        <div class="frame-wrap">
          <div class="frame-loading">載入原版 ${chart.symbol} 圖表…</div>
          <iframe title="${chart.symbol} ${chart.timeframe}"></iframe>
        </div>`;
      grid.appendChild(card);

      chart.card = card;
      chart.iframe = card.querySelector('iframe');

      card.querySelector('.chart-symbol').addEventListener('change', (event) => {
        chart.symbol = event.target.value;
        if (['soya', 'kent', 'none'].includes(chart.strategyId)) chart.strategyId = defaultStrategyFor(chart.symbol);
        renderCharts();
        schedulePerformance();
      });
      card.querySelector('.chart-tf').addEventListener('change', (event) => {
        chart.timeframe = event.target.value;
        loadFrame(chart);
      });
      card.querySelector('.chart-strategy').addEventListener('change', async (event) => {
        chart.strategyId = event.target.value;
        await sendStrategy(chart);
        schedulePerformance();
      });
      card.querySelector('.remove-chart').addEventListener('click', () => {
        if (state.charts.length <= 1) return;
        state.charts = state.charts.filter((candidate) => candidate.id !== chart.id);
        if (state.visibleCount > state.charts.length) state.visibleCount = state.charts.length === 3 ? 4 : Math.max(1, state.charts.length);
        renderCharts();
        updateLayoutButtons();
        schedulePerformance();
      });

      if (index < state.visibleCount) loadFrame(chart);
    });

    $('#sessionStatus').textContent = `${Math.min(state.visibleCount, state.charts.length)} Original Charts`;
  };

  const setRange = () => {
    const start = toSec($('#startDate').value, false);
    const end = toSec($('#endDate').value, true);
    if (!start || !end || end <= start) {
      alert('日期區間不正確。');
      return;
    }
    state.startSec = start;
    state.endSec = end;
    state.currentSec = start;
    state.playing = false;
    updatePlayButton();
    updateClock();
    renderCharts();
    schedulePerformance();
  };

  const updateClock = () => { $('#currentClock').textContent = formatClock(state.currentSec); };
  const updatePlayButton = () => { $('#playBtn').textContent = state.playing ? '❚❚' : '▶'; };
  const setPlaying = (playing) => {
    state.playing = !!playing;
    updatePlayButton();
    broadcast({ type: state.playing ? 'tsr-workspace-play' : 'tsr-workspace-pause' });
  };

  const setSpeed = (speed) => {
    state.speed = Number(speed);
    $$('#speedGroup [data-speed]').forEach((button) => button.classList.toggle('active', Number(button.dataset.speed) === state.speed));
    broadcast({ type: 'tsr-workspace-speed', speed: state.speed });
  };

  const stepAll = () => {
    setPlaying(false);
    broadcast({ type: 'tsr-workspace-step' });
  };

  const bookClose = (book, qty, price, explicitProfit, sideSign, contractSize = 100) => {
    if (!book.qty || qty <= 0) return { pnl: 0 };
    const closed = Math.min(book.qty, qty);
    const pnl = explicitProfit != null && Number.isFinite(Number(explicitProfit))
      ? Number(explicitProfit)
      : (price - book.avg) * sideSign * closed * contractSize;
    book.qty -= closed;
    if (book.qty <= 1e-9) { book.qty = 0; book.avg = 0; }
    return { pnl };
  };

  const pnlForExecution = (actions, symbol, currentPrice) => {
    if (!Number.isFinite(currentPrice) || !Number.isFinite(state.currentSec)) return 0;
    const relevant = actions
      .filter((action) => String(action.symbol).toUpperCase() === symbol && action.time >= state.startSec && action.time <= state.currentSec)
      .sort((a, b) => a.time - b.time);
    const long = { qty: 0, avg: 0 };
    const short = { qty: 0, avg: 0 };
    let realized = 0;
    const add = (book, qty, price) => {
      const next = book.qty + qty;
      book.avg = next > 0 ? ((book.avg * book.qty) + (price * qty)) / next : 0;
      book.qty = next;
    };
    relevant.forEach((action) => {
      const type = String(action.type).toLowerCase();
      const qty = Number(action.qty ?? action.volume ?? 1);
      const price = Number(action.price);
      if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price)) return;
      if (type === 'buy') add(long, qty, price);
      else if (type === 'sell') add(short, qty, price);
      else if (type === 'close_buy') realized += bookClose(long, qty, price, action.profit, +1).pnl;
      else if (type === 'close_sell') realized += bookClose(short, qty, price, action.profit, -1).pnl;
    });
    const unrealized = long.qty * (currentPrice - long.avg) * 100 + short.qty * (short.avg - currentPrice) * 100;
    return realized + unrealized;
  };

  const updatePerformance = async () => {
    const root = $('#performanceList');
    const groups = new Map();
    for (const chart of visibleCharts()) {
      if (!chart.strategyId || chart.strategyId === 'none') continue;
      const strategy = await ensureStrategyLoaded(chart.strategyId).catch(() => null);
      if (!strategy) continue;
      if (!groups.has(strategy.id)) groups.set(strategy.id, { strategy, symbols: new Set() });
      groups.get(strategy.id).symbols.add(chart.symbol);
    }

    if (!groups.size) {
      root.innerHTML = '<div class="empty">尚未掛載策略。<br>在圖表上方選擇策略即可開始比較。</div>';
      return;
    }

    const rows = [];
    for (const { strategy, symbols } of groups.values()) {
      let total = 0;
      for (const symbol of symbols) total += pnlForExecution(strategy.actions || [], symbol, state.prices[symbol]);
      const pct = total / BASELINE * 100;
      rows.push(`<div class="perf-row"><div class="perf-top"><span class="perf-name">${strategy.name}</span><span class="perf-pct ${pct > 0 ? 'pos' : pct < 0 ? 'neg' : ''}">${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</span></div><div class="perf-symbols">${[...symbols].join(' · ')} · 同策略同商品只計一次</div></div>`);
    }
    root.innerHTML = rows.join('');
  };

  const schedulePerformance = () => {
    if (state.perfScheduled) return;
    state.perfScheduled = true;
    setTimeout(async () => {
      state.perfScheduled = false;
      await updatePerformance();
    }, 100);
  };

  const updateLayoutButtons = () => {
    $$('.layout-switch [data-layout]').forEach((button) => button.classList.toggle('active', Number(button.dataset.layout) === state.visibleCount));
  };
  const setVisibleCount = (count) => {
    count = Number(count);
    while (state.charts.length < count) {
      const symbol = SYMBOLS[state.charts.length % SYMBOLS.length];
      makeChart(symbol, 'M15', defaultStrategyFor(symbol));
    }
    state.visibleCount = count;
    renderCharts();
    updateLayoutButtons();
    schedulePerformance();
  };

  window.addEventListener('message', async (event) => {
    if (event.origin !== location.origin) return;
    const message = event.data || {};
    const chart = state.charts.find((candidate) => candidate.id === message.chartId);
    if (!chart) return;

    if (message.type === 'tsr-frame-ready') {
      chart.ready = true;
      chart.win = event.source;
      chart.card?.querySelector('.status-dot')?.classList.remove('loading');
      chart.card?.querySelector('.status-dot')?.classList.add('ready');
      chart.card?.querySelector('.frame-wrap')?.classList.add('ready');
      await sendStrategy(chart);
      send(chart, { type: 'tsr-workspace-speed', speed: state.speed });
      send(chart, { type: state.playing ? 'tsr-workspace-play' : 'tsr-workspace-pause' });
    } else if (message.type === 'tsr-frame-status') {
      chart.status = message;
      if (Number.isFinite(message.price)) state.prices[chart.symbol] = Number(message.price);
      const master = masterChart();
      if (master?.id === chart.id && Number.isFinite(message.timeSec)) {
        state.currentSec = clamp(Number(message.timeSec), state.startSec, state.endSec);
        updateClock();
      }
      schedulePerformance();
    }
  });

  $('#playBtn').addEventListener('click', () => setPlaying(!state.playing));
  $('#stepBtn').addEventListener('click', stepAll);
  $$('#speedGroup [data-speed]').forEach((button) => button.addEventListener('click', () => setSpeed(button.dataset.speed)));
  $('#applyRangeBtn').addEventListener('click', setRange);
  $('#randomRangeBtn').addEventListener('click', () => {
    const yearStart = Date.UTC(2025, 0, 2) / 1000;
    const yearEnd = Date.UTC(2025, 7, 1) / 1000;
    const duration = 30 * 86400;
    const start = Math.floor(yearStart + Math.random() * Math.max(1, yearEnd - yearStart - duration));
    $('#startDate').value = toDateValue(start);
    $('#endDate').value = toDateValue(start + duration - 1);
    setRange();
  });
  $$('.layout-switch [data-layout]').forEach((button) => button.addEventListener('click', () => setVisibleCount(button.dataset.layout)));
  $('#addChartBtn').addEventListener('click', () => {
    if (state.visibleCount < 4) setVisibleCount(state.visibleCount === 1 ? 2 : 4);
  });

  const modal = $('#importModal');
  const closeModal = () => modal.classList.remove('open');
  $('#importStrategyBtn').addEventListener('click', () => modal.classList.add('open'));
  $('#closeImportBtn').addEventListener('click', closeModal);
  $('#cancelImportBtn').addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  $('#confirmImportBtn').addEventListener('click', async () => {
    const status = $('#importStatus');
    status.textContent = '';
    try {
      const file = $('#strategyFile').files?.[0];
      if (!file) throw new Error('請先選擇策略交易檔。');
      const name = $('#strategyName').value.trim() || file.name.replace(/\.[^.]+$/, '');
      const actions = await parseStrategyFile(file, $('#defaultSymbol').value);
      if (!actions.length) throw new Error('沒有可用交易紀錄。');
      const id = `import-${Date.now().toString(36)}`;
      state.strategies.set(id, { id, name, builtin: false, actions });
      renderStrategyLibrary();
      renderCharts();
      closeModal();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error);
    }
  });

  makeChart('XAUUSD', 'M15', 'soya');
  makeChart('NAS100', 'M15', 'kent');
  renderStrategyLibrary();
  updateLayoutButtons();
  setRange();
})();
