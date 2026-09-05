(() => {
  const params = new URLSearchParams(location.search);
  if (params.get('workspace') !== '1') return;

  const chartId = params.get('chartId') || 'chart';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  // Workspace frames ARE the original SoyaPlayableAd experience.
  // Keep chart.js / ui.js / trading.js / main.js, the trading dock and the
  // performance race intact. Only remove duplicated page-level chrome and
  // controls already provided by the workspace toolbar.
  const style = document.createElement('style');
  style.id = 'tsr-workspace-frame-style';
  style.textContent = `
    html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#fff!important}

    /* Remove only duplicated standalone chrome / game-only presentation. */
    .header,.controls-right,#notification-container,.footer-ad{display:none!important}

    /* IMPORTANT: preserve the original responsive layout. The original page already
       uses main-container-v9 as chart + trading-content layout, so do not turn it into
       an absolute full-screen chart layer. */
    .main-container-v9{
      flex:1 1 auto!important;
      width:100%!important;
      min-width:0!important;
      min-height:0!important;
      height:auto!important;
      margin:0!important;
      overflow:hidden!important;
    }
    .chart-container-v9{
      min-width:0!important;
      min-height:0!important;
      overflow:hidden!important;
    }
    .chart-wrap{
      min-width:0!important;
      min-height:200px!important;
      background:#fff!important;
    }
    #chartCanvas{display:block!important}

    /* Do NOT hide or re-layout .bottom-content-v9 / #tsr-performance-race here.
       Their original responsive CSS is intentionally preserved. */

    .loader-wrap{background:#fff!important}
    .loader-scene{display:none!important}
    #loader-status p{font-size:11px!important;color:#94a3b8!important}

    /* The workspace toolbar owns symbol / timeframe / play / speed. Keep the original
       zoom controls inside each chart because they are part of the chart interaction. */
    .controls-overlay-container{display:block!important;pointer-events:none!important}
    .controls-left{
      display:block!important;
      left:8px!important;
      top:8px!important;
      pointer-events:none!important;
      background:transparent!important;
      border:0!important;
      box-shadow:none!important;
      padding:0!important;
    }
    .controls-left .collapsible-controls{
      display:flex!important;
      opacity:1!important;
      visibility:visible!important;
      max-height:none!important;
      overflow:visible!important;
      gap:4px!important;
      pointer-events:none!important;
    }
    .controls-left .control-group,#timeframeSelector,#btnPlayPause,#btnStepForward,#speedSelector,#btnToggleControls{display:none!important}
    #btnZoomIn,#btnZoomOut{
      display:inline-flex!important;
      pointer-events:auto!important;
      width:30px!important;
      height:30px!important;
      padding:0!important;
      align-items:center!important;
      justify-content:center!important;
      background:rgba(255,255,255,.92)!important;
      border:1px solid rgba(148,163,184,.55)!important;
      color:#475569!important;
      box-shadow:0 2px 8px rgba(15,23,42,.08)!important;
    }

    /* Narrow chart tiles use the original mobile layout (trade panel below chart).
       Only compact spacing; event handlers and original controls remain untouched. */
    @media (max-width:900px){
      .bottom-content-v9{max-height:210px!important;overflow:hidden!important}
      .bottom-nav-bar-v9{min-height:34px!important}
      .bottom-nav-bar-v9 .nav-btn-v9{padding:7px 6px!important;font-size:11px!important}
      .tab-content-v9{overflow:auto!important;max-height:174px!important}
      .order-controls{gap:5px!important;padding:5px!important}
      .input-group-horizontal{gap:5px!important}
      .input-field{height:29px!important;font-size:12px!important;padding:4px 5px!important}
      .trade-actions{gap:5px!important;padding:0 5px 5px!important}
      .btn-trade{min-height:30px!important;padding:6px 4px!important;font-size:12px!important}

      #tsr-performance-race{flex:0 0 72px!important;min-height:72px!important;margin-top:2px!important}
      #tsr-performance-race .tsr-race-head{height:18px!important;margin-bottom:0!important}
      #tsr-performance-race .tsr-race-track{height:40px!important}
      #tsr-performance-race .tsr-race-legend{display:none!important}
    }

    @media (max-width:900px) and (max-height:560px){
      .bottom-content-v9{max-height:172px!important}
      .tab-content-v9{max-height:136px!important}
      #tsr-performance-race{flex-basis:62px!important;min-height:62px!important}
      #tsr-performance-race .tsr-race-track{height:34px!important}
    }
  `;
  document.head.appendChild(style);

  const currentSimTimeSec = () => {
    try {
      const bar = state?.m5GameData?.[state?.m5Index || 0];
      if (!bar) return 0;
      const progress = clamp(Number(state?.barAnimationProgress) || 0, 0, 1);
      return Number(bar.time) + progress * 300;
    } catch (_) {
      return 0;
    }
  };

  const currentPrice = () => {
    try {
      if (typeof getCurrentPrice === 'function') {
        const value = Number(getCurrentPrice());
        if (Number.isFinite(value)) return value;
      }
    } catch (_) {}
    try {
      return Number(state?.m5GameData?.[state?.m5Index || 0]?.close || 0);
    } catch (_) {
      return 0;
    }
  };

  const setPlaying = (playing) => {
    if (typeof state === 'undefined' || state.isEnded) return;
    const target = !!playing;
    if (!!state.isPlaying === target) return;
    if (typeof togglePlayPause === 'function') togglePlayPause();
  };

  const setSpeed = (speed) => {
    const target = Number(speed);
    if (![1, 5, 20, 40].includes(target)) return;
    const button = document.querySelector(`#speedSelector .speed-btn[data-speed="${target}"]`);
    if (button) {
      // Use the ORIGINAL speed handler rather than changing game-loop state ourselves.
      button.click();
      return;
    }
    try { state.speedMultiplier = target; } catch (_) {}
  };

  const stepOriginalEngine = () => {
    if (typeof state === 'undefined' || state.isEnded) return;
    if (state.isPlaying) setPlaying(false);
    if (typeof stepForward === 'function') stepForward();
  };

  const setStrategy = (strategy) => {
    if (typeof state === 'undefined') return;
    if (!strategy) {
      state.ghostData = [];
      state.ghostFull = [];
      state.__ghostWindowed = [];
      state.actionIndex = null;
      window.__tradeStrategyReplayImportedStrategy = false;
    } else {
      const actions = Array.isArray(strategy.actions)
        ? strategy.actions
          .map((action) => ({
            ...action,
            time: Number(action.time),
            price: Number(action.price),
            qty: Number(action.qty ?? action.volume ?? action.lots ?? 1),
          }))
          .filter((action) => Number.isFinite(action.time) && Number.isFinite(action.price) && Number.isFinite(action.qty) && action.qty > 0)
          .sort((a, b) => a.time - b.time)
        : [];
      const record = {
        instrument: state.selectedInstrument,
        session: 'workspace',
        label: strategy.name || 'Strategy',
        equity: 0,
        profit: 0,
        actions,
      };
      state.ghostData = [record];
      state.ghostFull = [record];
      state.__ghostWindowed = [record];
      state.actionIndex = null;
      window.__tradeStrategyReplayImportedStrategy = true;
    }

    try { if (window.GhostPlayer) window.GhostPlayer.resetGhostPlayer(); } catch (_) {}
    try { if (window.GhostBubbles) window.GhostBubbles.clearGhostBubbles(); } catch (_) {}
    try { if (typeof window.rebuildGhostActionIndex === 'function') window.rebuildGhostActionIndex(); } catch (_) {}
    try {
      // Do not replay historical actions instantly. From this moment onward the original
      // GhostPlayer will reveal them as the original gameLoop advances.
      state.lastGhostTime = currentSimTimeSec() * 1000 - 1;
    } catch (_) {}
    try { if (typeof draw === 'function') requestAnimationFrame(draw); } catch (_) {}
  };

  const emitStatus = () => {
    try {
      if (typeof state === 'undefined' || state.isLoading || !state.m5GameData?.length) return;
      window.parent.postMessage({
        type: 'tsr-frame-status',
        chartId,
        symbol: state.selectedInstrument,
        timeframe: state.selectedTimeframe,
        timeSec: currentSimTimeSec(),
        price: currentPrice(),
        equity: Number(state.equity || 0),
        floatingPL: Number(state.floatingPL || 0),
        positions: Number(state.openPositions?.length || 0),
        playing: !!state.isPlaying,
        speed: Number(state.speedMultiplier || 1),
      }, location.origin);
    } catch (_) {}
  };

  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin) return;
    const message = event.data || {};
    if (message.chartId && message.chartId !== chartId) return;

    if (message.type === 'tsr-workspace-play') setPlaying(true);
    else if (message.type === 'tsr-workspace-pause') setPlaying(false);
    else if (message.type === 'tsr-workspace-step') stepOriginalEngine();
    else if (message.type === 'tsr-workspace-speed') setSpeed(message.speed);
    else if (message.type === 'tsr-workspace-strategy') setStrategy(message.strategy);
  });

  let announced = false;
  const waitReady = () => {
    try {
      if (!announced && typeof state !== 'undefined' && !state.isLoading && state.m5GameData?.length && state.chart?.canvas) {
        announced = true;
        // Workspace frames start paused, but everything else remains the original engine.
        setPlaying(false);
        try { if (typeof resizeCanvas === 'function') resizeCanvas(); } catch (_) {}
        try { if (typeof draw === 'function') requestAnimationFrame(draw); } catch (_) {}
        window.parent.postMessage({
          type: 'tsr-frame-ready',
          chartId,
          symbol: state.selectedInstrument,
          timeframe: state.selectedTimeframe,
          firstSec: Number(state.m5GameData[0].time),
          lastSec: Number(state.m5GameData[state.m5GameData.length - 1].time),
        }, location.origin);
        emitStatus();
      }
    } catch (_) {}
    if (!announced) requestAnimationFrame(waitReady);
  };

  requestAnimationFrame(waitReady);
  setInterval(emitStatus, 150);
})();
