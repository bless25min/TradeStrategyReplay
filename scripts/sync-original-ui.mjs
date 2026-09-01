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

const fetchOrThrow = async (url) => {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'TradeStrategyReplay-build',
      Accept: '*/*',
    },
  });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response;
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
  let output = commonPatch(html, 'TradeStrategyReplay｜策略績效競速');
  // RPG scripts are not loaded in the performance variant. The original chart,
  // trading, replay, zoom, drag and position UI remain untouched.
  output = output.replace(/\s*<script src="js\/rpg\.js"><\/script>/i, '');
  output = output.replace(/\s*<script src="js\/rpg_ui\.js"><\/script>/i, '');
  output = output.replace('</head>', `<style>
    #login-container,.loader-scene,#challengeInfo,#btnEndGame,#notification-container,
    .tutorial-highlight,.tutorial-message,.achievements-section,.bonus-challenge-section,
    #endGameModal,#stageCompleteModal,#challengeFailedModal,#nightmareRulesModal,.wave-timer,.footer-ad{display:none!important}
  </style>\n</head>`);
  output = output.replace('</body>', `    <script src="scripts/overlay/equity-race.js"></script>
    <script src="strategy-adapter.js"></script>
    <script src="performance-adapter.js"></script>
</body>`);
  return output;
};

const patchDataJs = (source) => source.replace(
  'const dataPath = `/${instrument}_M5.csv`;',
  'const dataPath = `/legacy-source/${instrument}_M5.csv`;',
);

const patchPerformanceMainJs = (source) => source
  .replace('let startFunds = 5000;', 'let startFunds = 10000;')
  .replace("if (localStorage.getItem('invite_bonus')) startFunds += 5000;", '// Performance variant uses a fixed comparison baseline.');

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
  const performanceMainPath = path.join(performanceRoot, 'js/main.js');

  await writeFile(classicGamePath, patchClassicGameHtml(await readFile(classicGamePath, 'utf8')), 'utf8');
  await writeFile(performanceGamePath, patchPerformanceGameHtml(await readFile(performanceGamePath, 'utf8')), 'utf8');
  // /performance/ should open directly without requiring /game.html.
  await writeFile(path.join(performanceRoot, 'index.html'), await readFile(performanceGamePath), 'utf8');

  await writeFile(classicDataPath, patchDataJs(await readFile(classicDataPath, 'utf8')), 'utf8');
  await writeFile(performanceDataPath, patchDataJs(await readFile(performanceDataPath, 'utf8')), 'utf8');
  await writeFile(performanceMainPath, patchPerformanceMainJs(await readFile(performanceMainPath, 'utf8')), 'utf8');

  const strategyAdapter = await readFile(path.resolve(process.cwd(), 'classic/strategy-adapter.js'));
  await writeFile(path.join(classicRoot, 'strategy-adapter.js'), strategyAdapter);
  await writeFile(path.join(performanceRoot, 'strategy-adapter.js'), strategyAdapter);
  await writeFile(
    path.join(performanceRoot, 'performance-adapter.js'),
    await readFile(path.resolve(process.cwd(), 'performance/performance-adapter.js')),
  );

  console.log(`Synced ${files.length} original SoyaPlayableAd UI assets into public/classic and public/performance.`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
