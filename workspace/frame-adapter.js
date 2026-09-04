(() => {
  const params = new URLSearchParams(location.search);
  if (params.get('workspace') !== '1') return;

  const chartId = params.get('chartId') || 'chart';
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  // Workspace frames are the ORIGINAL SoyaPlayableAd chart engine.
  // We only remove page-level chrome that belongs to the standalone experience.
  // chart.js / ui.js / main.js remain responsible for animation, drag, zoom and rendering.
  const style = document.createElement('style');
  style.id = 'tsr-workspace-frame-style';
  style.textContent = `
    html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#fff!important}
    .header,.bottom-content-v9,.controls-right,#tsr-performance-race,#notification-container,.footer-ad{display:none!important}
    .main-container-v9{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;display:block!important;padding:0!important;margin:0!important}
    .chart-container-v9{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;display:block!important;padding:0!important;margin:0!important}
    .chart-wrap{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;min-height:0!important;border:0!important;background:#fff!important}
    #chartCanvas{width:100%!important;height:100%!important;display:block!important}
    .loader-wrap{background:#fff!important}.loader-scene{display:none!important}#loader-status p{font-size:11px!important;color:#94a3b8!important}

    /* Keep the original chart interaction layer. Only retain its zoom controls because
       symbol/timeframe/playback are controlled by the workspace header. */
    .controls-overlay-container{display:block!important;pointer-events:none!important}
    .controls-left{display:block!important;left:8px!important;top:8px!important;pointer-events:none!important;background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important}
    .controls-left .collapsible-controls{display:flex!important;opacity:1!important;visibility:visible!important;max-height:none!important;overflow:visible!important;gap:4px!important;pointer-events:none!important}
    .controls-left .control-group,#timeframeSelector,#btnPlayPause,#btnStepForward,#speedSelector,#btnToggleControls{display:none!important}
    #btnZoomIn,#btnZoomOut{display:inline-flex!important;pointer-events:auto!important;width:30px!important;height:30px!important;padding:0!important;align-items:center!important;justify-content:center!important;background:rgba(255,255,255,.92)!important;border:1px solid rgba(148,163,184,.55)!important;color:#475569!important;box-shadow:0 2px 8px rgba(15,23,42,.08)!important}
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
