(() => {
  const params = new URLSearchParams(location.search);
  if (params.get('workspace') !== '1') return;
  const chartId = params.get('chartId') || 'chart';

  const style = document.createElement('style');
  style.textContent = `
    html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#fff!important}
    .header,.bottom-content-v9,.controls-overlay-container,#tsr-performance-race,#notification-container,.footer-ad{display:none!important}
    .main-container-v9{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;display:block!important;padding:0!important;margin:0!important}
    .chart-container-v9{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;display:block!important;padding:0!important;margin:0!important}
    .chart-wrap{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;min-height:0!important;border:0!important}
    #chartCanvas{width:100%!important;height:100%!important;display:block!important}
    #chartOverlay{pointer-events:none!important}
    .loader-wrap{background:#fff!important}.loader-scene{display:none!important}#loader-status p{font-size:11px!important;color:#94a3b8!important}
  `;
  document.head.appendChild(style);

  const binaryIndex = (arr, timeSec) => {
    let lo = 0, hi = arr.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if ((arr[mid]?.time ?? 0) <= timeSec) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans;
  };

  const partialBar = (bar, progress) => {
    if (!bar) return null;
    const p = Math.max(0, Math.min(1, Number(progress) || 0));
    const wick = Math.min(1, p * 2);
    const close = bar.open + (bar.close - bar.open) * p;
    const high = Math.max(bar.open, close, bar.open + (bar.high - bar.open) * wick);
    const low = Math.min(bar.open, close, bar.open + (bar.low - bar.open) * wick);
    return { time: bar.time, open: bar.open, high, low, close };
  };

  const rebuildLiveResampled = (timeSec) => {
    if (!state?.m5GameData?.length || !state?.rawData?.length) return;
    const m5 = state.m5GameData;
    const ri = Math.max(0, binaryIndex(state.rawData, timeSec));
    state.currentIndex = ri;
    const groupStart = state.rawData[ri]?.time ?? m5[0].time;
    const mi = Math.max(0, binaryIndex(m5, timeSec));
    state.m5Index = mi;
    const current = m5[mi];
    const nextTime = m5[mi + 1]?.time ?? (current.time + 300);
    const progress = Math.max(0, Math.min(1, (timeSec - current.time) / Math.max(1, nextTime - current.time)));
    state.barAnimationProgress = progress;

    let aggregate = null;
    for (let i = 0; i < mi; i++) {
      const bar = m5[i];
      if (bar.time < groupStart) continue;
      if (!aggregate) aggregate = { time: groupStart, open: bar.open, high: bar.high, low: bar.low, close: bar.close };
      else { aggregate.high = Math.max(aggregate.high, bar.high); aggregate.low = Math.min(aggregate.low, bar.low); aggregate.close = bar.close; }
    }
    const live = partialBar(current, progress);
    if (live && current.time >= groupStart) {
      if (!aggregate) aggregate = { time: groupStart, open: state.rawData[ri]?.open ?? live.open, high: live.high, low: live.low, close: live.close };
      else { aggregate.high = Math.max(aggregate.high, live.high); aggregate.low = Math.min(aggregate.low, live.low); aggregate.close = live.close; }
    }
    state.liveResampledBar = aggregate;
    state.chart.scrollOffset = 0;
  };

  const currentPrice = () => {
    try {
      if (typeof getCurrentPrice === 'function') return Number(getCurrentPrice());
    } catch (_) {}
    const bar = state?.m5GameData?.[state?.m5Index || 0];
    const partial = partialBar(bar, state?.barAnimationProgress || 0);
    return Number(partial?.close ?? bar?.close ?? 0);
  };

  const emitStatus = () => {
    window.parent.postMessage({
      type: 'tsr-frame-status', chartId,
      symbol: state?.selectedInstrument,
      timeframe: state?.selectedTimeframe,
      timeSec: Number(state?.m5GameData?.[state?.m5Index || 0]?.time || 0),
      price: currentPrice(),
      equity: Number(state?.equity || 0),
    }, location.origin);
  };

  const seek = (timeSec) => {
    if (!state?.m5GameData?.length) return;
    const first = state.m5GameData[0].time;
    const last = state.m5GameData[state.m5GameData.length - 1].time + 299;
    const t = Math.max(first, Math.min(last, Number(timeSec) || first));
    state.isPlaying = false;
    state.isEnded = false;
    rebuildLiveResampled(t);
    try { if (typeof updatePositions === 'function') updatePositions(); } catch (_) {}
    try { if (typeof updateAccount === 'function') updateAccount(); } catch (_) {}
    try { if (typeof updateHUD === 'function') updateHUD(); } catch (_) {}
    try { if (typeof draw === 'function') draw(); } catch (_) {}
    emitStatus();
  };

  const setStrategy = (strategy) => {
    if (!strategy) {
      state.ghostData = []; state.ghostFull = []; state.actionIndex = null;
      window.__tradeStrategyReplayImportedStrategy = false;
    } else {
      const actions = Array.isArray(strategy.actions) ? strategy.actions.map((a) => ({ ...a, time: Number(a.time), price: Number(a.price), qty: Number(a.qty ?? a.volume ?? 1) })) : [];
      const record = { instrument: state.selectedInstrument, session: 'workspace', label: strategy.name || 'Strategy', equity: 0, profit: 0, actions };
      state.ghostData = [record]; state.ghostFull = [record]; state.__ghostWindowed = [record];
      window.__tradeStrategyReplayImportedStrategy = true;
      try { if (window.GhostPlayer) window.GhostPlayer.resetGhostPlayer(); } catch (_) {}
      try { if (window.GhostBubbles) window.GhostBubbles.clearGhostBubbles(); } catch (_) {}
      try { if (typeof window.rebuildGhostActionIndex === 'function') window.rebuildGhostActionIndex(); } catch (_) {}
    }
    try { if (typeof draw === 'function') draw(); } catch (_) {}
  };

  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin) return;
    const msg = event.data || {};
    if (msg.chartId && msg.chartId !== chartId) return;
    if (msg.type === 'tsr-workspace-seek') seek(msg.timeSec);
    if (msg.type === 'tsr-workspace-strategy') setStrategy(msg.strategy);
  });

  let announced = false;
  const waitReady = () => {
    try {
      if (!announced && typeof state !== 'undefined' && !state.isLoading && state.m5GameData?.length && state.chart?.canvas) {
        announced = true;
        state.isPlaying = false;
        try { if (typeof resizeCanvas === 'function') resizeCanvas(); } catch (_) {}
        window.parent.postMessage({
          type: 'tsr-frame-ready', chartId,
          symbol: state.selectedInstrument,
          timeframe: state.selectedTimeframe,
          firstSec: state.m5GameData[0].time,
          lastSec: state.m5GameData[state.m5GameData.length - 1].time,
        }, location.origin);
        emitStatus();
      }
    } catch (_) {}
    requestAnimationFrame(waitReady);
  };
  requestAnimationFrame(waitReady);
})();
