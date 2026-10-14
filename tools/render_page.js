/* 端到端校验：把构建好的 index.html 放进最小 DOM 桩里跑，验证引导逻辑与画面。 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const root = path.resolve(__dirname, '..');
const args = {};
process.argv.slice(2).forEach((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  if (m) args[m[1]] = m[2];
});

const htmlPath = args.html || path.join(root, 'repo/index.html');
const html = fs.readFileSync(htmlPath, 'utf8');
const out = args.out || path.join(root, 'shots/page.png');
const W = parseInt(args.w || '1440', 10);
const H = parseInt(args.h || '900', 10);
const search = args.search || '?still=1';
const frames = parseInt(args.frames || '1', 10);
const dtMs = parseFloat(args.dt || '16.7');

GlobalFonts.registerFromPath(path.join(root, 'fonts/MaShanZheng-Regular.ttf'), 'PoemKai');
GlobalFonts.registerFromPath(path.join(root, 'fonts/ZhiMingXing-Regular.ttf'), 'TitleXing');
GlobalFonts.registerFromPath('C:/Windows/Fonts/simkai.ttf', 'KaiTi');

function makeEl(tag) {
  const el = {
    tagName: tag,
    style: {},
    children: [],
    classList: { add() {}, remove() {}, contains: () => false },
    appendChild(c) { el.children.push(c); return c; },
    addEventListener() {},
    textContent: ''
  };
  return el;
}

const sceneCanvas = createCanvas(W, H);
sceneCanvas.style = {};
sceneCanvas.classList = { add() {}, remove() {}, contains: () => false };

const elements = {
  scene: sceneCanvas,
  spacer: makeEl('div'),
  libretto: makeEl('div')
};

let rafQueue = [];
const documentStub = {
  hidden: false,
  documentElement: makeEl('html'),
  body: makeEl('body'),
  getElementById: (id) => elements[id],
  createElement: (tag) => (tag === 'canvas' ? Object.assign(createCanvas(4, 4), { style: {} }) : makeEl(tag)),
  createDocumentFragment: () => makeEl('fragment'),
  addEventListener() {},
  fonts: { load: () => Promise.resolve(), ready: Promise.resolve() }
};

const windowStub = {
  innerWidth: W,
  innerHeight: H,
  devicePixelRatio: 1,
  scrollY: 0,
  scrollTo() {},
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  addEventListener() {},
  requestAnimationFrame: (cb) => { rafQueue.push(cb); return rafQueue.length; },
  setTimeout,
  clearTimeout
};
windowStub.window = windowStub;

const sandbox = {
  window: windowStub,
  document: documentStub,
  location: { search: search, href: 'http://localhost/' },
  URLSearchParams,
  requestAnimationFrame: windowStub.requestAnimationFrame,
  setTimeout,
  clearTimeout,
  console,
  Math,
  Date,
  Promise
};
sandbox.globalThis = sandbox;

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
if (!scripts.length) throw new Error('no inline scripts found');

const ctxVm = vm.createContext(sandbox);
scripts.forEach((code, i) => {
  try {
    vm.runInContext(code, ctxVm, { filename: 'inline-' + i + '.js' });
  } catch (e) {
    console.error('script ' + i + ' failed:', e.message);
    throw e;
  }
});

(async () => {
  await new Promise((r) => setTimeout(r, 60));
  const engine = windowStub.__rainEngine;
  if (!engine) throw new Error('engine not booted');
  let now = 1000;
  let steps = 0;
  const trace = args.trace === '1';
  const traceEvery = parseInt(args.traceEvery || '60', 10);
  while (rafQueue.length && steps < frames) {
    const cb = rafQueue.shift();
    now += dtMs;
    cb(now);
    steps++;
    if (trace && steps % traceEvery === 0) {
      const s = engine.state();
      console.log('frame=' + steps + ' t=' + s.t.toFixed(2) + ' level=' + s.level.toFixed(4) + ' waterY=' + s.waterY.toFixed(1) + ' splashes=' + s.splashes);
    }
    await new Promise((r) => setTimeout(r, 0));
  }
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const buf = await sceneCanvas.encode('png');
  fs.writeFileSync(out, buf);
  console.log(JSON.stringify({
    out, search, frames: steps,
    info: engine.info(),
    state: engine.state(),
    libretto: elements.libretto.children.length,
    spacerHeight: elements.spacer.style.height
  }, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
