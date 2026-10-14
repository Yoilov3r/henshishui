/* 雷声合成模块的冒烟测试：用假的 Web Audio 接口跑一遍，检查参数与调用是否合法 */
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const stats = { buffers: 0, oscillators: 0, sources: 0, ramps: 0 };

class Param {
  constructor(v) { this.value = v; }
  setValueAtTime(v) { if (!Number.isFinite(v)) throw new Error('setValueAtTime got ' + v); }
  linearRampToValueAtTime(v) { if (!Number.isFinite(v)) throw new Error('linearRamp got ' + v); stats.ramps++; }
  exponentialRampToValueAtTime(v) {
    if (!Number.isFinite(v) || v <= 0) throw new Error('exponentialRamp got ' + v);
    stats.ramps++;
  }
  cancelScheduledValues() {}
}

class Node {
  constructor(kind) {
    this.kind = kind;
    this.gain = new Param(1);
    this.frequency = new Param(440);
    this.Q = new Param(1);
    this.playbackRate = new Param(1);
    this.threshold = new Param(-20);
    this.knee = new Param(10);
    this.ratio = new Param(4);
    this.attack = new Param(0.01);
    this.release = new Param(0.2);
    this.type = '';
    this.outs = [];
  }
  connect(n) { this.outs.push(n); return n; }
  start() { if (this.kind === 'src') stats.sources++; }
  stop() {}
}

class FakeCtx {
  constructor() {
    this.sampleRate = 48000;
    this.currentTime = 0;
    this.state = 'running';
    this.destination = new Node('dest');
  }
  createGain() { return new Node('gain'); }
  createBiquadFilter() { return new Node('biquad'); }
  createDynamicsCompressor() { return new Node('comp'); }
  createOscillator() { stats.oscillators++; return new Node('osc'); }
  createBufferSource() { return new Node('src'); }
  createBuffer(ch, len, rate) {
    stats.buffers++;
    if (!(len > 0)) throw new Error('bad buffer length');
    return { length: len, sampleRate: rate, getChannelData: () => new Float32Array(len) };
  }
  resume() { this.state = 'running'; return Promise.resolve(); }
  suspend() { this.state = 'suspended'; return Promise.resolve(); }
}

globalThis.AudioContext = FakeCtx;
globalThis.window = globalThis;
require(path.join(root, 'site/src/audio.js'));

const api = globalThis.RainAudio.create();
if (api.isOn()) throw new Error('应该默认静音');
api.thunder(0.2, 0.8);                       // 未开启：不应建节点
const before = stats.sources + stats.oscillators;
api.enable();
if (!api.isOn()) throw new Error('enable 后应为开启');
for (let i = 0; i < 40; i++) api.thunder(Math.random(), 0.3 + Math.random() * 0.7);
api.setHidden(true);
if (api.isOn()) throw new Error('隐藏时应视为关闭');
api.setHidden(false);
api.disable();
if (api.isOn()) throw new Error('disable 后应关闭');
const after = stats.sources + stats.oscillators;
if (after <= before) throw new Error('thunder 没有产生音频节点');
console.log('audio smoke OK ->', JSON.stringify(stats));
