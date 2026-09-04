(() => {
  // Performance variant: keep the original trading/chart engine, remove RPG UI,
  // and compare the user vs one strategy from the SAME replay-window baseline.
  window.initRPG = null;
  window.createRPGOverlay = null;

  const TRACK_LIMIT_PCT = 20;
  const M5_SECONDS = 300;
  let replayBaselineEquity = 10000;
  let replayStartSec = 0;
  let currentContextKey = '';
  let currentStrategyLabel = '策略';
  let strategyActions = [];
  let actionCursor = 0;
  let processedUntilSec = -Infinity;
  let book = null;

  const emptyBook = () => ({
    realized: 0,
    longQty: 0,
    longAvg: 0,
    shortQty: 0,
    shortAvg: 0,
  });

  const normalizeTime = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return NaN;
    return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n);
  };

  const normalizeQty = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 1;
  };

  const strategyGhost = () => {
    if (typeof state === 'undefined') return null;
    const imported = !!window.__tradeStrategyReplayImportedStrategy;
    const source = imported
      ? (state.ghostData || [])
      : ((state.ghostFull?.length ? state.ghostFull : state.ghostData) || []);
    if (!Array.isArray(source) || !source.length) return null;

    const symbol = String(state.selectedInstrument || '').toUpperCase();
    const preferred = source.filter((g) => {
      const label = String(g?.label || '').toLowerCase();
      if (symbol === 'XAUUSD') return label.includes('soya');
      if (symbol === 'NAS100') return label.includes('kent');
      return true;
    });
    return (preferred.length ? preferred : source)[0] || null;
  };

  const resetStrategyBook = () => {
    book = emptyBook();
    actionCursor = 0;
    processedUntilSec = replayStartSec;
  };

  const prepareStrategyForWindow = (ghost) => {
    currentStrategyLabel = String(ghost?.label || '策略');
    strategyActions = (Array.isArray(ghost?.actions) ? ghost.actions : [])
      .map((action) => ({
        ...action,
        time: normalizeTime(action.time),
        price: Number(action.price),
        qty: normalizeQty(action.qty ?? action.volume ?? action.lots),
        type: String(action.type || '').toLowerCase(),
      }))
      // Anything before this replay window belongs to the teacher's previous history
      // and must not affect this head-to-head race.
      .filter((action) => Number.isFinite(action.time) && action.time >= replayStartSec && Number.isFinite(action.price))
      .sort((a, b) => a.time - b.time);
    resetStrategyBook();
  };

  const addLong = (price, qty) => {
    const nextQty = book.longQty + qty;
    book.longAvg = nextQty > 0
      ? ((book.longAvg * book.longQty) + (price * qty)) / nextQty
      : 0;
    book.longQty = nextQty;
  };

  const addShort = (price, qty) => {
    const nextQty = book.shortQty + qty;
    book.shortAvg = nextQty > 0
      ? ((book.shortAvg * book.shortQty) + (price * qty)) / nextQty
      : 0;
    book.shortQty = nextQty;
  };

  const closeLong = (price, qty) => {
    // If the strategy entered this replay window carrying an old long position,
    // its close signal is ignored until a NEW long has been opened in this window.
    if (book.longQty <= 0) return;
    const closeQty = Math.min(book.longQty, qty);
    book.realized += (price - book.longAvg) * closeQty * (Number(CONFIG.CONTRACT_SIZE) || 100);
    book.longQty -= closeQty;
    if (book.longQty <= 1e-9) {
      book.longQty = 0;
      book.longAvg = 0;
    }
  };

  const closeShort = (price, qty) => {
    // Same rule for carried short positions: pre-window P/L never enters this race.
    if (book.shortQty <= 0) return;
    const closeQty = Math.min(book.shortQty, qty);
    book.realized += (book.shortAvg - price) * closeQty * (Number(CONFIG.CONTRACT_SIZE) || 100);
    book.shortQty -= closeQty;
    if (book.shortQty <= 1e-9) {
      book.shortQty = 0;
      book.shortAvg = 0;
    }
  };

  const applyStrategyAction = (action) => {
    if (!book) book = emptyBook();
    if (action.type === 'buy') addLong(action.price, action.qty);
    else if (action.type === 'sell') addShort(action.price, action.qty);
    else if (action.type === 'close_buy') closeLong(action.price, action.qty);
    else if (action.type === 'close_sell') closeShort(action.price, action.qty);
  };

  const processStrategyUntil = (timeSec) => {
    if (!book) resetStrategyBook();
    // Stepping/restarting backwards must rebuild from the replay-window origin.
    if (timeSec + 1e-9 < processedUntilSec) resetStrategyBook();
    while (actionCursor < strategyActions.length && strategyActions[actionCursor].time <= timeSec) {
      applyStrategyAction(strategyActions[actionCursor]);
      actionCursor += 1;
    }
    processedUntilSec = timeSec;
  };

  const strategyPnlAt = (timeSec, price) => {
    processStrategyUntil(timeSec);
    const contractSize = Number(CONFIG.CONTRACT_SIZE) || 100;
    const longFloating = book.longQty > 0 ? (price - book.longAvg) * book.longQty * contractSize : 0;
    const shortFloating = book.shortQty > 0 ? (book.shortAvg - price) * book.shortQty * contractSize : 0;
    return book.realized + longFloating + shortFloating;
  };

  const css = document.createElement('style');
  css.id = 'tsr-performance-style';
  css.textContent = `
    #rpg-panel,.loader-scene,#challengeInfo,#btnEndGame,#notification-container,
    .tutorial-highlight,.tutorial-message,.achievements-section,.bonus-challenge-section,
    #endGameModal,#stageCompleteModal,#challengeFailedModal,#nightmareRulesModal,
    .wave-timer,.footer-ad{display:none!important}

    body{background:#fff}
    .chart-container-v9{padding-bottom:8px}

    /* The race is a sibling BELOW chartWrap, never an overlay on top of candles. */
    #tsr-performance-race{
      position:relative;flex:0 0 88px;min-height:88px;margin:6px 0 0;padding:2px 10px 0;
      background:transparent;border:0;box-shadow:none;pointer-events:none;
      font-family:'Segoe UI','Noto Sans TC',sans-serif;color:#334155;
    }
    .tsr-race-head{display:flex;align-items:center;justify-content:space-between;gap:12px;height:22px;margin:0 2px 2px}
    .tsr-race-title{font-size:12px;font-weight:800;color:#334155}
    .tsr-race-summary{font-size:10px;font-weight:700;color:#64748b;white-space:nowrap}
    .tsr-race-summary.you-lead{color:#d97706}.tsr-race-summary.strategy-lead{color:#2563eb}

    .tsr-race-track{position:relative;height:44px;margin:0 38px}
    .tsr-race-line{position:absolute;left:0;right:0;top:22px;border-top:1px solid rgba(100,116,139,.46)}
    .tsr-race-zero{position:absolute;left:50%;top:11px;height:22px;border-left:1px dashed rgba(71,85,105,.56)}
    .tsr-race-tick{position:absolute;top:21px;width:1px;height:5px;background:rgba(100,116,139,.42)}
    .tsr-race-tick-label{position:absolute;top:28px;transform:translateX(-50%);font-size:8px;color:#94a3b8;white-space:nowrap}

    .tsr-racer{position:absolute;left:50%;height:20px;padding:1px 7px;border-radius:6px;color:#fff;font-size:10px;font-weight:800;line-height:18px;white-space:nowrap;box-shadow:0 2px 6px rgba(15,23,42,.13);transform:translateX(-50%);transition:left .08s linear}
    #tsr-user-racer{top:0;background:#f59e0b}
    #tsr-strategy-racer{top:23px;background:#2563eb}

    .tsr-race-legend{display:flex;gap:14px;align-items:center;margin:0 40px;font-size:8px;color:#94a3b8}
    .tsr-race-legend span{display:flex;gap:5px;align-items:center}.tsr-race-legend i{width:6px;height:6px;border-radius:50%}.tsr-race-legend .you-dot{background:#f59e0b}.tsr-race-legend .strategy-dot{background:#2563eb}

    @media(max-width:900px){
      #tsr-performance-race{flex-basis:78px;min-height:78px;margin-top:4px;padding:0 4px}
      .tsr-race-head{height:19px}.tsr-race-title{font-size:10px}.tsr-race-summary{font-size:8px}
      .tsr-race-track{height:42px;margin:0 24px}.tsr-race-legend{display:none}
      .tsr-racer{font-size:9px;padding:1px 5px}
    }
  `;
  document.head.appendChild(css);

  const pctToLeft = (pct) => {
    const clamped = Math.max(-TRACK_LIMIT_PCT, Math.min(TRACK_LIMIT_PCT, Number(pct) || 0));
    return ((clamped + TRACK_LIMIT_PCT) / (TRACK_LIMIT_PCT * 2)) * 100;
  };

  const buildRaceShell = () => {
    const chartWrap = document.getElementById('chartWrap');
    const chartColumn = chartWrap?.parentElement;
    if (!chartWrap || !chartColumn) return null;
    let shell = document.getElementById('tsr-performance-race');
    if (shell) return shell;

    shell = document.createElement('div');
    shell.id = 'tsr-performance-race';
    shell.innerHTML = `
      <div class="tsr-race-head">
        <div class="tsr-race-title">同期績效競速</div>
        <div class="tsr-race-summary" id="tsr-race-summary">你 +0.00% ｜ 策略 +0.00% ｜ 同一起跑點</div>
      </div>
      <div class="tsr-race-track">
        <div class="tsr-race-line"></div>
        <div class="tsr-race-zero"></div>
        <span class="tsr-race-tick" style="left:0%"></span><span class="tsr-race-tick-label" style="left:0%">-20%</span>
        <span class="tsr-race-tick" style="left:25%"></span><span class="tsr-race-tick-label" style="left:25%">-10%</span>
        <span class="tsr-race-tick" style="left:50%"></span><span class="tsr-race-tick-label" style="left:50%">0%</span>
        <span class="tsr-race-tick" style="left:75%"></span><span class="tsr-race-tick-label" style="left:75%">+10%</span>
        <span class="tsr-race-tick" style="left:100%"></span><span class="tsr-race-tick-label" style="left:100%">+20%</span>
        <div class="tsr-racer" id="tsr-user-racer">你 +0.00%</div>
        <div class="tsr-racer" id="tsr-strategy-racer">策略 +0.00%</div>
      </div>
      <div class="tsr-race-legend"><span><i class="you-dot"></i>你的模擬績效</span><span><i class="strategy-dot"></i>策略同期績效</span></div>`;

    // Insert AFTER chartWrap inside the same flex column. The chart becomes slightly
    // shorter, rather than having the race cover the candle plot.
    chartColumn.appendChild(shell);
    requestAnimationFrame(() => {
      if (typeof window.resizeCanvas === 'function') window.resizeCanvas();
      if (typeof window.draw === 'function') window.draw();
    });

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => {
        if (typeof window.resizeCanvas === 'function') window.resizeCanvas();
      });
      observer.observe(chartWrap);
    }
    return shell;
  };

  const currentSimTimeSec = () => {
    const bar = state.m5GameData?.[state.m5Index];
    if (!bar) return replayStartSec;
    return Number(bar.time) + Math.max(0, Math.min(1, Number(state.barAnimationProgress) || 0)) * M5_SECONDS;
  };

  const currentPrice = () => {
    const dynamic = typeof getCurrentPrice === 'function' ? Number(getCurrentPrice()) : NaN;
    if (Number.isFinite(dynamic)) return dynamic;
    return Number(state.m5GameData?.[state.m5Index]?.close ?? state.gameData?.[state.currentIndex]?.close ?? 0);
  };

  const resetContextIfNeeded = () => {
    if (typeof state === 'undefined' || !state.m5GameData?.length) return false;
    const ghost = strategyGhost();
    const startSec = Number(window.__tsrPerformanceStartSec ?? state.m5GameData[0]?.time ?? 0);
    const baseline = Number(window.__tsrPerformanceBaselineEquity ?? state.balance ?? state.equity ?? 10000) || 10000;
    const key = `${state.selectedInstrument}|${startSec}|${baseline}|${ghost?.label || 'none'}|${ghost?.actions?.length || 0}|${window.__tradeStrategyReplayImportedStrategy ? 'import' : 'builtin'}`;
    if (key === currentContextKey) return true;

    currentContextKey = key;
    replayStartSec = startSec;
    replayBaselineEquity = baseline;
    prepareStrategyForWindow(ghost);
    return true;
  };

  const renderRace = () => {
    const userRacer = document.getElementById('tsr-user-racer');
    const strategyRacer = document.getElementById('tsr-strategy-racer');
    const summary = document.getElementById('tsr-race-summary');
    if (!userRacer || !strategyRacer || !summary) return;

    const userEquity = Number(state.equity);
    const userPct = Number.isFinite(userEquity) && replayBaselineEquity > 0
      ? ((userEquity - replayBaselineEquity) / replayBaselineEquity) * 100
      : 0;

    const timeSec = currentSimTimeSec();
    const price = currentPrice();
    const strategyPnl = Number.isFinite(price) ? strategyPnlAt(timeSec, price) : 0;
    const strategyPct = replayBaselineEquity > 0 ? (strategyPnl / replayBaselineEquity) * 100 : 0;

    userRacer.style.left = `${pctToLeft(userPct)}%`;
    strategyRacer.style.left = `${pctToLeft(strategyPct)}%`;
    userRacer.textContent = `你 ${userPct >= 0 ? '+' : ''}${userPct.toFixed(2)}%`;
    strategyRacer.textContent = `${currentStrategyLabel} ${strategyPct >= 0 ? '+' : ''}${strategyPct.toFixed(2)}%`;

    const gap = userPct - strategyPct;
    summary.className = `tsr-race-summary ${gap > 0.005 ? 'you-lead' : gap < -0.005 ? 'strategy-lead' : ''}`;
    if (Math.abs(gap) < 0.005) {
      summary.textContent = `你 ${userPct >= 0 ? '+' : ''}${userPct.toFixed(2)}% ｜ ${currentStrategyLabel} ${strategyPct >= 0 ? '+' : ''}${strategyPct.toFixed(2)}% ｜ 持平`;
    } else {
      summary.textContent = `你 ${userPct >= 0 ? '+' : ''}${userPct.toFixed(2)}% ｜ ${currentStrategyLabel} ${strategyPct >= 0 ? '+' : ''}${strategyPct.toFixed(2)}% ｜ ${gap > 0 ? '你領先' : '策略領先'} ${Math.abs(gap).toFixed(2)}%`;
    }
  };

  const loop = () => {
    try {
      if (typeof state !== 'undefined' && !state.isLoading && state.m5GameData?.length) {
        buildRaceShell();
        if (resetContextIfNeeded()) renderRace();
      }
    } catch (error) {
      console.warn('[Performance Race]', error);
    }
    requestAnimationFrame(loop);
  };

  document.addEventListener('DOMContentLoaded', () => {
    buildRaceShell();
    requestAnimationFrame(loop);
  });
})();
