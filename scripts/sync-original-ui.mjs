import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const SOURCE_REPO = 'bless25min/SoyaPlayableAd';
const SOURCE_BRANCH = 'main';
const API_TREE = `https://api.github.com/repos/${SOURCE_REPO}/git/trees/${SOURCE_BRANCH}?recursive=1`;
const RAW_BASE = `https://raw.githubusercontent.com/${SOURCE_REPO}/${SOURCE_BRANCH}`;
const classicRoot = path.resolve(process.cwd(), 'public/classic');
const performanceRoot = path.resolve(process.cwd(), 'public/performance');
const outputRoots = [classicRoot, performanceRoot];

const wanted = (sourcePath) => {
  if (sourcePath === 'public/game.html') return true;
  if (sourcePath === 'public/privacy.html') return true;
  if (sourcePath === 'public/favicon.ico') return true;
  if (sourcePath === 'public/logo.jpeg') return true;
  if (sourcePath.startsWith('public/js/') && sourcePath.endsWith('.js')) return true;
  if (sourcePath.startsWith('public/scripts/ghost/') && sourcePath.endsWith('.js')) return true;
  if (sourcePath.startsWith('public/scripts/overlay/') && sourcePath.endsWith('.js')) return true;
  if (sourcePath.startsWith('public/images/')) return true;
  return false;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fetchOrThrow = async (url) => {
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'TradeStrategyReplay-build', Accept: '*/*' },
        signal: AbortSignal.timeout(20000),
      });
      if (response.ok) return response;
      lastError = new Error(`Failed to fetch ${url}: ${response.status}`);
      if (![408, 429, 500, 502, 503, 504].includes(response.status)) throw lastError;
    } catch (error) { lastError = error; }
    if (attempt < 4) await sleep(350 * (2 ** (attempt - 1)));
  }
  throw lastError || new Error(`Failed to fetch ${url}`);
};

