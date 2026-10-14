/* 狂风骤雨版的雷声与雨声：全部用 Web Audio 现场合成，不加载任何音频文件 */
(function (global) {
  'use strict';

  function makeNoise(ctx, seconds, brownAmount) {
    var len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = buf.getChannelData(0);
    var last = 0;
    for (var i = 0; i < len; i++) {
      var w = Math.random() * 2 - 1;
      last = (last + brownAmount * w) / (1 + brownAmount);
      d[i] = w * 0.65 + last * 2.6;
    }
    return buf;
  }

  function create() {
    var AC = global.AudioContext || global.webkitAudioContext;
    var actx = new AC();
    var comp = actx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.knee.value = 22;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.35;
    var master = actx.createGain();
    master.gain.value = 0;
    master.connect(comp);
    comp.connect(actx.destination);

    var noise = makeNoise(actx, 3.4, 0.02);

    // 雨声床
    var rain = actx.createBufferSource();
    rain.buffer = noise; rain.loop = true;
    var rainHP = actx.createBiquadFilter(); rainHP.type = 'highpass'; rainHP.frequency.value = 340;
    var rainLP = actx.createBiquadFilter(); rainLP.type = 'lowpass'; rainLP.frequency.value = 5200;
    var rainGain = actx.createGain(); rainGain.gain.value = 0.15;
    rain.connect(rainHP); rainHP.connect(rainLP); rainLP.connect(rainGain); rainGain.connect(master);
    rain.start();

    // 风声床：同一噪声经低通，缓慢起伏
    var wind = actx.createBufferSource();
    wind.buffer = noise; wind.loop = true; wind.playbackRate.value = 0.6;
    var windLP = actx.createBiquadFilter(); windLP.type = 'lowpass'; windLP.frequency.value = 420;
    var windGain = actx.createGain(); windGain.gain.value = 0.22;
    var windLFO = actx.createOscillator(); windLFO.type = 'sine'; windLFO.frequency.value = 0.07;
    var windLFOGain = actx.createGain(); windLFOGain.gain.value = 0.16;
    windLFO.connect(windLFOGain); windLFOGain.connect(windGain.gain);
    wind.connect(windLP); windLP.connect(windGain); windGain.connect(master);
    wind.start(); windLFO.start();

    var api = {
      userMuted: false,
      isOn: function () { return api._on && !actx.__hidden; },
      enable: function () {
        if (actx.state === 'suspended') actx.resume();
        api._on = true;
        master.gain.cancelScheduledValues(actx.currentTime);
        master.gain.setValueAtTime(master.gain.value, actx.currentTime);
        master.gain.linearRampToValueAtTime(0.62, actx.currentTime + 0.5);
      },
      disable: function () {
        api._on = false;
        master.gain.cancelScheduledValues(actx.currentTime);
        master.gain.setValueAtTime(master.gain.value, actx.currentTime);
        master.gain.linearRampToValueAtTime(0, actx.currentTime + 0.25);
      },
      setHidden: function (hidden) {
        actx.__hidden = !!hidden;
        if (hidden) { if (actx.state === 'running') actx.suspend(); }
        else if (api._on && actx.state === 'suspended') actx.resume();
      },
      thunder: function (distance, power) {
        if (!api._on || actx.__hidden) return;
        distance = Math.min(1, Math.max(0, distance || 0));
        power = Math.min(1, Math.max(0.2, power || 0.6));
        var t0 = actx.currentTime + 0.05 + distance * 1.9;   // 越远，雷声来得越晚
        var near = Math.max(0, 1 - distance * 2.2);
        var level = 0.9 - distance * 0.45;

        function rumble(at, gain, dur, fHigh, fLow) {
          var src = actx.createBufferSource();
          src.buffer = noise; src.loop = true;
          src.playbackRate.value = 0.55 + Math.random() * 0.25;
          var lp = actx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.setValueAtTime(fHigh, at);
          lp.frequency.exponentialRampToValueAtTime(fLow, at + dur);
          var g = actx.createGain();
          g.gain.setValueAtTime(0.0001, at);
          g.gain.exponentialRampToValueAtTime(gain, at + 0.07);
          g.gain.exponentialRampToValueAtTime(gain * 0.35, at + dur * 0.34);
          g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
          src.connect(lp); lp.connect(g); g.connect(master);
          src.start(at); src.stop(at + dur + 0.1);
        }

        function boom(at, gain, f0, f1, dur) {
          var osc = actx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(f0, at);
          osc.frequency.exponentialRampToValueAtTime(f1, at + dur);
          var g = actx.createGain();
          g.gain.setValueAtTime(0.0001, at);
          g.gain.exponentialRampToValueAtTime(gain, at + 0.06);
          g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
          osc.connect(g); g.connect(master);
          osc.start(at); osc.stop(at + dur + 0.05);
        }

        // 闷雷主体 + 滚动回声
        rumble(t0, 0.5 * power * level, 2.4 + distance * 1.8, 620 + 500 * power, 95);
        boom(t0, 0.34 * power * level, 66, 30, 1.5 + distance);
        if (distance > 0.42) {
          rumble(t0 + 0.55 + Math.random() * 0.4, 0.24 * power, 2.0, 380, 80);
          rumble(t0 + 1.25 + Math.random() * 0.7, 0.16 * power, 2.4, 300, 70);
        }
        // 近雷：劈裂声
        if (near > 0.02) {
          var burst = actx.createBufferSource();
          burst.buffer = noise;
          var bp = actx.createBiquadFilter();
          bp.type = 'bandpass'; bp.frequency.value = 1500 + Math.random() * 1400; bp.Q.value = 0.9;
          var hp = actx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 620;
          var bg = actx.createGain();
          bg.gain.setValueAtTime(0.0001, t0);
          bg.gain.exponentialRampToValueAtTime(0.42 * near * power, t0 + 0.006);
          bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16 + 0.1 * near);
          burst.connect(bp); bp.connect(hp); hp.connect(bg); bg.connect(master);
          burst.start(t0, Math.random() * 1.5, 0.4);
          boom(t0, 0.3 * near * power, 92, 38, 0.8);
        }
      }
    };
    api._on = false;
    return api;
  }

  global.RainAudio = {
    available: function () { return !!(global.AudioContext || global.webkitAudioContext); },
    create: create
  };
})(typeof window !== 'undefined' ? window : globalThis);
