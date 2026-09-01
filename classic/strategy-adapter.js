(() => {
  const $ = (selector) => document.querySelector(selector);

  const normalizeTime = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value > 1e10 ? Math.floor(value / 1000) : Math.floor(value);
    }
    const raw = String(value ?? '').trim();
    if (/^\d{10,13}$/.test(raw)) {
      const numeric = Number(raw);
      return numeric > 1e10 ? Math.floor(numeric / 1000) : Math.floor(numeric);
    }
    const normalized = raw.replace(/\//g, '-').replace(/^(\d{4})\.(\d{2})\.(\d{2})/, '$1-$2-$3').replace(' ', 'T');
    const timestamp = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(normalized) ? normalized : `${normalized}Z`);
    if (!Number.isFinite(timestamp)) throw new Error(`無法解析時間：${raw}`);
    return Math.floor(timestamp / 1000);
  };

  const splitLine = (line, delimiter) => {
    const values = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (quoted && line[i + 1] === '"') { current += '"'; i += 1; }
        else quoted = !quoted;
      } else if (char === delimiter && !quoted) {
        values.push(current.trim()); current = '';
      } else current += char;
    }
    values.push(current.trim());
    return values;
  };

  const detectDelimiter = (line) => {
    const candidates = [',', '\t', ';'];
    let best = ',';
    let score = -1;
    for (const delimiter of candidates) {
      const count = line.split(delimiter).length - 1;
      if (count > score) { score = count; best = delimiter; }
    }
    return score > 0 ? best : /\s+/;
  };

  const normalizeHeader = (value) => String(value).trim().replace(/^<|>$/g, '').replace(/\s+/g, '_').toLowerCase();

  const parseTable = (text) => {
    const lines = String(text).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n').filter((line) => line.trim());
    if (lines.length < 2) return [];
    const delimiter = detectDelimiter(lines[0]);
    const split = (line) => delimiter instanceof RegExp ? line.trim().split(delimiter) : splitLine(line, delimiter);
    const headers = split(lines[0]).map(normalizeHeader);
    return lines.slice(1).map((line) => {
      const values = split(line);
      return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
    });
  };

  const parseMarketCsv = (text) => {
    const rows = parseTable(text);
    const bars = [];
    for (const row of rows) {
      const date = row.date || row['<date>'];
      const timePart = row.time || row['<time>'];
      const timeRaw = date && timePart ? `${date} ${timePart}` : row.datetime || row.timestamp || row.time;
      const open = Number(row.open);
      const high = Number(row.high);
      const low = Number(row.low);
      const close = Number(row.close);
      if (!timeRaw || ![open, high, low, close].every(Number.isFinite)) continue;
      bars.push({ time: normalizeTime(timeRaw), open, high, low, close });
    }
    const deduped = new Map();
    bars.forEach((bar) => deduped.set(bar.time, bar));
    return [...deduped.values()].sort((a, b) => a.time - b.time);
  };

  const sideOf = (value) => {
    const side = String(value ?? '').trim().toUpperCase();
    if (['LONG', 'BUY', '多'].includes(side)) return 'LONG';
    if (['SHORT', 'SELL', '空'].includes(side)) return 'SHORT';
    throw new Error(`未知交易方向：${value}`);
  };

  const completedTradeToActions = (row) => {
    const side = sideOf(row.side ?? row.type ?? row.direction);
    const entryTime = row.entry_time ?? row.entrytime ?? row.open_time ?? row.opentime ?? row.entryTime ?? row.openTime;
    const exitTime = row.exit_time ?? row.exittime ?? row.close_time ?? row.closetime ?? row.exitTime ?? row.closeTime;
    const entryPrice = Number(row.entry_price ?? row.entryprice ?? row.open_price ?? row.openprice ?? row.entryPrice ?? row.openPrice);
    const exitPrice = Number(row.exit_price ?? row.exitprice ?? row.close_price ?? row.closeprice ?? row.exitPrice ?? row.closePrice);
    const qty = Number(row.qty ?? row.quantity ?? row.volume ?? row.lots ?? 1);
    if (!entryTime || !exitTime || ![entryPrice, exitPrice, qty].every(Number.isFinite)) throw new Error('交易紀錄缺少進出場時間、價格或數量。');
    return [
      { time: normalizeTime(entryTime), type: side === 'LONG' ? 'buy' : 'sell', price: entryPrice, qty },
      { time: normalizeTime(exitTime), type: side === 'LONG' ? 'close_buy' : 'close_sell', price: exitPrice, qty, profit: Number(row.profit ?? row.pnl_amount ?? row.pnlAmount ?? row.net_pnl ?? row.netPnl) || undefined },
    ];
  };

  const parseStrategyFile = async (file) => {
    const text = await file.text();
    if (file.name.toLowerCase().endsWith('.json')) {
      const json = JSON.parse(text);
      const rows = Array.isArray(json) ? json : json.trades || json.actions || [];
      if (!Array.isArray(rows)) throw new Error('JSON 必須是交易陣列。');
      if (rows.every((row) => row && row.time != null && row.type && row.price != null)) {
        return rows.map((row) => ({ ...row, time: normalizeTime(row.time), price: Number(row.price), qty: Number(row.qty ?? row.volume ?? 1) }));
      }
      return rows.flatMap(completedTradeToActions).sort((a, b) => a.time - b.time);
    }
    return parseTable(text).flatMap(completedTradeToActions).sort((a, b) => a.time - b.time);
  };

  const ensureInstrumentOption = (symbol) => {
    const selector = $('#instrumentSelector');
    if (!selector) return;
    if (![...selector.options].some((option) => option.value === symbol)) {
      selector.add(new Option(symbol, symbol));
    }
    selector.value = symbol;
  };

  const setTimeframeUi = (timeframe) => {
    document.querySelectorAll('.timeframe-btn').forEach((button) => button.classList.toggle('active', button.dataset.timeframe === timeframe));
  };

  const applyMarket = (bars, symbol, timeframe) => {
    if (!window.state) throw new Error('交易模擬器尚未初始化。');
    if (!bars.length) throw new Error('行情檔沒有可用 OHLC 資料。');
    state.selectedInstrument = symbol;
    state.selectedTimeframe = timeframe;
    state.m5RawData[symbol] = bars;
    ensureInstrumentOption(symbol);
    setTimeframeUi(timeframe);
    if (typeof window.prepareGameData === 'function') window.prepareGameData();
    else if (typeof window.loadData === 'function') window.loadData();
  };

  const applyStrategy = (actions, label) => {
    if (!window.state) throw new Error('交易模擬器尚未初始化。');
    const instrument = state.selectedInstrument;
    const filtered = actions.filter((action) => Number.isFinite(action.time) && Number.isFinite(action.price) && action.qty > 0);
    if (!filtered.length) throw new Error('沒有可用策略交易紀錄。');
    state.ghostData = [{ instrument, session: 'browser-import', label, equity: 0, profit: 0, actions: filtered }];
    window.__tradeStrategyReplayImportedStrategy = true;
    if (typeof window.rebuildGhostActionIndex === 'function') window.rebuildGhostActionIndex();
    if (typeof window.draw === 'function') window.draw();
  };

  const css = document.createElement('style');
  css.textContent = `
    .tsr-import-modal{position:fixed;inset:0;z-index:12000;background:rgba(0,0,0,.48);display:none;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px)}
    .tsr-import-modal.open{display:flex}.tsr-import-card{width:min(620px,100%);max-height:90vh;overflow:auto;background:var(--color-panel-bg);color:var(--color-text-primary);border:1px solid var(--color-border);border-radius:10px;box-shadow:0 18px 55px rgba(0,0,0,.24);padding:20px}
    .tsr-import-head{display:flex;justify-content:space-between;align-items:start;gap:10px;margin-bottom:16px}.tsr-import-head h3{margin:0 0 4px;font-size:20px}.tsr-import-head p{margin:0;color:var(--color-text-secondary);font-size:13px}.tsr-close{border:0;background:transparent;font-size:24px;cursor:pointer;color:var(--color-text-secondary)}
    .tsr-section{border-top:1px solid var(--color-border);padding-top:14px;margin-top:14px}.tsr-section h4{margin:0 0 10px}.tsr-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.tsr-field{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--color-text-secondary)}.tsr-field input,.tsr-field select{height:38px;border:1px solid var(--color-border);border-radius:6px;padding:0 9px;background:var(--color-bg);color:var(--color-text-primary)}
    .tsr-file{display:block;margin-top:10px;padding:12px;border:1px dashed var(--color-border);border-radius:6px;background:var(--color-bg)}.tsr-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px}.tsr-status{min-height:18px;margin-top:10px;font-size:12px}.tsr-status.error{color:var(--color-danger)}.tsr-status.ok{color:var(--color-success)}
    @media(max-width:600px){.tsr-grid{grid-template-columns:1fr}.tsr-import-card{padding:14px}}
  `;
  document.head.appendChild(css);

  const modal = document.createElement('div');
  modal.className = 'tsr-import-modal';
  modal.innerHTML = `
    <div class="tsr-import-card">
      <div class="tsr-import-head"><div><h3>策略資料匯入</h3><p>沿用原版交易介面，只替換行情與策略交易資料。</p></div><button class="tsr-close" type="button">×</button></div>
      <div class="tsr-section"><h4>1. 商品歷史行情</h4><div class="tsr-grid"><label class="tsr-field">商品代號<input id="tsr-symbol" value="XAUUSD"></label><label class="tsr-field">資料週期<select id="tsr-timeframe"><option>M5</option><option>M15</option><option>M30</option><option>H1</option><option>H4</option><option>D1</option></select></label></div><label class="tsr-file">OHLC CSV / TSV<input id="tsr-market-file" type="file" accept=".csv,.tsv,text/csv,text/plain"></label><div class="tsr-actions"><button class="btn btn-primary" id="tsr-load-market" type="button">載入行情</button></div><div class="tsr-status" id="tsr-market-status"></div></div>
      <div class="tsr-section"><h4>2. 策略交易紀錄</h4><div class="tsr-grid"><label class="tsr-field">策略名稱<input id="tsr-strategy-label" value="Imported Strategy"></label><div></div></div><label class="tsr-file">completed trades CSV / JSON 或 Soya action JSON<input id="tsr-strategy-file" type="file" accept=".csv,.json,text/csv,application/json"></label><div class="tsr-actions"><button class="btn btn-primary" id="tsr-load-strategy" type="button">疊加策略</button></div><div class="tsr-status" id="tsr-strategy-status"></div></div>
    </div>`;
  document.body.appendChild(modal);

  const controls = $('.controls-right') || $('.controls-left');
  if (controls) {
    const button = document.createElement('button');
    button.className = 'btn btn-secondary';
    button.type = 'button';
    button.textContent = '策略資料';
    button.addEventListener('click', () => modal.classList.add('open'));
    controls.insertBefore(button, controls.firstChild);
  }

  modal.querySelector('.tsr-close').addEventListener('click', () => modal.classList.remove('open'));
  modal.addEventListener('click', (event) => { if (event.target === modal) modal.classList.remove('open'); });

  $('#tsr-load-market').addEventListener('click', async () => {
    const status = $('#tsr-market-status');
    status.className = 'tsr-status'; status.textContent = '';
    try {
      const file = $('#tsr-market-file').files?.[0];
      if (!file) throw new Error('請先選擇行情檔。');
      const bars = parseMarketCsv(await file.text());
      applyMarket(bars, $('#tsr-symbol').value.trim().toUpperCase() || 'MARKET', $('#tsr-timeframe').value);
      status.className = 'tsr-status ok'; status.textContent = `已載入 ${bars.length.toLocaleString()} 根 K 棒。`;
    } catch (error) {
      status.className = 'tsr-status error'; status.textContent = error instanceof Error ? error.message : String(error);
    }
  });

  $('#tsr-load-strategy').addEventListener('click', async () => {
    const status = $('#tsr-strategy-status');
    status.className = 'tsr-status'; status.textContent = '';
    try {
      const file = $('#tsr-strategy-file').files?.[0];
      if (!file) throw new Error('請先選擇交易紀錄。');
      const actions = await parseStrategyFile(file);
      applyStrategy(actions, $('#tsr-strategy-label').value.trim() || 'Imported Strategy');
      status.className = 'tsr-status ok'; status.textContent = `已疊加 ${actions.length.toLocaleString()} 筆策略動作。`;
      modal.classList.remove('open');
    } catch (error) {
      status.className = 'tsr-status error'; status.textContent = error instanceof Error ? error.message : String(error);
    }
  });
})();
