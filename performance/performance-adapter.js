(() => {
  // This variant intentionally keeps the original trading/chart engine and disables
  // game-only presentation. It then mounts the original EquityRace engine as the
  // primary comparison between the user's return and the selected strategy return.
  window.initRPG = null;
  window.createRPGOverlay = null;

  const css = document.createElement('style');
  css.id = 'tsr-performance-style';
  css.textContent = `
    /* Remove game-only presentation; keep trading/chart controls intact. */
    #rpg-panel,.loader-scene,#challengeInfo,#btnEndGame,#notification-container,
    .tutorial-highlight,.tutorial-message,.achievements-section,.bonus-challenge-section,
    #endGameModal,#stageCompleteModal,#challengeFailedModal,#nightmareRulesModal,
    .wave-timer,.footer-ad{display:none!important}
    body{background:#fff}
    .main-container-v9{padding-bottom:0}
    .chart-container-v9{padding-bottom:8px}

    #tsr-performance-race{
      position:absolute;left:14px;right:74px;bottom:10px;z-index:850;
      min-height:104px;padding:10px 14px 9px;border:1px solid rgba(15,23,42,.12);
      border-radius:10px;background:rgba(255,255,255,.94);backdrop-filter:blur(8px);
      box-shadow:0 6px 22px rgba(15,23,42,.08);pointer-events:none;
      font-family:'Segoe UI','Noto Sans TC',sans-serif;
    }
    .tsr-race-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:7px}
    .tsr-race-title{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:800;color:#111827}
    .tsr-race-title::before{content:'';width:7px;height:7px;border-radius:50%;background:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.12)}
    .tsr-race-summary{font-size:11px;font-weight:700;color:#475569;white-space:nowrap}
    .tsr-race-summary.you-lead{color:#d97706}.tsr-race-summary.strategy-lead{color:#2563eb}
    .tsr-race-axis{position:relative;height:18px;margin:0 8px;color:#94a3b8;font-size:9px}
    .tsr-race-axis::before{content:'';position:absolute;left:0;right:0;top:8px;border-top:1px solid #cbd5e1}
    .tsr-axis-tick{position:absolute;top:0;transform:translateX(-50%);text-align:center;min-width:28px}
    .tsr-axis-tick::after{content:'';display:block;width:1px;height:7px;background:#cbd5e1;margin:1px auto 0}
    .tsr-axis-tick.zero{font-weight:800;color:#64748b}
    #tsr-race-mount{position:relative;height:51px;margin:0 8px;overflow:visible}
    #tsr-race-mount #equity-race{height:43px!important;left:0!important;right:0!important;bottom:0!important}
    #tsr-race-mount #equity-race>div:first-child{top:20px!important;border-top:1px dashed #94a3b8!important;opacity:.6!important}
    #tsr-race-mount .equity-race-chip{
      top:18px!important;height:24px!important;line-height:20px!important;padding:2px 9px!important;
      font-size:11px!important;font-weight:800!important;border-radius:7px!important;
      box-shadow:0 2px 8px rgba(15,23,42,.16)!important;transition:transform .09s linear!important;
    }
    #tsr-race-mount .equity-race-chip>span:first-child{display:none!important}
    #tsr-race-mount .equity-race-chip.you{background:#f59e0b!important;color:#fff!important}
    #tsr-race-mount .equity-race-chip:not(.you){background:#2563eb!important;color:#fff!important}
    #tsr-race-mount .equity-race-chip.win:not(.you){background:#2563eb!important}
    #tsr-race-mount .equity-race-chip.lose:not(.you){background:#475569!important}
    .tsr-race-legend{display:flex;gap:14px;align-items:center;margin-top:1px;font-size:9px;color:#64748b}
    .tsr-race-legend span{display:flex;gap:5px;align-items:center}.tsr-race-legend i{width:7px;height:7px;border-radius:50%;display:block}
    .tsr-race-legend .you-dot{background:#f59e0b}.tsr-race-legend .strategy-dot{background:#2563eb}

    @media(max-width:900px){
      #tsr-performance-race{left:8px;right:68px;bottom:8px;min-height:92px;padding:8px 9px}
      .tsr-race-head{margin-bottom:4px}.tsr-race-title{font-size:11px}.tsr-race-summary{font-size:9px}
      .tsr-race-axis{margin:0 3px}.tsr-race-legend{display:none}
      #tsr-race-mount{height:45px;margin:0 3px}
    }
  `;
  document.head.appendChild(css);

  const strategyGhosts = () => {
    const imported = !!window.__tradeStrategyReplayImportedStrategy;
    const source = imported
      ? (state.ghostData || [])
      : ((state.ghostFull && state.ghostFull.length ? state.ghostFull : state.ghostData) || []);
    if (!Array.isArray(source) || !source.length) return [];
    const symbol = String(state.selectedInstrument || '').toUpperCase();
    const teacher = source.filter((g) => {
      const label = String(g?.label || '').toLowerCase();
      if (symbol === 'XAUUSD') return label.includes('soya');
      if (symbol === 'NAS100') return label.includes('kent');
      return true;
    });
    return (teacher.length ? teacher : source).slice(0, 1);
  };

  const buildRaceShell = () => {
    const chartWrap = document.getElementById('chartWrap');
    if (!chartWrap) return null;
    let shell = document.getElementById('tsr-performance-race');
    if (shell) return shell;
    shell = document.createElement('div');
    shell.id = 'tsr-performance-race';
    shell.innerHTML = `
      <div class="tsr-race-head">
        <div class="tsr-race-title">同期績效競速</div>
        <div class="tsr-race-summary" id="tsr-race-summary">你 0.00% ｜ 策略 0.00%</div>
      </div>
      <div class="tsr-race-axis">
        <span class="tsr-axis-tick" style="left:0%">-20%</span>
        <span class="tsr-axis-tick" style="left:25%">-10%</span>
        <span class="tsr-axis-tick zero" style="left:50%">0%</span>
        <span class="tsr-axis-tick" style="left:75%">+10%</span>
        <span class="tsr-axis-tick" style="left:100%">+20%</span>
      </div>
      <div id="tsr-race-mount"></div>
      <div class="tsr-race-legend"><span><i class="you-dot"></i>你的模擬績效</span><span><i class="strategy-dot"></i>策略同期績效</span></div>`;
    chartWrap.appendChild(shell);
    return shell;
  };

  const nowMs = () => {
    const live = state.m5GameData?.[state.m5Index];
    const fallback = state.gameData?.[state.currentIndex];
    return Number((live?.time ?? fallback?.time ?? 0) * 1000) || Date.now();
  };

  const wire = () => {
    if (!window.EquityRace) return false;
    const shell = buildRaceShell();
    const mount = document.getElementById('tsr-race-mount');
    if (!shell || !mount || !state.m5GameData?.length) return false;
    const ghosts = strategyGhosts();
    const first = state.m5GameData[0]?.time ?? 0;
    const last = state.m5GameData[state.m5GameData.length - 1]?.time ?? first;
    const halfTrack = Math.max(100, (mount.clientWidth || 500) / 2 - 44);
    // EquityRace maps 100 percentage points to laneMaxPx. We want +/-20% to fill the track.
    const laneMaxPx = halfTrack * 5;

    window.EquityRace.mount(mount);
    window.EquityRace.wireAdapters({
      getSelfEquity: () => Number(state.equity) || Number(CONFIG.INITIAL_BALANCE) || 10000,
      getGhosts: () => ghosts,
      getGhostsFull: () => ghosts,
      getLastPrice: () => Number(typeof getCurrentPrice === 'function' ? getCurrentPrice() : state.m5GameData?.[state.m5Index]?.close),
      getPriceAtMs: () => null,
      getYouLabel: () => '你',
      getLaneMaxPx: () => laneMaxPx,
      getInitialBalance: () => Number(CONFIG.INITIAL_BALANCE) || 10000,
      getContractSize: () => Number(CONFIG.CONTRACT_SIZE) || 100,
      getContextKey: () => `${state.selectedInstrument}|${first}|${last}|${ghosts.map((g) => g.label).join(',')}`,
      getWindowRangeMs: () => ({ fromMs: first * 1000, toMs: last * 1000 }),
      getBarTimes: () => state.m5GameData.map((bar) => bar.time * 1000),
      getBarCloses: () => state.m5GameData.map((bar) => bar.close),
      getBarIndex: () => state.m5Index || 0,
      getBarProgress: () => state.barAnimationProgress || 0,
    });
    window.EquityRace.redrawNow(nowMs());
    return true;
  };

  const parsePct = (text) => {
    const match = String(text || '').match(/([+\-−]?\d+(?:\.\d+)?)%/);
    if (!match) return null;
    return Number(match[1].replace('−', '-'));
  };

  const updateSummary = () => {
    const summary = document.getElementById('tsr-race-summary');
    const lane = document.getElementById('equity-race');
    if (!summary || !lane) return;
    const chips = [...lane.querySelectorAll('.equity-race-chip')];
    const youChip = chips.find((chip) => chip.classList.contains('you'));
    const strategyChip = chips.find((chip) => !chip.classList.contains('you'));
    const you = parsePct(youChip?.textContent) ?? 0;
    const strategy = parsePct(strategyChip?.textContent) ?? 0;
    const gap = you - strategy;
    summary.className = `tsr-race-summary ${gap > 0.005 ? 'you-lead' : gap < -0.005 ? 'strategy-lead' : ''}`;
    if (!strategyChip) summary.textContent = `你 ${you >= 0 ? '+' : ''}${you.toFixed(2)}% ｜ 策略尚未進場`;
    else if (Math.abs(gap) < 0.005) summary.textContent = `你 ${you >= 0 ? '+' : ''}${you.toFixed(2)}% ｜ 策略 ${strategy >= 0 ? '+' : ''}${strategy.toFixed(2)}% ｜ 持平`;
    else summary.textContent = `你 ${you >= 0 ? '+' : ''}${you.toFixed(2)}% ｜ 策略 ${strategy >= 0 ? '+' : ''}${strategy.toFixed(2)}% ｜ ${gap > 0 ? '你領先' : '策略領先'} ${Math.abs(gap).toFixed(2)}%`;
  };

  let lastContext = '';
  let lastBar = -1;
  let mounted = false;
  const loop = () => {
    try {
      if (typeof state !== 'undefined' && !state.isLoading && state.m5GameData?.length && window.EquityRace) {
        const ghosts = strategyGhosts();
        const context = `${state.selectedInstrument}|${state.m5GameData[0]?.time}|${state.m5GameData.length}|${ghosts.map((g) => `${g.label}:${g.actions?.length || 0}`).join(',')}|${window.__tradeStrategyReplayImportedStrategy ? 'import' : 'builtin'}`;
        if (!mounted || context !== lastContext) {
          mounted = wire();
          lastContext = context;
          lastBar = -1;
        }
        if (mounted) {
          if (lastBar !== state.m5Index) {
            lastBar = state.m5Index;
            window.EquityRace.updateAtBar({ toMs: nowMs() });
          }
          window.EquityRace.onBarProgress({ progress: state.barAnimationProgress || 0 });
          updateSummary();
        }
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
