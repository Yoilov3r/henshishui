/* 离线渲染：用 @napi-rs/canvas 跑与网页同一份 scene.js，导出 PNG 供检查 */
const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const root = path.resolve(__dirname, '..');
globalThis.__createCanvas = (w, h) => createCanvas(w, h);

GlobalFonts.registerFromPath(path.join(root, 'fonts/MaShanZheng-Regular.ttf'), 'PoemKai');
GlobalFonts.registerFromPath(path.join(root, 'fonts/ZhiMangXing-Regular.ttf'), 'TitleXing');
GlobalFonts.registerFromPath('C:/Windows/Fonts/simkai.ttf', 'KaiTi');

require(path.join(root, 'site/src/poems.js'));
require(path.join(root, 'site/src/scene.js'));

const args = {};
process.argv.slice(2).forEach((a) => {
  const m = a.match(/^--([^=]+)=(.*)$/);
  if (m) args[m[1]] = m[2];
});

const W = parseInt(args.w || '1440', 10);
const H = parseInt(args.h || '900', 10);
const t = parseFloat(args.t || '0');
const out = args.out || path.join(root, 'shots/frame.png');
const sim = parseFloat(args.sim || '5');
const scroll = parseFloat(args.scroll || '0');
const mode = args.mode || 'calm';

fs.mkdirSync(path.dirname(out), { recursive: true });

const canvas = createCanvas(W, H);
const engine = globalThis.RainScene.create(canvas, {
  poems: globalThis.RAIN_POEMS,
  families: {
    poem: '"PoemKai", "KaiTi", serif',
    title: '"TitleXing", "KaiTi", serif',
    fallback: '"KaiTi", serif'
  },
  mode: mode
});

const info = engine.resize(W, H, 1);
engine.setAnimTime(t * 0.37 + 12);
engine.setElapsed(t);
engine.setScroll(scroll);
engine.simulate(sim);
engine.draw();

if (args.bench) {
  const n = parseInt(args.bench, 10);
  for (let i = 0; i < 10; i++) { engine.advance(1 / 60); engine.draw(); }
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < n; i++) { engine.advance(1 / 60); engine.draw(); }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / n;
  console.log('bench: ' + ms.toFixed(2) + ' ms/frame @ ' + W + 'x' + H);
}

Promise.resolve(canvas.encode('png')).then((buf) => {
  fs.writeFileSync(out, buf);
  console.log(JSON.stringify({ out, t, scroll, info: engine.info(), state: engine.state() }, null, 1));
});
