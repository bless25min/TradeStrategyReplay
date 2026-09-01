import { mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const SOURCE_REPO = 'bless25min/SoyaPlayableAd';
const SOURCE_BRANCH = 'main';
const API_TREE = `https://api.github.com/repos/${SOURCE_REPO}/git/trees/${SOURCE_BRANCH}?recursive=1`;
const RAW_BASE = `https://raw.githubusercontent.com/${SOURCE_REPO}/${SOURCE_BRANCH}`;
const outputRoot = path.resolve(process.cwd(), 'public/classic');

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

const patchGameHtml = (html) => {
  let output = html;
  output = output.replace(/<!-- Meta Pixel Code -->[\s\S]*?<!-- End Meta Pixel Code -->/g, '');
  output = output.replace(/<title>[\s\S]*?<\/title>/i, '<title>TradeStrategyReplay｜歷史策略交易模擬</title>');
  output = output.replace(/<script charset="utf-8" src="https:\/\/static\.line-scdn\.net\/liff\/edge\/2\/sdk\.js"><\/script>\s*<!-- LIFF SDK -->/i, '');
  output = output.replace(/\s*<script src="js\/auth\.js"><\/script>\s*<!-- auth\.js handles everything now -->/i, '');
  output = output.replace('</head>', '<style>#login-container{display:none!important}</style>\n</head>');
  output = output.replace('</body>', '    <script src="strategy-adapter.js"></script>\n</body>');
  return output;
};

const patchDataJs = (source) => source.replace(
  'const dataPath = `/${instrument}_M5.csv`;',
  'const dataPath = `/legacy-source/${instrument}_M5.csv`;',
);

const main = async () => {
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });

  const treeResponse = await fetchOrThrow(API_TREE);
  const tree = await treeResponse.json();
  const files = (tree.tree ?? []).filter((entry) => entry.type === 'blob' && wanted(entry.path));
  if (!files.length) throw new Error('No original UI files found to sync.');

  for (const entry of files) {
    const relative = entry.path.replace(/^public\//, '');
    const destination = path.join(outputRoot, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    const response = await fetchOrThrow(`${RAW_BASE}/${entry.path}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(destination, bytes);
  }

  const gamePath = path.join(outputRoot, 'game.html');
  const dataPath = path.join(outputRoot, 'js/data.js');
  await writeFile(gamePath, patchGameHtml(await readFile(gamePath, 'utf8')), 'utf8');
  await writeFile(dataPath, patchDataJs(await readFile(dataPath, 'utf8')), 'utf8');

  const adapterSource = path.resolve(process.cwd(), 'classic/strategy-adapter.js');
  await writeFile(path.join(outputRoot, 'strategy-adapter.js'), await readFile(adapterSource));

  console.log(`Synced ${files.length} original SoyaPlayableAd UI assets into public/classic.`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
