/* 恨逝水 / 纂事近 — 阴雨 · 积水 · 沉没 场景引擎（纯 Canvas 2D，无依赖）
 * 同一份渲染代码同时跑在浏览器与 Node（@napi-rs/canvas）中，方便离线校验画面。
 */
(function (global) {
  'use strict';

  var TAU = Math.PI * 2;
  var POOL_AT = 30;      // 秒：开始积水
  var FULL_AT = 600;     // 秒：灌满整屏

  /* ---------------------------------------------------------------- 工具 */

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, k) { return a + (b - a) * k; }

  function makeRand(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), 1 | t);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeCanvas(w, h) {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    if (typeof document !== 'undefined' && document.createElement) {
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      return c;
    }
    return global.__createCanvas(w, h);
  }

  /* 竖排标点的视觉位置：dx/dy 以 em 为单位，rot 为旋转角 */
  /* Ma Shan Zheng / Zhi Mang Xing 未收录的两个生僻字，改用楷体族渲染 */
  var FALLBACK_GLYPHS = { '傔': 1, '飏': 1 };

  var PUNCT = {
    '，': { dx: 0.30, dy: -0.30 },
    '、': { dx: 0.30, dy: -0.26 },
    '。': { dx: 0.24, dy: -0.28 },
    '！': { dx: 0.00, dy: -0.06 },
    '？': { dx: 0.00, dy: -0.08 },
    '；': { dx: 0.26, dy: -0.14 },
    '：': { dx: 0.26, dy: -0.14 },
    '《': { dx: 0.00, dy: 0.02, rot: Math.PI / 2 },
    '》': { dx: 0.00, dy: 0.02, rot: Math.PI / 2 }
  };

  /* ------------------------------------------------------------- 文字排版 */

  function measureColumn(lines, cell) {
    var max = 0;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].length > max) max = lines[i].length;
    }
    return max * cell;
  }

  function makeColumn(x, w, size, cellH, text, isTitle) {
    var cells = [];
    for (var i = 0; i < text.length; i++) {
      cells.push({
        ch: text.charAt(i),
        x: x + w / 2,
        y: i * cellH + cellH / 2,
        size: size,
        title: !!isTitle
      });
    }
    return { x: x, w: w, y: 0, cells: cells, height: text.length * cellH };
  }

  function computeLayout(w, h, poems) {
    var marginX = Math.max(26, Math.round(w * 0.034));
    var marginTop = Math.max(34, Math.round(h * 0.075));
    var marginBottom = Math.max(26, Math.round(h * 0.05));
    var availW = w - marginX * 2;
    var availH = h - marginTop - marginBottom;
    var sizes = [30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16];

    for (var s = 0; s < sizes.length; s++) {
      var fs = sizes[s];
      var cellH = Math.round(fs * 1.09);
      var pitch = Math.round(fs * 1.27);
      var titleSize = Math.round(fs * 1.46);
      var titleCellH = Math.round(titleSize * 1.10);
      var titleAdv = Math.round(titleSize * 1.24);
      var gapTitleBody = Math.round(fs * 0.72);
      var gapPoems = Math.round(fs * 1.9);

      var width = 0;
      for (var p = 0; p < poems.length; p++) {
        width += titleAdv + gapTitleBody + poems[p].lines.length * pitch;
        if (p < poems.length - 1) width += gapPoems;
      }
      var height = 0;
      for (var q = 0; q < poems.length; q++) {
        height = Math.max(height, measureColumn(poems[q].lines, cellH) + cellH * 1.75);
      }
      if (width <= availW && height <= availH) {
        var columns = [];
        var cursor = width;
        for (var pi = 0; pi < poems.length; pi++) {
          var poem = poems[pi];
          columns.push(makeColumn(cursor - titleAdv, titleAdv, titleSize, titleCellH, poem.title, true));
          cursor -= titleAdv + gapTitleBody;
          for (var li = 0; li < poem.lines.length; li++) {
            columns.push(makeColumn(cursor - pitch, pitch, fs, cellH, poem.lines[li], false));
            cursor -= pitch;
          }
          if (pi < poems.length - 1) cursor -= gapPoems;
        }
        var shift = -cursor;
        for (var c = 0; c < columns.length; c++) {
          columns[c].x += shift;
          for (var m = 0; m < columns[c].cells.length; m++) columns[c].cells[m].x += shift;
        }
        var seals = [];
        for (var z = 0; z < poems.length; z++) {
          var last = columns[columns.length - 1];
          var lines = poems[z].lines;
          var maxLen = 0;
          for (var k = 0; k < lines.length; k++) if (lines[k].length > maxLen) maxLen = lines[k].length;
          var firstColX = null;
          seals.push({
            x: firstColX === null ? null : firstColX,
            y: maxLen * cellH + cellH * 1.35,
            size: fs * 1.72,
            ch: poems[z].seal || poems[z].title.charAt(1)
          });
        }
        // 印章落在每首诗末列（最左一列）下方
        var poemEnds = [];
        var idx = 0;
        for (var pz = 0; pz < poems.length; pz++) {
          idx += 1 + poems[pz].lines.length;
          poemEnds.push(columns[idx - 1]);
        }
        for (var sz = 0; sz < seals.length; sz++) {
          seals[sz].x = poemEnds[sz].x + poemEnds[sz].w / 2;
        }
        return {
          mode: 'row',
          fs: fs, cellH: cellH, pitch: pitch, titleSize: titleSize, titleCellH: titleCellH,
          contentW: width, contentH: height,
          originX: Math.round((w - width) / 2),
          originY: Math.round(marginTop + Math.max(0, availH - height) * 0.26),
          columns: columns, seals: seals,
          docHeight: h, marginX: marginX, marginTop: marginTop
        };
      }
    }
    return buildWrapped(w, h, poems, marginX, marginTop, marginBottom);
  }

  /* 窄屏：保持竖排，列满换行，页面纵向滚动 */
  function buildWrapped(w, h, poems, marginX, marginTop, marginBottom) {
    var fs = w < 420 ? 15 : (w < 780 ? 16 : 17);
    var cellH = Math.round(fs * 1.10);
    var pitch = Math.round(fs * 1.30);
    var titleSize = Math.round(fs * 1.4);
    var titleCellH = Math.round(titleSize * 1.10);
    var titleAdv = Math.round(titleSize * 1.34);
    var perRow = Math.max(3, Math.floor((w - marginX * 2) / pitch));
    var columns = [];
    var seals = [];
    var y = 0;
    var maxHeight = 0;

    for (var p = 0; p < poems.length; p++) {
      var poem = poems[p];
      var rest = poem.lines.slice();
      var first = true;
      var maxLen = 0;
      for (var l = 0; l < poem.lines.length; l++) if (poem.lines[l].length > maxLen) maxLen = poem.lines[l].length;
      while (first || rest.length) {
        var take = Math.max(1, first ? perRow - 1 : perRow);
        var slice = rest.splice(0, take);
        var cursor = w - marginX;
        if (first) {
          var tc = makeColumn(cursor - titleAdv, titleAdv, titleSize, titleCellH, poem.title, true);
          tc.y = y;
          columns.push(tc);
          cursor -= titleAdv + Math.round(fs * 0.6);
        }
        for (var i = 0; i < slice.length; i++) {
          var col = makeColumn(cursor - pitch, pitch, fs, cellH, slice[i], false);
          col.y = y;
          columns.push(col);
          cursor -= pitch;
        }
        y += maxLen * cellH + Math.round(cellH * 1.85);
        first = false;
      }
      seals.push({ x: columns[columns.length - 1].x + pitch / 2, y: y - Math.round(cellH * 1.4), size: fs * 1.7, ch: poem.seal || poem.title.charAt(1) });
      if (p < poems.length - 1) y += Math.round(cellH * 1.6);
      maxHeight = y;
    }
    for (var c = 0; c < columns.length; c++) {
      for (var m = 0; m < columns[c].cells.length; m++) columns[c].cells[m].y += columns[c].y;
    }
    return {
      mode: 'wrap',
      fs: fs, cellH: cellH, pitch: pitch, titleSize: titleSize, titleCellH: titleCellH,
      contentW: w, contentH: maxHeight,
      originX: 0, originY: marginTop,
      columns: columns, seals: seals,
      docHeight: Math.round(maxHeight + marginTop + marginBottom),
      marginX: marginX, marginTop: marginTop
    };
  }

  /* ------------------------------------------------------------ 文字图层 */

  function renderTextLayer(layout, families, dpr) {
    var cw = Math.max(1, Math.round(layout.contentW));
    var ch = Math.max(1, Math.round(layout.contentH + layout.cellH * 2.2));
    var canvas = makeCanvas(cw * dpr, ch * dpr);
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    var rand = makeRand(0x5eed1);
    for (var i = 0; i < layout.columns.length; i++) {
      var col = layout.columns[i];
      var baseY = col.y || 0;
      for (var j = 0; j < col.cells.length; j++) drawGlyph(ctx, col.cells[j], baseY, families, rand);
    }
    for (var s = 0; s < layout.seals.length; s++) drawSeal(ctx, layout.seals[s], families);
    return { canvas: canvas, w: cw, h: ch };
  }

  function drawGlyph(ctx, cell, offsetY, families, rand) {
    var ch = cell.ch;
    var size = cell.size;
    var rule = PUNCT[ch];
    var jitter = rand() * 0.09;
    ctx.save();
    ctx.translate(cell.x, cell.y + offsetY);
    if (rule) {
      ctx.translate((rule.dx || 0) * size, (rule.dy || 0) * size);
      if (rule.rot) ctx.rotate(rule.rot);
    }
    var fam = cell.title ? families.title : families.poem;
    if (FALLBACK_GLYPHS[ch]) fam = families.fallback || fam;
    ctx.font = size + 'px ' + fam;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (cell.title) {
      ctx.shadowColor = 'rgba(198,88,62,0.36)';
      ctx.shadowBlur = size * 0.5;
      ctx.fillStyle = 'rgba(176,58,42,' + (0.95 - jitter * 0.4).toFixed(3) + ')';
      ctx.fillText(ch, 0, 0);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(212,94,64,0.82)';
      ctx.fillText(ch, 0, 0);
    } else {
      ctx.shadowColor = 'rgba(186,214,214,0.24)';
      ctx.shadowBlur = size * 0.34;
      ctx.fillStyle = 'rgba(233,239,232,' + (0.97 - jitter).toFixed(3) + ')';
      ctx.fillText(ch, 0, 0);
    }
    ctx.restore();
  }

  function drawSeal(ctx, seal, families) {
    if (seal.x === null) return;
    var s = seal.size;
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(166,52,38,0.94)';
    ctx.fillRect(seal.x - s / 2, seal.y - s / 2, s, s);
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.font = s * 0.72 + 'px ' + families.title;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(seal.ch, seal.x, seal.y + s * 0.02);
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
  }

  /* -------------------------------------------------------------- 静态底 */

  function buildBackdrop(w, h, seed) {
    var canvas = makeCanvas(w, h);
    var ctx = canvas.getContext('2d');
    var rand = makeRand(seed);

    var sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0.00, '#04070a');
    sky.addColorStop(0.34, '#071016');
    sky.addColorStop(0.62, '#0a1720');
    sky.addColorStop(0.84, '#08131a');
    sky.addColorStop(1.00, '#050a0d');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    var moonX = w * 0.74, moonY = h * 0.15, moonR = Math.max(18, h * 0.033);
    var halo = ctx.createRadialGradient(moonX, moonY, moonR * 0.6, moonX, moonY, moonR * 9);
    halo.addColorStop(0, 'rgba(190,210,206,0.10)');
    halo.addColorStop(0.35, 'rgba(150,180,180,0.045)');
    halo.addColorStop(1, 'rgba(120,150,155,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, TAU);
    ctx.fillStyle = 'rgba(206,222,214,0.13)';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(moonX + moonR * 0.5, moonY + moonR * 0.6, moonR * 1.5, moonR * 0.62, -0.28, 0, TAU);
    ctx.fillStyle = 'rgba(6,12,16,0.72)';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(moonX - moonR * 0.9, moonY - moonR * 0.7, moonR * 2.2, moonR * 0.5, 0.18, 0, TAU);
    ctx.fillStyle = 'rgba(8,14,18,0.5)';
    ctx.fill();

    // 云带：几道极暗的横向晕，给夜空一点层次
    for (var ci = 0; ci < 5; ci++) {
      var cy = h * (0.055 + ci * 0.055) + rand() * h * 0.02;
      var cx = rand() * w;
      var crx = w * (0.32 + rand() * 0.34);
      var cry = h * (0.022 + rand() * 0.022);
      var cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 1);
      cg.addColorStop(0, 'rgba(4,8,11,' + (0.34 + rand() * 0.22).toFixed(3) + ')');
      cg.addColorStop(0.6, 'rgba(5,10,13,0.18)');
      cg.addColorStop(1, 'rgba(6,12,15,0)');
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(crx, cry);
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    var layers = [
      { base: 0.560, amp: 0.085, color: 'rgba(16,30,38,0.55)', seg: 9 },
      { base: 0.665, amp: 0.105, color: 'rgba(10,20,26,0.72)', seg: 8 },
      { base: 0.790, amp: 0.085, color: 'rgba(5,10,13,0.88)', seg: 7 }
    ];
    for (var li = 0; li < layers.length; li++) {
      var L = layers[li];
      var baseY = h * L.base;
      var amp = h * L.amp;
      var pts = [];
      for (var i = 0; i <= L.seg; i++) {
        var px = (i / L.seg) * (w + 8) - 4;
        var ph = rand() * TAU;
        var py = baseY - amp * (0.52 + 0.48 * Math.sin(i * 1.05 + ph)) - amp * 0.22 * Math.sin(i * 2.7 + ph * 1.7);
        pts.push([px, py]);
      }
      ctx.beginPath();
      ctx.moveTo(-4, h + 4);
      ctx.lineTo(pts[0][0], pts[0][1]);
      for (var q = 1; q < pts.length; q++) {
        var prev = pts[q - 1], cur = pts[q];
        ctx.quadraticCurveTo((prev[0] + cur[0]) / 2, Math.min(prev[1], cur[1]), cur[0], cur[1]);
      }
      ctx.lineTo(w + 4, h + 4);
      ctx.closePath();
      ctx.fillStyle = L.color;
      ctx.fill();
    }

    drawEave(ctx, w, h);

    // 远水：山脚下一线反光
    var river = ctx.createLinearGradient(0, h * 0.70, 0, h * 0.82);
    river.addColorStop(0, 'rgba(120,158,164,0)');
    river.addColorStop(0.42, 'rgba(126,164,170,0.055)');
    river.addColorStop(1, 'rgba(96,132,140,0)');
    ctx.fillStyle = river;
    ctx.fillRect(0, h * 0.70, w, h * 0.12);

    for (var b = 0; b < 9; b++) {
      var bx = rand() * w, by = rand() * h;
      var br = (0.10 + rand() * 0.22) * h;
      var g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
      g.addColorStop(0, 'rgba(3,6,8,' + (0.05 + rand() * 0.07).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(3,6,8,0)');
      ctx.fillStyle = g;
      ctx.fillRect(bx - br, by - br, br * 2, br * 2);
    }
    return canvas;
  }

  function drawEave(ctx, w, h) {
    var right = w + 8;
    var tipX = w - Math.min(w * 0.30, 470);
    var eaveY = h * 0.118;
    var topY = -8;
    function eavePoint(k) {
      var x = lerp(tipX, right, k);
      var base = lerp(eaveY, h * 0.030, Math.pow(k, 0.55));
      var dip = -h * 0.036 * Math.exp(-Math.pow(k / 0.11, 2));
      return [x, base + dip];
    }
    ctx.beginPath();
    ctx.moveTo(right, topY);
    var N = 26;
    for (var s = N; s >= 0; s--) {
      var p = eavePoint(s / N);
      ctx.lineTo(p[0], p[1]);
    }
    ctx.lineTo(tipX + 4, eaveY - h * 0.012);
    ctx.lineTo(tipX + 4, topY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(3,6,8,0.94)';
    ctx.fill();

    // 檐口一线反光
    ctx.beginPath();
    for (var e = 0; e <= N; e++) {
      var pe = eavePoint(e / N);
      if (e === 0) ctx.moveTo(pe[0], pe[1] + 1.5);
      else ctx.lineTo(pe[0], pe[1] + 1.5);
    }
    ctx.strokeStyle = 'rgba(146,178,184,0.10)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    // 瓦垄
    for (var i = 1; i < 20; i++) {
      var k = i / 20;
      var x0 = lerp(tipX + 10, right, k);
      var p1 = eavePoint(k);
      ctx.beginPath();
      ctx.moveTo(x0 + (p1[1] - topY) * 0.28, topY);
      ctx.lineTo(p1[0] - 1, p1[1] - 3);
      ctx.strokeStyle = 'rgba(120,150,158,0.055)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }
    // 瓦当
    for (var t = 0; t < 26; t++) {
      var kk = t / 25;
      var pt = eavePoint(kk);
      var cx = pt[0];
      var cy = pt[1] + 7;
      var r = 3.1 + 1.5 * (1 - kk);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.fillStyle = 'rgba(132,164,170,0.09)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.46, 0, TAU);
      ctx.fillStyle = 'rgba(6,11,14,0.7)';
      ctx.fill();
    }
  }

  /* --------------------------------------------------------------- 灯笼 */

  function lanternSet(w, h) {
    return [
      { x: w - Math.min(w * 0.235, 340), y: h * 0.118, size: Math.max(15, h * 0.031), phase: 0.0, bright: 1.0 },
      { x: w - Math.min(w * 0.150, 214), y: h * 0.100, size: Math.max(12, h * 0.024), phase: 1.7, bright: 0.72 },
      { x: w - Math.min(w * 0.086, 122), y: h * 0.084, size: Math.max(9, h * 0.019), phase: 3.1, bright: 0.5 }
    ];
  }

  function drawLanterns(ctx, lanterns, t, dim, glowWarm) {
    for (var i = 0; i < lanterns.length; i++) {
      var L = lanterns[i];
      var sway = Math.sin(t * 0.55 + L.phase) * 0.028 + Math.sin(t * 1.31 + L.phase * 1.7) * 0.012;
      var x = L.x + sway * 60;
      var y = L.y;
      var s = L.size;
      var a = 0.15 * L.bright * dim;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.drawImage(glowWarm, x - s * 7.5, y - s * 7.5, s * 15, s * 15);
      ctx.restore();

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(sway * 1.6);
      ctx.beginPath();
      ctx.moveTo(0, -s * 3.4);
      ctx.lineTo(0, -s * 1.05);
      ctx.strokeStyle = 'rgba(10,14,16,0.9)';
      ctx.lineWidth = 1;
      ctx.stroke();
      var body = ctx.createLinearGradient(-s, -s, s, s);
      body.addColorStop(0, 'rgba(196,72,48,' + (0.85 * dim).toFixed(3) + ')');
      body.addColorStop(0.45, 'rgba(238,168,84,' + (0.92 * dim).toFixed(3) + ')');
      body.addColorStop(1, 'rgba(150,56,40,' + (0.8 * dim).toFixed(3) + ')');
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.86, s, 0, 0, TAU);
      ctx.fillStyle = body;
      ctx.fill();
      ctx.strokeStyle = 'rgba(60,22,14,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.30, s, 0, 0, TAU);
      ctx.strokeStyle = 'rgba(90,34,22,0.22)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, s * 1.0);
      ctx.lineTo(0, s * 1.5);
      ctx.strokeStyle = 'rgba(196,150,70,0.45)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ------------------------------------------------------------------ 雨 */

  var RAIN_LAYERS = [
    { share: 0.60, speed: [360, 520], len: [9, 19], width: 1.0, alpha: 0.115, wind: 0.62, splash: 0.35 },
    { share: 0.30, speed: [620, 830], len: [17, 34], width: 1.3, alpha: 0.185, wind: 0.84, splash: 0.75 },
    { share: 0.10, speed: [950, 1280], len: [30, 66], width: 1.9, alpha: 0.30, wind: 1.0, splash: 1.0 }
  ];

  function windAt(t) {
    return -30 + 30 * Math.sin(t * 0.105) + 16 * Math.sin(t * 0.335 + 1.7) + 8 * Math.sin(t * 0.94 + 0.4);
  }

  /* ----------------------------------------------------------- 引擎主体 */

  function create(canvas, opts) {
    opts = opts || {};
    var poems = (opts.poems || []).map(function (p) {
      return { title: p.title, lines: p.lines.slice(), seal: p.seal || p.title.replace(/[《》]/g, '').charAt(0) };
    });
    var families = opts.families || { poem: 'serif', title: 'serif' };
    var seed = opts.seed || 20261014;
    var reduced = !!opts.reducedMotion;
    var w = 100, h = 100, dpr = 1;
    var ctx = canvas.getContext('2d');
    var rand = makeRand(seed);
    var layout = null, textLayer = null, backdrop = null;
    var scratch = makeCanvas(4, 4);
    var noiseTile = null;
    var lanterns = [];
    var drops = [], splashes = [], ripples = [], crowns = [];
    var profile = new Float32Array(2);
    var profileStep = 8;
    var t = 0, animT = 0;
    var level = 0, waterY = 0, scrollY = 0;
    var density = 1, avgDt = 16;
    var postLayer = null, waterStrip = null, glowCool = null, glowWarm = null;

    function levelFor(sec) {
      if (sec <= POOL_AT) return 0;
      var u = clamp((sec - POOL_AT) / (FULL_AT - POOL_AT), 0, 1);
      return Math.pow(u, 1.12);
    }

    function buildNoise() {
      var n = 128;
      var c = makeCanvas(n, n);
      var nc = c.getContext('2d');
      var img = nc.createImageData(n, n);
      var nr = makeRand(99);
      for (var i = 0; i < n * n; i++) {
        var light = nr() > 0.5;
        var v = light ? 210 + nr() * 45 : nr() * 26;
        img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v;
        img.data[i * 4 + 3] = nr() * 34;
      }
      nc.putImageData(img, 0, 0);
      return c;
    }

    /* 预烘的柔光贴图：所有“径向渐变光晕”都用它缩放贴出，避免逐像素算渐变 */
    function buildGlow(r, g, b) {
      var n = 128;
      var c = makeCanvas(n, n);
      var gc = c.getContext('2d');
      var grad = gc.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
      grad.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',1)');
      grad.addColorStop(0.42, 'rgba(' + r + ',' + g + ',' + b + ',0.34)');
      grad.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
      gc.fillStyle = grad;
      gc.fillRect(0, 0, n, n);
      return c;
    }

    function drawGlow(sprite, x, y, rx, ry, alpha, rot) {
      if (alpha <= 0.002 || rx <= 0 || ry <= 0) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y);
      if (rot) ctx.rotate(rot);
      ctx.drawImage(sprite, -rx, -ry, rx * 2, ry * 2);
      ctx.restore();
    }

    /* 暗角 + 底部压暗 + 颗粒，烘成一层，每帧一次贴图 */
    function buildPostLayer() {
      var layer = makeCanvas(w, h);
      var pc = layer.getContext('2d');
      var g = pc.createRadialGradient(w * 0.5, h * 0.46, Math.min(w, h) * 0.18, w * 0.5, h * 0.52, Math.max(w, h) * 0.78);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.55, 'rgba(0,0,0,0.16)');
      g.addColorStop(1, 'rgba(0,0,0,0.66)');
      pc.fillStyle = g;
      pc.fillRect(0, 0, w, h);
      var bottom = pc.createLinearGradient(0, h * 0.72, 0, h);
      bottom.addColorStop(0, 'rgba(2,6,8,0)');
      bottom.addColorStop(1, 'rgba(2,6,8,0.42)');
      pc.fillStyle = bottom;
      pc.fillRect(0, h * 0.72, w, h * 0.28);
      var pat = pc.createPattern(noiseTile, 'repeat');
      if (pat) {
        pc.globalAlpha = 0.3;
        pc.fillStyle = pat;
        pc.fillRect(0, 0, w, h);
        pc.globalAlpha = 1;
      }
      return layer;
    }

    function rebuild() {
      rand = makeRand(seed);
      layout = computeLayout(w, h, poems);
      textLayer = renderTextLayer(layout, families, dpr);
      backdrop = buildBackdrop(Math.round(w), Math.round(h), seed + 7);
      lanterns = lanternSet(w, h);
      var sw = Math.max(1, Math.round(w)), sh = Math.max(1, Math.round(h));
      if (scratch.width < sw || scratch.height < sh) {
        scratch = makeCanvas(sw, sh);
      }
      var n = Math.max(48, Math.ceil(w / profileStep) + 1);
      profile = new Float32Array(n);
      if (!noiseTile) noiseTile = buildNoise();
      glowCool = buildGlow(178, 226, 224);
      glowWarm = buildGlow(234, 170, 92);
      postLayer = buildPostLayer();
      waterStrip = makeCanvas(2, Math.max(2, h));
      seedDrops(true);
    }

    /* 水位渐变条：每帧只烘一条 2×h 的渐变，然后用 pattern 铺水体裁剪区 */
    function waterGradientPattern() {
      var sh = Math.max(2, h);
      if (waterStrip.height !== sh) waterStrip = makeCanvas(2, sh);
      var sc = waterStrip.getContext('2d');
      sc.setTransform(1, 0, 0, 1, 0, 0);
      sc.clearRect(0, 0, 2, sh);
      var g = sc.createLinearGradient(0, waterY - 2, 0, h + 2);
      var topA = 0.30;
      var midA = clamp(0.46 + level * 0.24, 0.46, 0.78);
      var botA = clamp(0.78 + level * 0.10, 0.78, 0.9);
      g.addColorStop(0, 'rgba(126,176,178,' + topA.toFixed(3) + ')');
      g.addColorStop(0.14, 'rgba(60,116,126,' + (topA + 0.22).toFixed(3) + ')');
      g.addColorStop(0.42, 'rgba(22,58,68,' + midA.toFixed(3) + ')');
      g.addColorStop(0.75, 'rgba(9,28,34,' + botA.toFixed(3) + ')');
      g.addColorStop(1, 'rgba(4,14,18,' + botA.toFixed(3) + ')');
      sc.fillStyle = g;
      sc.fillRect(0, 0, 2, sh);
      var pat = ctx.createPattern(waterStrip, 'repeat-y');
      return pat;
    }

    function dropTarget() {
      var base = clamp((w * h) / 2450, 220, 900);
      return Math.round(base * density * (reduced ? 0.55 : 1));
    }

    function makeDrop(layerIdx, initial) {
      var L = RAIN_LAYERS[layerIdx];
      return {
        layer: layerIdx,
        x: rand() * (w + 240) - 120,
        y: initial ? rand() * (h * 1.0) : -rand() * (h * 0.4) - 14,
        speed: lerp(L.speed[0], L.speed[1], rand()),
        len: lerp(L.len[0], L.len[1], rand()),
        jitter: (rand() - 0.5) * 34
      };
    }

    function seedDrops(initial) {
      var target = dropTarget();
      drops.length = 0;
      for (var i = 0; i < target; i++) {
        var r = rand();
        var li = r < RAIN_LAYERS[0].share ? 0 : (r < RAIN_LAYERS[0].share + RAIN_LAYERS[1].share ? 1 : 2);
        drops.push(makeDrop(li, initial));
      }
    }

    function resize(cssW, cssH, ratio) {
      w = Math.max(240, Math.round(cssW));
      h = Math.max(240, Math.round(cssH));
      dpr = ratio || 1;
      var pixels = w * h * dpr * dpr;
      var maxPixels = 2.6e6;
      if (pixels > maxPixels) dpr = dpr * Math.sqrt(maxPixels / pixels);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      if (canvas.style) {
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
      }
      ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      rebuild();
      updateSurface();
      return layout;
    }

    function surfaceBase() { return h - level * h; }

    function updateSurface() {
      waterY = surfaceBase();
      var n = profile.length;
      var step = w / (n - 1);
      profileStep = step;
      var amp = level > 0.002 ? (1.0 + 2.8 * level) : 0;
      for (var i = 0; i < n; i++) {
        var x = i * step;
        var y = waterY;
        if (amp > 0) {
          y += Math.sin(x * 0.0102 + animT * 0.85) * amp;
          y += Math.sin(x * 0.0263 - animT * 1.42) * amp * 0.48;
          y += Math.sin(x * 0.0451 + animT * 2.15) * amp * 0.20;
        }
        profile[i] = y;
      }
      for (var k = 0; k < ripples.length; k++) {
        var rp = ripples[k];
        var age = rp.t / rp.life;
        var radius = Math.max(2, Math.pow(age, 0.55) * rp.maxR);
        var fade = (1 - age) * (1 - age) * rp.amp;
        if (fade <= 0.01) continue;
        var lo = Math.max(0, Math.floor((rp.x - radius * 2.4) / step));
        var hi = Math.min(n - 1, Math.ceil((rp.x + radius * 2.4) / step));
        for (var j = lo; j <= hi; j++) {
          var dx = (j * step - rp.x) / radius;
          profile[j] += Math.cos(dx * 1.9) * fade * Math.exp(-dx * dx * 1.4) * 2.4;
        }
      }
    }

    function surfaceAt(x) {
      var i = x / profileStep;
      var i0 = Math.floor(i);
      if (i0 < 0) i0 = 0;
      if (i0 > profile.length - 2) i0 = profile.length - 2;
      var f = i - i0;
      return profile[i0] * (1 - f) + profile[i0 + 1] * f;
    }

    function spawnSplash(x, y, strength, impact) {
      var onFloor = level <= 0.002;
      var lift = onFloor ? 1.75 : 1;
      var count = Math.round((onFloor ? 4 : 2) + 4.5 * strength + rand() * 2);
      for (var i = 0; i < count; i++) {
        var ang = (rand() - 0.5) * 2.6;
        var sp = (34 + 150 * strength) * lerp(0.5, 1.25, rand());
        splashes.push({
          x: x + (rand() - 0.5) * 3,
          y: y - 1,
          vx: Math.sin(ang) * sp + windAt(animT) * 0.5,
          vy: (-Math.abs(Math.cos(ang)) * sp * 1.05 - impact * 40 * rand()) * lift,
          life: 0.24 + rand() * 0.55,
          t: 0,
          px: x,
          py: y
        });
      }
      if (level > 0.02) {
        ripples.push({ x: x, t: 0, life: 0.5 + rand() * 0.65, maxR: 14 + 46 * strength, amp: 0.6 + strength });
        if (ripples.length > 90) ripples.shift();
      }
      crowns.push({
        x: x, y: y, t: 0, life: 0.16 + rand() * 0.12,
        h: (5 + 15 * strength) * (onFloor ? 1.9 : 1),
        w: (3 + 4 * rand()) * (onFloor ? 1.3 : 1),
        a: 0.25 + 0.4 * strength
      });
    }

    function stepSim(dt) {
      var wind = windAt(animT);
      var i, d;
      for (i = 0; i < drops.length; i++) {
        d = drops[i];
        var L = RAIN_LAYERS[d.layer];
        d.y += d.speed * dt;
        d.x += (wind * L.wind + d.jitter) * dt;
        var sy = surfaceAt(d.x);
        if (d.y >= sy) {
          spawnSplash(d.x, sy, L.splash * lerp(0.55, 1.15, rand()), clamp(d.speed / 1000, 0.3, 1.3));
          var nd = makeDrop(d.layer, false);
          d.x = nd.x; d.y = nd.y; d.speed = nd.speed; d.len = nd.len; d.jitter = nd.jitter;
        } else if (d.x < -150 || d.x > w + 150) {
          d.x = d.x < 0 ? w + 140 : -140;
        }
      }
      for (i = splashes.length - 1; i >= 0; i--) {
        var p = splashes[i];
        p.t += dt;
        if (p.t >= p.life) { splashes.splice(i, 1); continue; }
        p.px = p.x; p.py = p.y;
        p.vy += 1480 * dt;
        p.vx -= p.vx * 1.5 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.vy > 0 && p.y > surfaceAt(p.x)) { splashes.splice(i, 1); continue; }
      }
      if (splashes.length > 760) splashes.splice(0, splashes.length - 760);
      for (i = ripples.length - 1; i >= 0; i--) {
        ripples[i].t += dt;
        if (ripples[i].t >= ripples[i].life) ripples.splice(i, 1);
      }
      for (i = crowns.length - 1; i >= 0; i--) {
        crowns[i].t += dt;
        if (crowns[i].t >= crowns[i].life) crowns.splice(i, 1);
      }
    }

    function advance(dt) {
      dt = clamp(dt, 0.001, 0.05);
      t += dt;
      animT += dt;
      var prev = level;
      level = levelFor(t);
      if (level > prev && level > 0.001 && ripples.length < 26 && rand() < 0.5) {
        ripples.push({ x: rand() * w, t: 0, life: 1.1, maxR: 70, amp: 0.5 });
      }
      if (drops.length !== dropTarget()) seedDrops(false);
      stepSim(dt);
      avgDt = avgDt * 0.94 + dt * 1000 * 0.06;
      if (avgDt > 26 && density > 0.55) density = Math.max(0.55, density - 0.012);
      else if (avgDt < 15 && density < 1) density = Math.min(1, density + 0.006);
    }

    /* --------------------------------------------------------------- 绘制 */

    function waterPath() {
      var n = profile.length;
      ctx.beginPath();
      ctx.moveTo(-3, profile[0]);
      for (var i = 1; i < n; i++) {
        var x0 = (i - 1) * profileStep, x1 = i * profileStep;
        ctx.quadraticCurveTo((x0 + x1) / 2, profile[i - 1], x1, profile[i]);
      }
    }

    function drawShoreline() {
      var y = waterY;
      var g = ctx.createLinearGradient(0, y - 46, 0, y + 2);
      g.addColorStop(0, 'rgba(160,205,206,0)');
      g.addColorStop(0.7, 'rgba(150,196,198,0.05)');
      g.addColorStop(1, 'rgba(196,228,226,0.15)');
      ctx.fillStyle = g;
      ctx.fillRect(0, Math.max(0, y - 46), w, Math.min(h, 48));
      ctx.beginPath();
      ctx.moveTo(0, y - 0.5);
      ctx.lineTo(w, y - 0.5);
      ctx.strokeStyle = 'rgba(206,236,234,' + (level > 0.002 ? 0.30 : 0.24) + ')';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    function drawWaterBody() {
      if (level <= 0.002) return;
      var depth = h - waterY;
      waterPath();
      ctx.lineTo(w + 3, h + 4);
      ctx.lineTo(-3, h + 4);
      ctx.closePath();
      ctx.fillStyle = waterGradientPattern();
      ctx.fill();
      if (depth > 10) {
        ctx.save();
        ctx.clip();
        for (var b = 0; b < 3; b++) {
          var phase = animT * (0.10 + b * 0.035) + b * 2.1;
          var by = waterY + depth * (0.16 + 0.26 * b) + Math.sin(phase) * depth * 0.05;
          var bx = w * 0.5 + Math.sin(phase * 0.8) * w * 0.3;
          var al = (0.10 - b * 0.018) * (0.5 + level * 0.5);
          drawGlow(glowCool, bx, by, w * 0.46, depth * 0.52, al, 0);
        }
        // 水下波纹光带
        var lines = 7;
        for (var li = 0; li < lines; li++) {
          var ly = waterY + depth * (0.16 + 0.13 * li);
          if (ly > h + 20) break;
          var la = (0.092 - li * 0.009) * (0.45 + level * 0.55);
          if (la <= 0.004) continue;
          ctx.beginPath();
          var step = Math.max(14, w / 60);
          for (var lx = -20; lx <= w + 20; lx += step) {
            var wob = Math.sin(lx * 0.011 + animT * 0.7 + li * 1.3) * 5
              + Math.sin(lx * 0.028 - animT * 0.45 + li * 0.6) * 2.6;
            if (lx <= -20) ctx.moveTo(lx, ly + wob);
            else ctx.lineTo(lx, ly + wob);
          }
          ctx.strokeStyle = 'rgba(176,222,220,' + la.toFixed(3) + ')';
          ctx.lineWidth = 1.4 + li * 0.25;
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    function drawRipples() {
      if (level <= 0.002) return;
      var mist = ctx.createLinearGradient(0, waterY - 68, 0, waterY + 4);
      mist.addColorStop(0, 'rgba(168,206,208,0)');
      mist.addColorStop(0.65, 'rgba(168,206,208,' + (0.03 + 0.02 * Math.min(1, level * 5)).toFixed(3) + ')');
      mist.addColorStop(1, 'rgba(196,226,226,' + (0.07 + 0.03 * Math.min(1, level * 5)).toFixed(3) + ')');
      ctx.fillStyle = mist;
      ctx.fillRect(0, Math.max(0, waterY - 68), w, 72);
      for (var i = 0; i < ripples.length; i++) {
        var rp = ripples[i];
        var age = rp.t / rp.life;
        var r = Math.pow(age, 0.55) * rp.maxR;
        var a = (1 - age) * (1 - age) * 0.30 * clamp(rp.amp, 0.4, 2);
        if (a <= 0.006 || r < 1) continue;
        ctx.beginPath();
        ctx.ellipse(rp.x, surfaceAt(rp.x) + 1.2, r, r * 0.20, 0, 0, TAU);
        ctx.strokeStyle = 'rgba(196,232,230,' + a.toFixed(3) + ')';
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
    }

    function drawCrest() {
      waterPath();
      ctx.strokeStyle = 'rgba(206,238,236,' + (0.16 + 0.30 * Math.min(1, level * 6)).toFixed(3) + ')';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    function drawCrowns() {
      for (var i = 0; i < crowns.length; i++) {
        var c = crowns[i];
        var k = 1 - c.t / c.life;
        var a = c.a * k * (level > 0.002 ? 0.85 : 0.6);
        if (a <= 0.01) continue;
        ctx.beginPath();
        for (var s = -1; s <= 1; s++) {
          ctx.moveTo(c.x + s * c.w * 0.5, c.y);
          ctx.lineTo(c.x + s * c.w * 1.5, c.y - c.h * (1 - Math.abs(s) * 0.32) * (0.6 + 0.4 * k));
        }
        ctx.strokeStyle = 'rgba(214,242,240,' + a.toFixed(3) + ')';
        ctx.lineWidth = 1;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }

    function drawSplashes() {
      var buckets = [[], [], [], []];
      for (var i = 0; i < splashes.length; i++) {
        var p = splashes[i];
        var k = 1 - p.t / p.life;
        var idx = k > 0.7 ? 0 : (k > 0.45 ? 1 : (k > 0.22 ? 2 : 3));
        buckets[idx].push(p);
      }
      var styles = [
        ['rgba(232,250,248,0.66)', 1.9],
        ['rgba(210,240,240,0.44)', 1.5],
        ['rgba(192,226,228,0.26)', 1.15],
        ['rgba(182,216,218,0.13)', 0.95]
      ];
      for (var b = 0; b < buckets.length; b++) {
        var list = buckets[b];
        if (!list.length) continue;
        ctx.beginPath();
        for (var j = 0; j < list.length; j++) {
          var q = list[j];
          ctx.moveTo(q.x, q.y);
          ctx.lineTo(q.x - (q.x - q.px) * 2.2, q.y - (q.y - q.py) * 2.2);
        }
        ctx.strokeStyle = styles[b][0];
        ctx.lineWidth = styles[b][1];
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }

    function drawRain(layerIdx) {
      var wind = windAt(animT);
      var L = RAIN_LAYERS[layerIdx];
      var count = 0;
      ctx.beginPath();
      for (var i = 0; i < drops.length; i++) {
        var d = drops[i];
        if (d.layer !== layerIdx) continue;
        var ux = (wind * L.wind + d.jitter) / d.speed;
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - ux * d.len, d.y - d.len);
        count++;
      }
      if (!count) return;
      ctx.strokeStyle = 'rgba(196,224,228,' + L.alpha.toFixed(3) + ')';
      ctx.lineWidth = L.width;
      ctx.lineCap = 'butt';
      ctx.stroke();
    }

    function drawRainBelow(layerIdx, alphaScale) {
      var wind = windAt(animT);
      var L = RAIN_LAYERS[layerIdx];
      var count = 0;
      ctx.beginPath();
      for (var i = 0; i < drops.length; i++) {
        var d = drops[i];
        if (d.layer !== layerIdx) continue;
        if (d.y < surfaceAt(d.x)) continue;
        var ux = (wind * L.wind + d.jitter) / d.speed;
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - ux * d.len, d.y - d.len);
        count++;
      }
      if (!count) return;
      ctx.strokeStyle = 'rgba(150,206,208,' + (L.alpha * alphaScale).toFixed(3) + ')';
      ctx.lineWidth = L.width;
      ctx.lineCap = 'butt';
      ctx.stroke();
    }

    function clipWaterRegion(below) {
      ctx.beginPath();
      if (below) {
        ctx.moveTo(-4, h + 4);
        ctx.lineTo(w + 4, h + 4);
        for (var i = profile.length - 1; i >= 0; i--) ctx.lineTo(i * profileStep, profile[i]);
      } else {
        ctx.moveTo(-4, -4);
        ctx.lineTo(w + 4, -4);
        for (var j = profile.length - 1; j >= 0; j--) ctx.lineTo(j * profileStep, profile[j]);
      }
      ctx.closePath();
      ctx.clip();
    }

    function drawFog() {
      for (var i = 0; i < 2; i++) {
        var ph = i * 2.4;
        var cx = (w * (0.24 + 0.34 * i) + Math.sin(animT * 0.045 + ph) * w * 0.28 + w) % (w * 1.6) - w * 0.3;
        var cy = h * (0.32 + 0.2 * i) + Math.sin(animT * 0.06 + ph) * h * 0.03;
        drawGlow(glowCool, cx, cy, Math.max(w, h) * 0.34, Math.max(w, h) * 0.14, 0.062 - i * 0.014, 0);
      }
    }

    function drawTextLayer() {
      var ox = layout.originX;
      var oy = layout.originY - scrollY;
      var tl = textLayer.canvas;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(-4, -4);
      ctx.lineTo(w + 4, -4);
      for (var i = profile.length - 1; i >= 0; i--) ctx.lineTo(i * profileStep, profile[i]);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(tl, 0, 0, tl.width, tl.height, ox, oy, textLayer.w, textLayer.h);
      ctx.restore();

      if (level <= 0.002) return;

      var sc = scratch.getContext('2d');
      sc.setTransform(1, 0, 0, 1, 0, 0);
      sc.globalCompositeOperation = 'source-over';
      sc.globalAlpha = 1;
      sc.clearRect(0, 0, scratch.width, scratch.height);
      sc.save();
      sc.scale(dpr, dpr);
      sc.beginPath();
      sc.moveTo(-4, h + 4);
      sc.lineTo(w + 4, h + 4);
      for (var j = profile.length - 1; j >= 0; j--) sc.lineTo(j * profileStep, profile[j]);
      sc.closePath();
      sc.clip();
      sc.drawImage(tl, 0, 0, tl.width, tl.height, ox, oy, textLayer.w, textLayer.h);
      var fadeSpan = Math.max(260, h * 0.62);
      var sink = 1 - 0.46 * level;
      var fade = sc.createLinearGradient(0, waterY, 0, Math.min(h + 40, waterY + fadeSpan));
      fade.addColorStop(0, 'rgba(255,255,255,' + (0.54 * sink).toFixed(3) + ')');
      fade.addColorStop(0.12, 'rgba(255,255,255,' + (0.34 * sink).toFixed(3) + ')');
      fade.addColorStop(0.36, 'rgba(255,255,255,' + (0.15 * sink).toFixed(3) + ')');
      fade.addColorStop(0.68, 'rgba(255,255,255,' + (0.06 * sink).toFixed(3) + ')');
      fade.addColorStop(1, 'rgba(255,255,255,' + (0.015 * sink).toFixed(3) + ')');
      sc.globalCompositeOperation = 'destination-in';
      sc.fillStyle = fade;
      sc.fillRect(0, waterY - 4, w, h - waterY + 8);
      sc.globalCompositeOperation = 'source-atop';
      var tint = sc.createLinearGradient(0, waterY, 0, h);
      tint.addColorStop(0, 'rgba(162,208,206,0.40)');
      tint.addColorStop(0.45, 'rgba(58,116,120,0.62)');
      tint.addColorStop(1, 'rgba(12,40,46,0.80)');
      sc.fillStyle = tint;
      sc.fillRect(0, waterY - 4, w, h - waterY + 8);
      sc.globalCompositeOperation = 'source-over';
      sc.restore();

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(-4, h + 4);
      ctx.lineTo(w + 4, h + 4);
      for (var k = profile.length - 1; k >= 0; k--) ctx.lineTo(k * profileStep, profile[k]);
      ctx.closePath();
      ctx.clip();
      var strips = 14;
      var sw = w / strips;
      var top = Math.max(0, waterY - 3);
      var sh = h - top;
      for (var si = 0; si < strips; si++) {
        var sxp = si * sw;
        var wave = Math.sin(sxp / w * TAU * 1.6 + animT * 1.15) * 2.6 + Math.sin(sxp / w * TAU * 3.7 - animT * 0.85) * 1.6;
        var dx = wave * (0.45 + 0.55 * level);
        ctx.drawImage(scratch, sxp * dpr, top * dpr, sw * dpr, sh * dpr, sxp + dx, top, sw + 1, sh);
      }
      ctx.restore();
    }

    function drawDeepEffects() {
      if (level < 0.32) return;
      var k = clamp((level - 0.32) / 0.68, 0, 1);
      ctx.save();
      for (var i = 0; i < 3; i++) {
        var ph = animT * 0.06 + i * 1.7;
        var x = w * (0.18 + 0.30 * i) + Math.sin(ph) * w * 0.05;
        var rx = w * (0.12 + 0.04 * i);
        var ry = h * 0.5;
        drawGlow(glowCool, x, h * 0.5, rx, ry, 0.05 * k, 0.085 + i * 0.012);
      }
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.30 * k;
      ctx.fillStyle = 'rgba(7,23,28,1)';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    function drawPost() {
      if (postLayer) ctx.drawImage(postLayer, 0, 0, postLayer.width, postLayer.height, 0, 0, w, h);
    }

    function draw() {
      updateSurface();
      var dim = 1 - 0.72 * clamp((level - 0.25) / 0.75, 0, 1);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.drawImage(backdrop, 0, 0, backdrop.width, backdrop.height, 0, 0, w, h);
      drawFog();
      drawLanterns(ctx, lanterns, animT, dim, glowWarm);
      ctx.save();
      clipWaterRegion(false);
      drawRain(0);
      ctx.restore();
      drawTextLayer();
      drawShoreline();
      drawWaterBody();
      drawRipples();
      if (level > 0.002) drawCrest();
      ctx.save();
      clipWaterRegion(false);
      drawRain(1);
      drawRain(2);
      ctx.restore();
      if (level > 0.002) {
        ctx.save();
        clipWaterRegion(true);
        drawRainBelow(1, 0.20);
        drawRainBelow(2, 0.28);
        ctx.restore();
      }
      drawCrowns();
      drawSplashes();
      if (level > 0.01) {
        for (var i = 0; i < lanterns.length; i++) {
          var L = lanterns[i];
          var y = surfaceAt(L.x);
          if (y < -20 || y > h + 20) continue;
          var col = ctx.createLinearGradient(L.x, y, L.x, y + L.size * 12);
          col.addColorStop(0, 'rgba(226,160,86,' + (0.075 * L.bright * dim * (1 - level * 0.5)).toFixed(3) + ')');
          col.addColorStop(0.45, 'rgba(206,142,74,' + (0.032 * L.bright * dim * (1 - level * 0.5)).toFixed(3) + ')');
          col.addColorStop(1, 'rgba(180,120,60,0)');
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.moveTo(L.x - L.size * 1.1, y + 1);
          ctx.lineTo(L.x + L.size * 1.1, y + 1);
          ctx.lineTo(L.x + L.size * 2.6 + Math.sin(animT * 0.7) * 6, y + L.size * 12);
          ctx.lineTo(L.x - L.size * 2.6 + Math.sin(animT * 0.7 + 1) * 6, y + L.size * 12);
          ctx.closePath();
          ctx.fill();
          drawGlow(glowWarm, L.x, y + L.size * 0.4, L.size * 5.5, L.size * 1.5, 0.06 * L.bright * dim * (1 - level * 0.6), 0);
        }
      }
      drawDeepEffects();
      drawPost();
    }

    return {
      resize: resize,
      advance: advance,
      draw: draw,
      simulate: function (seconds, dtStep) {
        dtStep = dtStep || 1 / 60;
        var steps = Math.max(0, Math.round(seconds / dtStep));
        for (var i = 0; i < steps; i++) { animT += dtStep; stepSim(dtStep); }
      },
      setElapsed: function (sec) { t = sec; level = levelFor(sec); updateSurface(); },
      setScroll: function (y) { scrollY = y || 0; },
      setAnimTime: function (sec) { animT = sec; },
      level: function () { return level; },
      info: function () {
        return layout ? {
          mode: layout.mode, fs: layout.fs, contentW: Math.round(layout.contentW),
          contentH: Math.round(layout.contentH), docHeight: layout.docHeight,
          columns: layout.columns.length, originX: layout.originX, originY: layout.originY
        } : null;
      },
      state: function () {
        return { t: t, level: level, waterY: waterY, drops: drops.length, splashes: splashes.length, ripples: ripples.length, density: density };
      }
    };

  }

  global.RainScene = {
    create: create,
    POOL_AT: POOL_AT,
    FULL_AT: FULL_AT,
    levelFor: function (sec) {
      if (sec <= POOL_AT) return 0;
      var u = clamp((sec - POOL_AT) / (FULL_AT - POOL_AT), 0, 1);
      return Math.pow(u, 1.12);
    },
    timeForLevel: function (lv) {
      var v = clamp(lv, 0, 1);
      if (v <= 0) return POOL_AT;
      return POOL_AT + (FULL_AT - POOL_AT) * Math.pow(v, 1 / 1.12);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