const commonPatch = (html, title) => {
  let output = html;
  output = output.replace(/<!-- Meta Pixel Code -->[\s\S]*?<!-- End Meta Pixel Code -->/g, '');
  output = output.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`);
  output = output.replace(/<script charset="utf-8" src="https:\/\/static\.line-scdn\.net\/liff\/edge\/2\/sdk\.js"><\/script>\s*<!-- LIFF SDK -->/i, '');
  output = output.replace(/\s*<script src="js\/auth\.js"><\/script>\s*<!-- auth\.js handles everything now -->/i, '');
  return output;
};

const patchClassicGameHtml = (html) => {
  let output = commonPatch(html, 'TradeStrategyReplay｜歷史策略交易模擬');
  output = output.replace('</head>', '<style>#login-container{display:none!important}</style>\n</head>');
  output = output.replace('</body>', '    <script src="strategy-adapter.js"></script>\n</body>');
  return output;
};

const patchPerformanceGameHtml = (html) => {
  let output = commonPatch(html, 'TradeStrategyReplay｜策略績效圖表');
  output = output.replace(/\s*<script src="js\/rpg\.js"><\/script>/i, '');
  output = output.replace(/\s*<script src="js\/rpg_ui\.js"><\/script>/i, '');
  output = output.replace('</head>', `<style>
    #login-container,.loader-scene,#challengeInfo,#btnEndGame,#notification-container,
    .tutorial-highlight,.tutorial-message,.achievements-section,.bonus-challenge-section,
    #endGameModal,#stageCompleteModal,#challengeFailedModal,#nightmareRulesModal,.wave-timer,.footer-ad{display:none!important}
  </style>\n</head>`);
  output = output.replace('</body>', `    <script src="strategy-adapter.js"></script>
    <script src="performance-adapter.js"></script>
    <script src="frame-adapter.js"></script>
</body>`);
  return output;
};

const patchDataJs = (source) => source.replace(
  'const dataPath = `/${instrument}_M5.csv`;',
  'const dataPath = `/legacy-source/${instrument}_M5.csv`;',
);

const patchMainGhostPaths = (source) => source
  .replace("{ url: 'SoyaRecord.json', label: 'Soya', defaultSymbol: 'XAUUSD' }", "{ url: '/legacy-source/SoyaRecord.json', label: 'Soya', defaultSymbol: 'XAUUSD' }")
  .replace("{ url: 'KentRecord.json', label: 'Kent', defaultSymbol: 'NAS100' }", "{ url: '/legacy-source/KentRecord.json', label: 'Kent', defaultSymbol: 'NAS100' }");

const patchPerformanceMainJs = (source) => {
  let output = patchMainGhostPaths(source)
    .replace('let startFunds = 5000;', 'let startFunds = 10000;')
    .replace("if (localStorage.getItem('invite_bonus')) startFunds += 5000;", '// Performance variant uses a fixed comparison baseline.')
    .replace(
      'if (rpgState && !rpgState.firstWaveTriggered && !rpgState.friendlyMode && state.gameStartTime) {',
      "if (typeof rpgState !== 'undefined' && rpgState && !rpgState.firstWaveTriggered && !rpgState.friendlyMode && state.gameStartTime) {",
    )
    .replace(
      'state.equity = startFunds;\n  state.balance = startFunds;',
      `state.equity = startFunds;
  state.balance = startFunds;
  window.__tsrPerformanceBaselineEquity = startFunds;
  window.__tsrPerformanceStartSec = state.m5GameData?.[0]?.time || state.gameData?.[0]?.time || 0;`,
    );

  // Workspace frames receive their instrument/timeframe from the parent page.
  output = output.replace(
    "const mode = urlParams.get('mode');",
    `const mode = urlParams.get('mode');
  if (urlParams.get('workspace') === '1') {
    const workspaceSymbol = (urlParams.get('symbol') || '').toUpperCase();
    const workspaceTimeframe = (urlParams.get('timeframe') || '').toUpperCase();
    if (workspaceSymbol) state.selectedInstrument = workspaceSymbol;
    if (['M5','M15','M30','H1','H4','D1'].includes(workspaceTimeframe)) state.selectedTimeframe = workspaceTimeframe;
  }`,
  );
  output = output.replace(
    'cacheDOMElements();\n  setupEventListeners();',
    `cacheDOMElements();
  if (urlParams.get('workspace') === '1') {
    if (DOM.instrumentSelector) DOM.instrumentSelector.value = state.selectedInstrument;
    document.querySelectorAll('.timeframe-btn').forEach((button) => button.classList.toggle('active', button.dataset.timeframe === state.selectedTimeframe));
  }
  setupEventListeners();`,
  );

  // A workspace session chooses an explicit historical date range instead of a random 30-day slice.
  output = output.replace(
    'function selectRandomDataSegment(sourceData) {\n  if (sourceData.length === 0) return [];',
    `function selectRandomDataSegment(sourceData) {
  if (sourceData.length === 0) return [];
  const workspaceParams = new URLSearchParams(window.location.search);
  if (workspaceParams.get('workspace') === '1' && workspaceParams.get('start') && workspaceParams.get('end')) {
    const startMs = Date.parse(workspaceParams.get('start') + 'T00:00:00Z');
    const endMs = Date.parse(workspaceParams.get('end') + 'T23:59:59Z');
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
      const startSec = Math.floor(startMs / 1000);
      const endSec = Math.floor(endMs / 1000);
      return sourceData.filter((bar) => bar.time >= startSec && bar.time <= endSec);
    }
  }`,
  );

  // Workspace frames still use the original gameLoop, but start paused so the parent can
  // issue a synchronized Play command to all original chart engines.
  output = output.replace(
    'state.isPlaying = true;',
    "state.isPlaying = new URLSearchParams(window.location.search).get('workspace') !== '1';",
  );
  return output;
};

const main = async () => {
  for (const root of outputRoots) {
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
  }

  const treeResponse = await fetchOrThrow(API_TREE);
  const tree = await treeResponse.json();
  const files = (tree.tree ?? []).filter((entry) => entry.type === 'blob' && wanted(entry.path));
  if (!files.length) throw new Error('No original UI files found to sync.');

  for (const entry of files) {
    const relative = entry.path.replace(/^public\//, '');
    const response = await fetchOrThrow(`${RAW_BASE}/${entry.path}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    for (const root of outputRoots) {
      const destination = path.join(root, relative);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, bytes);
    }
  }

  const classicGamePath = path.join(classicRoot, 'game.html');
  const performanceGamePath = path.join(performanceRoot, 'game.html');
  const classicDataPath = path.join(classicRoot, 'js/data.js');
  const performanceDataPath = path.join(performanceRoot, 'js/data.js');
  const classicMainPath = path.join(classicRoot, 'js/main.js');
  const performanceMainPath = path.join(performanceRoot, 'js/main.js');

  await writeFile(classicGamePath, patchClassicGameHtml(await readFile(classicGamePath, 'utf8')), 'utf8');
  await writeFile(performanceGamePath, patchPerformanceGameHtml(await readFile(performanceGamePath, 'utf8')), 'utf8');

  await writeFile(classicDataPath, patchDataJs(await readFile(classicDataPath, 'utf8')), 'utf8');
  await writeFile(performanceDataPath, patchDataJs(await readFile(performanceDataPath, 'utf8')), 'utf8');
  await writeFile(classicMainPath, patchMainGhostPaths(await readFile(classicMainPath, 'utf8')), 'utf8');
  await writeFile(performanceMainPath, patchPerformanceMainJs(await readFile(performanceMainPath, 'utf8')), 'utf8');

  const strategyAdapter = await readFile(path.resolve(process.cwd(), 'classic/strategy-adapter.js'));
  await writeFile(path.join(classicRoot, 'strategy-adapter.js'), strategyAdapter);
  await writeFile(path.join(performanceRoot, 'strategy-adapter.js'), strategyAdapter);
  await writeFile(path.join(performanceRoot, 'performance-adapter.js'), await readFile(path.resolve(process.cwd(), 'performance/performance-adapter.js')));
  await writeFile(path.join(performanceRoot, 'frame-adapter.js'), await readFile(path.resolve(process.cwd(), 'workspace/frame-adapter.js')));

  // /performance/ is the multi-chart research shell. Each frame remains the original
  // SoyaPlayableAd chart/replay engine; the shell only synchronizes native controls.
  await writeFile(path.join(performanceRoot, 'index.html'), await readFile(path.resolve(process.cwd(), 'workspace/index.html')));
  await writeFile(path.join(performanceRoot, 'workspace.js'), await readFile(path.resolve(process.cwd(), 'workspace/workspace-v2.js')));

  console.log(`Synced ${files.length} original SoyaPlayableAd UI assets into public/classic and the /performance multi-chart workspace.`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
