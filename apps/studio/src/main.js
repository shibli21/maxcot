// main.js: the studio. Views (single, sizes, sheets, aspects, film, card),
// the side panel (Styles, Tune, Poses, Design, Motion), the two code panes and
// the transport. Every score command lands in CMD below; the UI calls the same
// functions, so anything the score can do, a person can do by hand.
import { kit as K, Actor, POSES, POSE_SECTIONS, resolvePose, DESIGN, CAST, createCharacter, render, scene } from 'maxcot';
import { skinsByName } from 'maxcot/skins';
import { Player, Editor, card } from 'maxcot/film';
import { createConductor } from 'maxcot/score';
import score from './score.js';
import hello from './hello.js';
import Beat from './beat.js';
import './studio.css';

  var root = window;
  // Thin adapters: the studio names skins with strings (that is what the score uses).
  var Skins = skinsByName();
  var Rig = { Actor: Actor, SECTIONS: POSE_SECTIONS, P: POSES, resolve: resolvePose };
  var Design = { DESIGN: DESIGN, CAST: CAST };
  var FK = { Player: Player, Editor: Editor, card: card };
  var Ch = {
    scene: scene,
    render: function (ctx, w, h, F, o) { return render(ctx, w, h, F, Object.assign({}, o, { skin: Skins[o.style] || Skins.pencil })); },
    create: function (canvas, o) {
      var h = createCharacter(canvas, Object.assign({}, o, { skin: Skins[o.style || 'pencil'] }));
      Object.defineProperty(h, 'style', { get: function () { return this.skin && this.skin.name; }, set: function (v) { if (!this.skin || this.skin.name !== v) { this.skin = Skins[v]; this.dirty = true; } } });
      return h;
    }
  };
  var DPR = Math.min(root.devicePixelRatio || 1, 1.5);
  var CAPTURE = /[?&]capture(=|&|$)/.test(location.search), SMOOTH = CAPTURE ? 'auto' : 'smooth';
  var $ = function (s) { return document.querySelector(s); };
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  var GROUPS = [['drawn', 'Drawn'], ['print', 'Print and paste'], ['screens', 'Screens and light'], ['signal', 'Glitch: signal'], ['time', 'Glitch: time']];
  var FILE_OF = { drawn: 'drawn', print: 'print', screens: 'screens', signal: 'glitch', time: 'glitch' };
  var LIB = 'packages/maxcot/src/';
  var STYLE_ORDER = []; GROUPS.forEach(function (g) { Object.keys(Skins).forEach(function (k) { if (Skins[k].group === g[0]) STYLE_ORDER.push(k); }); });
  var CAST_ORDER = ['max', 'child', 'girl', 'boss', 'clerk', 'teen', 'professor', 'oldman'];
  var SECTION_LABEL = { attitudes: 'Attitudes', feelings: 'Feelings', eyes: 'Eyes', mouth: 'Mouth and tongues', hands: 'Hands', body: 'Body' };
  var FACES = ['feel-happy', 'feel-furious', 'feel-sad', 'feel-surprised', 'feel-terrified', 'feel-plotting', 'feel-crying', 'feel-laughing', 'feel-bored', 'feel-flirting', 'feel-sulking', 'feel-proud', 'feel-embarrassed', 'feel-excited', 'eyes-suspicious', 'eyes-sleepy', 'mouth-smirk', 'mouth-oo'];
  var FACE_STYLES = ['pencil', 'sketch', 'felttip', 'ballpoint', 'riso', 'inkbleed', 'print', 'manga', 'gigposter', 'gloss'];

  var ST = { clock: 0 }, film = null, editor = null, tiles = [], tilesSig = '', thumbQ = [], thumbId = 0, bts = null;
  var mainH = Ch.create($('#main'), { key: 'main' });

  // ── state ────────────────────────────────────────────────────────────────
  function reset() {
    ST = {
      actor: new Rig.Actor({ who: 'max' }), style: 'pencil', palette: 'cyan', guides: false, mode: 'single',
      sizesUpTo: 48, grid: 3, sheetKind: 'styles', dealSeed: 0, faces: 1, panel: null, editRow: null, multicam: false,
      card: null, pointer: null, clock: ST.clock || 0, rev: 0, revAt: 0, panelRev: -1, created: false, src: null
    };
    mainH.actor = ST.actor; K.tune = {};
    film = null; editor = null; $('#timeline').innerHTML = ''; $('#pointer').style.display = 'none';
    $('#panel').classList.remove('on'); setMode('single');
  }
  function settle() {
    ST.actor.snap(); if (film) film.update(0);
    tiles.forEach(function (x) { x.h.dirty = true; });
    if (bts.last >= 0) hiScore(bts.last);
    if (ST.src) showSource(ST.src[0], ST.src[1]);
    if (ST.panel) openPanel(ST.panel); else closePanel();
    layout();
  }

  // ── commands: one per score verb ─────────────────────────────────────────
  var CMD = {
    create: function (v) { ST.actor = new Rig.Actor({ who: v }); mainH.actor = ST.actor; ST.created = true; setMode('single'); src('create'); },
    style: function (v, ev) {
      if (ST.mode === 'film' && ST.editRow === 'style' && editor) { editor.assign(v); markPicker(v); }
      else {
        ST.style = v; if (ev && ev.palette) ST.palette = ev.palette;
        if (ST.mode === 'film' || ST.mode === 'card') setMode('single');
        if (ST.panel === 'Styles' && (v === 'hologram') !== !!ST.panelHolo) openPanel('Styles');
        markPanel('style', v); if (ev && ev.palette) markPanel('palette', ev.palette);
      }
      src('style', v);
    },
    look: function (v) { if (v === 'code') ST.guides = true; else if (v === 'clean') ST.guides = false; else ST.actor.gaze = v; src('look'); },
    open: function (v) { setMode('single'); openPanel(v); },
    pose: function (v) { leaveSpecial(); ST.actor.pose(v); markPanel('pose', v); src('pose', v); },
    who: function (v) {
      if (ST.mode === 'film' && ST.editRow === 'who' && editor) { editor.assign(v); markPicker(v); }
      else { ST.actor.cast(v); bump(); markPanel('cast', v); }
      src('who', v);
    },
    size: function (v) { if (v >= 1000) setMode('single'); else { ST.sizesUpTo = v; setMode('sizes'); } src('size'); },
    sheet: function (v, ev) { ST.sheetKind = v; ST.grid = ev.grid || 3; setMode('sheet'); src('sheet'); },
    grid: function (v) { ST.grid = v; setMode(ST.mode === 'deal' ? 'deal' : 'sheet'); },
    deal: function (v) { ST.dealSeed = v; setMode('deal'); src('deal'); },
    edit: function (v) { ensureFilm(); ST.editRow = /style/i.test(v) ? 'style' : 'who'; film.playing = false; ST.multicam = false; film.camOverride = null; setMode('film'); editor.select(ST.editRow); src('film'); },
    set: function (v, ev) { leaveSpecial(); if (ST.panel !== 'Design') openPanel('Design'); ST.actor.set(v, ev.to); bump(); markPanel('dial', v); src('set', v); },
    preset: function (v) { leaveSpecial(); if (ST.panel !== 'Design') openPanel('Design'); ST.actor.cast(v); bump(); markPanel('cast', v); src('who', v); },
    play: function (v, ev, ctx) {
      ensureFilm(); ST.editRow = null; ST.multicam = false; film.camOverride = null; setMode('film');
      film.seek((ev.from || 0) + ctx.since); film.playing = true; buildPicker(null); src('film');
    },
    faces: function (v) { ST.faces = v; setMode('faces'); src('faces'); },
    camera: function (v, ev, ctx) {
      ensureFilm(); ST.editRow = null; buildPicker(null);
      if (!ST.multicam) { film.seek(ctx.since); film.playing = true; }
      ST.multicam = true; film.camOverride = v - 1; setMode('film'); src('film');
    },
    sizes: function () { setMode('aspects'); src('aspects'); },
    take: function (v, ev, ctx) { setMode('single'); ST.panel = null; $('#panel').classList.remove('on'); ST.pointer = { start: ST.clock - ctx.since }; src('take'); },
    end: function (v, ev, ctx) { ST.card = { text: (v && v.text) || 'MAXCOT', start: ST.clock - ctx.since }; ST.pointer = null; setMode('card'); src('end'); }
  };
  function exec(cmd, v, ev, ctx) {
    ctx = ctx || { instant: false, now: 0, since: 0 }; ST.instant = ctx.instant;
    if (!CMD[cmd]) { console.warn('unknown command', cmd); return; }
    CMD[cmd](v, ev || {}, ctx);
    if (!ctx.instant && ev && ev.i != null) hiScore(ev.i);
  }
  function guidesFor(s) { return ST.guides && (s === 'pencil' || s === 'sketch' || s === 'ballpoint'); }
  function leaveSpecial() { if (ST.mode !== 'single' && ST.mode !== 'aspects') setMode('single'); }
  function bump() { ST.rev++; ST.revAt = ST.clock; }
  function src(kind, name) { ST.src = [kind, name]; if (!ST.instant) showSource(kind, name); }

  // ── modes and layout ─────────────────────────────────────────────────────
  var VIEW = { single: 'single', sizes: 'sizes', sheet: 'grid', deal: 'grid', faces: 'grid', aspects: 'aspects', film: 'film', card: 'card' };
  function setMode(m) {
    var changed = ST.mode !== m; ST.mode = m;
    ['single', 'sizes', 'grid', 'aspects', 'film', 'card'].forEach(function (v) { $('#v-' + v).classList.toggle('on', VIEW[m] === v); });
    $('#panel').classList.toggle('on', m === 'single' && !!ST.panel);
    if (m !== 'film') ST.editRow = null;
    if (changed) tilesSig = '';
    layout();
  }
  function fit(c, w, h) {
    var cw = Math.max(2, Math.round(w * DPR)), ch = Math.max(2, Math.round(h * DPR));
    if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
    c.style.width = w + 'px'; c.style.height = h + 'px';
  }
  function layout() {
    var area = $('#viewArea'), W = area.clientWidth, H = area.clientHeight;
    if (!W || !H) return;
    switch (ST.mode) {
      case 'single': fit($('#main'), W, H); mainH.dirty = true; break;
      case 'card': fit($('#cardCanvas'), W, H); break;
      case 'sizes': buildSizes(W, H); break;
      case 'sheet': case 'deal': case 'faces': buildGrid(W, H); break;
      case 'aspects': buildAspects(W, H); break;
      case 'film': layoutFilm(); break;
    }
  }
  function tile(host, w, h, o) {
    var c = el('canvas'); c.width = Math.round(w * (o.dpr || DPR)); c.height = Math.round(h * (o.dpr || DPR)); c.style.width = w + 'px'; c.style.height = h + 'px';
    host.appendChild(c); var hd = Ch.create(c, o); var t = { h: hd, shared: !!o.shared, anim: !o.isStatic, c: c }; tiles.push(t); return t;
  }

  // the sizes row: the same drawing at the pixel sizes it will really ship at
  function buildSizes(W, H) {
    var sig = 'sizes|' + ST.sizesUpTo + '|' + W + '|' + H; if (sig === tilesSig) return; tilesSig = sig;
    var host = $('#v-sizes'); host.innerHTML = ''; tiles = [];
    [48, 96, 200].filter(function (s) { return s <= ST.sizesUpTo; }).forEach(function (s) {
      var f = el('figure'); host.appendChild(f);
      tile(f, s, s, { actor: ST.actor, shared: true, dpr: 1, style: ST.style, key: 'size' + s });
      f.appendChild(el('figcaption', null, s + ' px'));
    });
  }
  // sheets: every style at once; deals: shuffled actor × style × pose; faces: expressions
  function buildGrid(W, H) {
    var m = ST.mode, sig = [m, ST.grid, ST.dealSeed, ST.faces, W, H].join('|'); if (sig === tilesSig) return; tilesSig = sig;
    var host = $('#v-grid'); host.innerHTML = ''; tiles = []; var gap = 6, i, n, cols, rows, sz;
    if (m === 'sheet') {
      n = ST.grid; sz = Math.floor(Math.min((W - gap * (n - 1)) / n, (H - gap * (n - 1)) / n));
      cols = n; for (i = 0; i < n * n; i++) tile(host, sz, sz, { actor: ST.actor, shared: true, style: STYLE_ORDER[i % STYLE_ORDER.length], palette: ['cyan', 'amber', 'rose', 'green'][i % 4], isStatic: n >= 7, key: 'sh' + i });
    } else {
      cols = m === 'deal' ? 5 : ST.faces + 1;
      sz = Math.floor((W - gap * (cols - 1)) / cols); rows = Math.max(1, Math.floor((H + gap) / (sz + gap)));
      if (rows * (sz + gap) - gap > H) sz = Math.floor((H - gap * (rows - 1)) / rows);
      var rnd = K.rng(ST.dealSeed * 7717 + ST.faces * 31 + 1), whos = CAST_ORDER, poses = Rig.SECTIONS.attitudes.concat(Rig.SECTIONS.feelings);
      for (i = 0; i < cols * rows; i++) {
        var a = new Rig.Actor({ who: m === 'deal' ? whos[(rnd() * whos.length) | 0] : 'max' });
        a.pose(m === 'deal' ? poses[(rnd() * poses.length) | 0] : FACES[i % FACES.length]).snap();
        var st = m === 'deal' ? STYLE_ORDER[(rnd() * STYLE_ORDER.length) | 0] : FACE_STYLES[(i * 7 + ST.faces) % FACE_STYLES.length];
        tile(host, sz, sz, { actor: a, style: st, palette: 'cyan', isStatic: true, frame: m === 'faces' ? 'close' : 'full', key: m + i });
      }
    }
    host.style.padding = '0 ' + Math.max(0, Math.floor((W - (cols * sz + gap * (cols - 1))) / 2) - 1) + 'px';
  }
  // the same frame for every screen it will be shown on
  function buildAspects(W, H) {
    var sig = 'asp|' + W + '|' + H; if (sig === tilesSig) return; tilesSig = sig;
    var host = $('#v-aspects'); host.innerHTML = ''; tiles = []; var g = 12;
    var h1 = Math.floor(Math.min((W - g) / (16 / 9 + 9 / 16), (H - g) / 1.85)), h2 = Math.floor(h1 * 0.85);
    var w1 = h1 * 16 / 9, w2 = h1 * 9 / 16, x0 = (W - (w1 + g + w2)) / 2, y0 = (H - (h1 + g + h2)) / 2;
    var w3 = h2, w4 = h2 * 0.8, x1 = (W - (w3 + g + w4)) / 2;
    [['Wide 16:9', x0, y0, w1, h1], ['Tall 9:16', x0 + w1 + g, y0, w2, h1], ['Square 1:1', x1, y0 + h1 + g, w3, h2], ['Portrait 4:5', x1 + w3 + g, y0 + h1 + g, w4, h2]].forEach(function (a, i) {
      var d = el('div', 'asp'); d.style.left = a[1] + 'px'; d.style.top = a[2] + 'px'; d.style.width = a[3] + 'px'; d.style.height = a[4] + 'px';
      host.appendChild(d); var t = tile(d, a[3], a[4], { actor: ST.actor, shared: true, style: ST.style, key: 'asp' + i }); t.c.style.width = '100%'; t.c.style.height = '100%';
      d.appendChild(el('span', null, a[0]));
    });
  }

  // ── film ─────────────────────────────────────────────────────────────────
  function ensureFilm() {
    if (film) return;
    film = new FK.Player(JSON.parse(JSON.stringify(hello)), { skins: Skins });
    editor = new FK.Editor($('#timeline'), film, { onPick: buildPicker, onAspect: layoutFilm, onChange: function () { src('film'); } });
  }
  var ASPECT = { wide: 16 / 9, tall: 9 / 16, square: 1, portrait: 0.8 };
  function layoutFilm() {
    if (!film) return;
    var mc = $('#multicam'); mc.classList.toggle('on', ST.multicam);
    var prev = $('.film-prev'), W = prev.clientWidth, H = prev.clientHeight, r = ASPECT[film.aspect] || 16 / 9;
    var w = Math.min(W, H * r), h = w / r, c = $('#filmCanvas'); fit(c, Math.floor(w), Math.floor(h));
    c.style.left = Math.floor((W - w) / 2) + 'px'; c.style.top = Math.floor((H - h) / 2) + 'px';
    if (ST.multicam && !mc.children.length) {
      (film.film.cameras || []).forEach(function (cam, i) {
        var f = el('figure'), cv = el('canvas'); f.appendChild(cv); f.appendChild(el('figcaption', null, (i + 1) + ' ' + cam.label));
        f.onclick = function () { film.camOverride = i; markCams(); }; mc.appendChild(f);
      });
    }
    Array.prototype.forEach.call(mc.querySelectorAll('canvas'), function (cv) { var cw = Math.floor(Math.min(mc.clientWidth || 160, (H - 3 * 8) / 4 * 16 / 9)); fit(cv, cw, Math.round(cw * 9 / 16)); });
    markCams();
  }
  function markCams() { Array.prototype.forEach.call($('#multicam').children, function (f, i) { f.classList.toggle('on', film && film.camOverride === i); }); }
  function buildPicker(row) {
    if (!editor) return; var host = editor.picker; host.innerHTML = '';
    if (!row) return;
    var list = row === 'who' ? CAST_ORDER : STYLE_ORDER;
    list.forEach(function (k) {
      var f = el('figure'), c = el('canvas'); c.width = 192; c.height = 160; f.appendChild(c);
      f.appendChild(el('figcaption', null, row === 'who' ? Design.CAST[k].label : Skins[k].label)); f.dataset.k = k;
      f.onclick = function () { editor.assign(k); markPicker(k); }; host.appendChild(f);
      queueThumb(c, row === 'who' ? { who: k, style: 'pencil', pose: 'rest' } : { design: film.actor.designTo, who: film.who, style: k, pose: 'rest' });
    });
  }
  function markPicker(k) {
    if (!editor) return;
    Array.prototype.forEach.call(editor.picker.children, function (f) { var on = f.dataset.k === k; f.classList.toggle('on', on); if (on && !ST.instant) f.scrollIntoView({ block: 'nearest', inline: 'center', behavior: SMOOTH }); });
  }

  // ── thumbnails, rendered a few per frame ────────────────────────────────
  function queueThumb(c, spec) { spec.key = 'th' + (thumbId++); thumbQ.push([c, spec]); }
  function renderThumb(c, s) {
    var a = new Rig.Actor({ who: s.who || 'max' }); if (s.design) { Object.assign(a.designTo, s.design); }
    a.pose(s.pose || 'rest').snap(); a.gaze = 'us';
    Ch.render(c.getContext('2d'), c.width, c.height, a.frame(0.6), { style: s.style, palette: s.palette, t: 0.6, key: s.key, frame: s.frame });
  }

  // ── panel ────────────────────────────────────────────────────────────────
  var TABS = ['Styles', 'Tune', 'Poses', 'Design', 'Motion'];
  function openPanel(name) {
    ST.panel = name; $('#panel').classList.toggle('on', ST.mode === 'single');
    var tabs = $('#tabs'); tabs.innerHTML = '';
    TABS.forEach(function (t) { var b = el('button', t === name ? 'on' : '', t); b.onclick = function () { openPanel(t); }; tabs.appendChild(b); });
    buildPanel(); layout();
  }
  function closePanel() { ST.panel = null; $('#panel').classList.remove('on'); layout(); }
  function section(body, title) { body.appendChild(el('h4', null, title)); var g = el('div', 'thumbs'); body.appendChild(g); return g; }
  function thumbFig(grid, k, label, spec, onClick) {
    var f = el('figure'), c = el('canvas'); c.width = 220; c.height = 220; f.appendChild(c); f.appendChild(el('figcaption', null, label));
    f.dataset.k = k; f.title = label; f.onclick = onClick; grid.appendChild(f); queueThumb(c, spec);
  }
  function buildPanel() {
    var body = $('#panelBody'), scroll = body.scrollTop; body.innerHTML = ''; ST.panelRev = ST.rev;
    var d = ST.actor.designTo, who = ST.actor.who;
    if (ST.panel === 'Styles') {
      ST.panelHolo = ST.style === 'hologram';
      if (ST.panelHolo) {
        var hg = section(body, 'Hologram beams');
        Skins.hologram.palettes.forEach(function (p) { thumbFig(hg, 'palette:' + p.name, p.label, { design: d, who: who, style: 'hologram', palette: p.name }, function () { exec('style', 'hologram', { palette: p.name }); }); });
      }
      GROUPS.forEach(function (g) {
        var grid = section(body, g[1]);
        STYLE_ORDER.filter(function (k) { return Skins[k].group === g[0]; }).forEach(function (k) {
          thumbFig(grid, 'style:' + k, Skins[k].label, { design: d, who: who, style: k, palette: ST.palette }, function () { exec('style', k); });
        });
      });
    } else if (ST.panel === 'Poses') {
      Object.keys(Rig.SECTIONS).forEach(function (s) {
        var grid = section(body, SECTION_LABEL[s]);
        Rig.SECTIONS[s].forEach(function (p) { thumbFig(grid, 'pose:' + p, p, { design: d, who: who, style: 'pencil', pose: p }, function () { exec('pose', p); }); });
      });
    } else if (ST.panel === 'Design') {
      body.appendChild(el('h4', null, 'Who plays it'));
      var chips = el('div', 'chips'); body.appendChild(chips);
      CAST_ORDER.forEach(function (k) {
        var ch = el('div', 'chip' + (k === who ? ' on' : '')), c = el('canvas'); c.width = 60; c.height = 60; ch.appendChild(c); ch.appendChild(document.createTextNode(Design.CAST[k].label));
        ch.dataset.k = 'cast:' + k; ch.onclick = function () { exec('preset', k); }; chips.appendChild(ch); queueThumb(c, { who: k, style: 'pencil', frame: 'close' });
      });
      var groups = {}; Design.DESIGN.forEach(function (r) { (groups[r[1]] = groups[r[1]] || []).push(r); });
      Object.keys(groups).forEach(function (g) { body.appendChild(el('h4', null, g)); groups[g].forEach(function (r) { dial(body, 'dial:' + r[0], r[2], r[4], r[5], d[r[0]], r[3], function (v) { ST.actor.set(r[0], v); bump(); src('set', r[0]); }, r[0]); }); });
    } else if (ST.panel === 'Tune') {
      var sk = Skins[ST.style]; body.appendChild(el('h4', null, sk.label)); body.appendChild(el('p', 'note', sk.about));
      (sk.params || []).forEach(function (p) { dial(body, 'tune:' + p[0], p[1], p[2], p[3], K.tv(p[0], p[4]), '', function (v) { K.tune[p[0]] = v; mainH.dirty = true; }); });
      if (!(sk.params || []).length) body.appendChild(el('p', 'note', 'This skin has no dials of its own.'));
      if (sk.palettes) { body.appendChild(el('h4', null, 'Beam')); var pc = el('div', 'chips'); body.appendChild(pc); sk.palettes.forEach(function (p) { var ch = el('div', 'chip' + (p.name === ST.palette ? ' on' : ''), p.label); ch.style.padding = '4px 8px'; ch.onclick = function () { exec('style', ST.style, { palette: p.name }); openPanel('Tune'); }; pc.appendChild(ch); }); }
      body.appendChild(el('h4', null, 'Look'));
      toggle(body, 'Construction lines', ST.guides, function (on) { ST.guides = on; });
      toggle(body, 'Eyes to camera', ST.actor.gaze === 'us', function (on) { ST.actor.gaze = on ? 'us' : null; });
    } else if (ST.panel === 'Motion') {
      var a = ST.actor; body.appendChild(el('p', 'note', 'Every channel springs toward its pose. Stiffer is snappier, lower damping overshoots.'));
      dial(body, 'm:stiff', 'Stiffness', 4, 40, a.stiff, '', function (v) { a.stiff = v; });
      dial(body, 'm:damp', 'Damping', 0.2, 1.2, a.damp, '', function (v) { a.damp = v; });
      dial(body, 'm:idle', 'Idle life', 0, 2, a.idle, '', function (v) { a.idle = v; });
      dial(body, 'm:morph', 'Recast speed', 1, 20, a.morph, '', function (v) { a.morph = v; });
    }
    body.scrollTop = scroll;
  }
  function dial(host, k, label, min, max, val, help, onInput, key) {
    var row = el('label', 'dial'), r = el('input'), o = el('output');
    r.type = 'range'; r.min = min; r.max = max; r.step = (max - min) / 400; r.value = val; o.textContent = (+val).toFixed(2);
    row.title = help || ''; row.dataset.k = k; if (key) r.dataset.key = key;
    r.oninput = function () { o.textContent = (+r.value).toFixed(2); onInput(+r.value); };
    row.appendChild(el('span', null, label)); row.appendChild(r); row.appendChild(o); host.appendChild(row);
  }
  function toggle(host, label, on, fn) { var l = el('label', 'dial'), c = el('input'); c.type = 'checkbox'; c.checked = on; c.onchange = function () { fn(c.checked); }; l.appendChild(el('span', null, label)); l.appendChild(c); host.appendChild(l); }
  function markPanel(kind, v) {
    if (ST.instant) return;
    var body = $('#panelBody'), sel = body.querySelector('[data-k="' + kind + ':' + v + '"]'); if (!sel) return;
    Array.prototype.forEach.call(body.querySelectorAll('[data-k^="' + kind + ':"]'), function (n) { n.classList.toggle('on', n === sel); });
    sel.scrollIntoView({ block: 'center', behavior: SMOOTH });
    if (kind === 'dial') setTimeout(function () { sel.classList.remove('on'); }, 1400);
  }
  function syncDials() {
    if (ST.panel !== 'Design') return;
    Array.prototype.forEach.call($('#panelBody').querySelectorAll('input[data-key]'), function (r) {
      if (document.activeElement === r) return; var v = ST.actor.design[r.dataset.key]; if (v == null) return;
      r.value = v; r.nextSibling.textContent = (+v).toFixed(2);
    });
  }

  // ── code panes ───────────────────────────────────────────────────────────
  var TOK = /(\/\/.*$)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|(\b\d+(?:\.\d+)?\b)|(\b(?:var|function|return|if|else|for|new|this|true|false|null|while|switch|case|break|typeof)\b)/g;
  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function hl(line) {
    var out = '', last = 0;
    line.replace(TOK, function (m, c, s, n, k, off) { out += esc(line.slice(last, off)) + '<span class="t-' + (c ? 'c' : s ? 's' : n ? 'n' : 'k') + '">' + esc(m) + '</span>'; last = off + m.length; return m; });
    return out + esc(line.slice(last));
  }
  function renderCode(host, lines, hi) {
    host.innerHTML = lines.map(function (l, i) { return '<div class="ln' + (i === hi ? ' hi' : '') + '">' + (hl(l) || ' ') + '</div>'; }).join('');
    scrollCode(host, hi);
  }
  function scrollCode(host, i) { var ln = host.children[i]; if (ln) host.scrollTop = Math.max(0, ln.offsetTop - host.clientHeight * 0.32); }
  var scoreLineOf = [];
  function hiScore(i) {
    var host = $('#scoreSrc'), li = scoreLineOf[i]; if (li == null) return;
    var old = host.querySelector('.hi'); if (old) old.classList.remove('hi');
    if (host.children[li]) { host.children[li].classList.add('hi'); scrollCode(host, li); }
  }
  function fnLines(fn) {
    var L = fn.toString().split('\n'), ind = L.slice(1).reduce(function (m, l) { return l.trim() ? Math.min(m, l.match(/^\s*/)[0].length) : m; }, 99);
    return L.map(function (l, i) { return i ? l.slice(Math.max(0, ind - 2)) : l; });
  }
  function lit(o) { return JSON.stringify(o, null, 2).replace(/"([A-Za-z_$][\w$]*)":/g, '$1:').replace(/"((?:[^"\\]|\\.)*)"/g, "'$1'").split('\n'); }
  function showSource(kind, name) {
    var file = LIB + 'character.js', lines = [], hi = 0;
    if (kind === 'style') {
      var s = Skins[name]; file = LIB + 'skins/' + FILE_OF[s.group] + '.js';
      lines = ['Skins.' + name + ' = {', "  name: '" + s.name + "', label: '" + s.label + "', group: '" + s.group + "',", "  about: '" + s.about.replace(/'/g, "\\'") + "',", '  fps: ' + s.fps + ', hold: ' + JSON.stringify(s.hold).replace(/"/g, "'") + ',', '  draw: ' + fnLines(s.draw).join('\n  ').trim(), '};'];
      lines = lines.join('\n').split('\n'); hi = 1;
    } else if (kind === 'pose') {
      file = LIB + 'rig.js'; var def = Rig.P[name] || {};
      lines = ["P['" + name + "'] = " + lit(def).join('\n') + ';', '', '// resolves to these channel targets on layer ' + (def.layer || 'all') + ':'].concat(lit(Rig.resolve(name).values));
      lines = lines.join('\n').split('\n');
    } else if (kind === 'who') {
      file = LIB + 'design.js'; var c = Design.CAST[name] || Design.CAST.max;
      lines = ["cast('" + c.key + "', '" + c.label + "', '" + c.about.replace(/'/g, "\\'") + "', " + lit(c.values).join('\n') + ');'].join('\n').split('\n');
    } else if (kind === 'set') {
      file = LIB + 'design.js'; lines = ['// DESIGN: what the character is. One row per dial.', '// [key, group, label, help, min, max, default]', 'var DESIGN = ['];
      Design.DESIGN.forEach(function (r) { if (r[0] === name) hi = lines.length; lines.push("  ['" + r[0] + "', '" + r[1] + "', '" + r[2] + "', '" + r[3].replace(/'/g, "\\'") + "', " + r[4] + ', ' + r[5] + ', ' + r[6] + '],'); });
      lines.push('];');
    } else if (kind === 'film') {
      file = 'apps/studio/src/hello.js'; lines = ['export default ' + lit(film ? film.film : hello).join('\n') + ';'].join('\n').split('\n');
      var want = ST.editRow ? (ST.editRow === 'who' ? 'who:' : 'style:') : (ST.multicam ? 'cameras:' : 'shots:');
      lines.forEach(function (l, i) { if (!hi && l.trim().indexOf(want) === 0) hi = i; });
    } else if (kind === 'create') { file = LIB + 'rig.js'; lines = ['function Actor(o) {'].concat(fnLines(Rig.Actor).slice(1)).concat(['', 'Actor.prototype.update = ' + fnLines(Rig.Actor.prototype.update).join('\n')]).join('\n').split('\n'); }
    else if (kind === 'look') { file = LIB + 'character.js'; lines = fnLines(Ch.scene); lines.forEach(function (l, i) { if (!hi && l.indexOf('guideParts()') >= 0) hi = i; }); }
    else if (kind === 'take' || kind === 'end') { file = kind === 'end' ? LIB + 'film/film.js' : LIB + 'skins/glitch.js'; lines = fnLines(kind === 'end' ? FK.card : Skins.pixelwind.draw); }
    else { file = 'apps/studio/src/main.js'; lines = fnLines({ size: buildSizes, sheet: buildGrid, deal: buildGrid, faces: buildGrid, aspects: buildAspects }[kind] || buildGrid); }
    $('#engineFile').textContent = file; renderCode($('#engineSrc'), lines, hi);
  }

  // ── pointer gag ─────────────────────────────────────────────────────────
  function updatePointer() {
    var p = ST.pointer, ptr = $('#pointer'); if (!p || ST.mode !== 'single') { ptr.style.display = 'none'; return; }
    var dt = ST.clock - p.start, area = $('#viewArea'), S = mainH.S, b = S ? S.body : { cx: area.clientWidth * DPR / 2, cy: area.clientHeight * DPR / 2 };
    var tx = b.cx / DPR, ty = b.cy / DPR, fx = area.clientWidth + 60, fy = area.clientHeight + 60, k = K.ease(dt / 0.45);
    var x = K.lerp(fx, tx, k), y = K.lerp(fy, ty, k), s = dt > 0.45 && dt < 0.58 ? 0.8 : 1;
    ptr.style.display = 'block'; ptr.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';
    if (dt > 0.5) { if (ST.style !== 'pixelwind') ST.style = 'pixelwind'; K.tune['pixelwind.wind'] = K.clamp((dt - 0.5) / 0.5, 0, 1); mainH.dirty = true; }
  }

  // ── transport ────────────────────────────────────────────────────────────
  function fmt(t) { var m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); }
  var scrubbing = false;
  function transport() {
    $('#bPlay').innerHTML = bts.playing ? '&#10074;&#10074;' : '&#9654;';
    var bb = bts.barBeat(bts.songT); $('#pos').textContent = 'bar ' + bb[0] + ' · ' + (Math.floor(bb[1] * 2) / 2);
    $('#clock').textContent = fmt(bts.songT); if (!scrubbing) $('#scrub').value = bts.songT;
    var intro = $('#intro');
    if (ST.created) intro.classList.add('off');
    else {
      intro.classList.remove('off'); intro.classList.toggle('typing', bts.playing || bts.songT > 0);
      var line = '{ at: [2, 1], create: max }', k = bts.playing || bts.songT > 0 ? Math.floor(K.clamp(bts.songT / (bts.timeOf([2, 1]) * 0.85), 0, 1) * line.length) : 0;
      $('#typed').innerHTML = esc(line.slice(0, k)) + '<span class="cur"></span>';
    }
  }
  function wire() {
    $('#bPlay').onclick = function () { if (bts.playing) bts.pause(); else bts.play(); };
    $('#bRestart').onclick = function () { bts.seek(0); };
    $('#bPrev').onclick = function () { var bb = bts.barBeat(bts.songT); bts.seek(bts.timeOf([Math.max(1, bb[0] - (bb[1] < 1.3 ? 1 : 0)), 1])); };
    $('#bNext').onclick = function () { var bb = bts.barBeat(bts.songT); bts.seek(bts.timeOf([bb[0] + 1, 1]) + 0.001); };
    var sc = $('#scrub'); sc.max = bts.total;
    sc.oninput = function () { scrubbing = true; bts.seek(+sc.value); }; sc.onchange = function () { scrubbing = false; };
    $('#cSound').onchange = function () { setSound(this.checked); };
    $('#cCode').onchange = function () { $('#app').classList.toggle('nocode', !this.checked); setTimeout(layout, 30); };
    $('#bPanel').onclick = function () { if (ST.panel && ST.mode === 'single') closePanel(); else { setMode('single'); openPanel(ST.panel || 'Styles'); } };
    $('#bStart').onclick = function () { bts.seek(0); bts.play(); };
    $('#bFree').onclick = function () { bts.seek(bts.timeOf([4, 4.5]) + 0.01); };
    root.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
      if (e.code === 'Space') { e.preventDefault(); $('#bPlay').click(); }
      else if (e.code === 'ArrowRight') { e.preventDefault(); $('#bNext').click(); }
      else if (e.code === 'ArrowLeft') { e.preventDefault(); $('#bPrev').click(); }
      else if (e.key === 'Escape') closePanel();
      else if (e.key === 'g') ST.guides = !ST.guides;
    });
    new ResizeObserver(function () { tilesSig = ''; layout(); }).observe($('#viewArea'));
  }

  // ── the frame loop ───────────────────────────────────────────────────────
  // ?capture renders deterministically: no clock of its own, Studio.step(dt) advances it.
  var lastNow = performance.now(), lastFilm = 0, lastCams = 0, lastCard = 0, lastDial = 0;
  function loop(now) {
    step(Math.min(0.1, (now - lastNow) / 1000)); lastNow = now;
    requestAnimationFrame(loop);
  }
  function step(dt) {
    ST.clock += dt;
    try {
      bts.tick(dt); ST.actor.update(dt); updatePointer();
      var t = ST.clock;
      if (ST.mode === 'single') { mainH.style = ST.style; mainH.palette = ST.palette; mainH.guides = guidesFor(ST.style); mainH.draw(t); }
      else if (ST.mode === 'card') { if (t - lastCard > 1 / 12) { lastCard = t; var cc = $('#cardCanvas'); FK.card(cc.getContext('2d'), cc.width, cc.height, t - ST.card.start, ST.card.text); } }
      else if (ST.mode === 'film' && film) {
        film.update(dt); editor.sync();
        if (t - lastFilm > 1 / 30) { lastFilm = t; var fc = $('#filmCanvas'); film.render(fc.getContext('2d'), fc.width, fc.height, { palette: ST.palette, t: t }); }
        if (ST.multicam && t - lastCams > 1 / 10) { lastCams = t; Array.prototype.forEach.call($('#multicam').querySelectorAll('canvas'), function (cv, i) { film.render(cv.getContext('2d'), cv.width, cv.height, { camIndex: i, t: t }); }); }
      } else {
        var budget = 6;
        tiles.forEach(function (x) {
          if (x.shared) { x.h.actor = ST.actor; if (ST.mode !== 'sheet') { x.h.style = ST.style; x.h.palette = ST.palette; x.h.guides = guidesFor(ST.style); } }
          if (x.anim) x.h.draw(t); else if (x.h.dirty && budget > 0) { budget--; x.h.draw(t, true); }
        });
      }
      for (var q = 0; q < (CAPTURE ? 40 : 3) && thumbQ.length;) { var it = thumbQ.shift(); if (it[0].isConnected) { renderThumb(it[0], it[1]); q++; } }
      if ((ST.panel === 'Styles' || ST.panel === 'Poses') && ST.rev !== ST.panelRev && t - ST.revAt > 0.6 && ST.mode === 'single') buildPanel();
      if (t - lastDial > 0.08) { lastDial = t; syncDials(); }
      transport();
    } catch (e) { console.error(e); }
  }

  // The score as shown in the code pane, read back out of the score function itself.
  function sourceOf(fn) {
    var s = fn.toString(), a = s.indexOf('return ['), b = s.lastIndexOf('];');
    var body = s.slice(a + 8, b).split('\n').filter(function (l, i) { return !(i === 0 && !l.trim()); });
    var ind = body.reduce(function (m, l) { return l.trim() ? Math.min(m, l.match(/^\s*/)[0].length) : m; }, 99);
    var lines = body.map(function (l) { return '  ' + l.slice(ind); });
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    return ['var score = ['].concat(lines).concat(['];']);
  }

  // ── boot ─────────────────────────────────────────────────────────────────
  var BPM = 92, beat = new Beat(BPM);
  var beatClock = { start: function (t) { beat.start(t); }, stop: function () { beat.stop(); }, now: function () { return beat.now(); }, get running() { return beat.running; } };
  function setSound(on) { beat.on = on; bts.setClock(on ? beatClock : null); }
  bts = createConductor({
    bpm: BPM, events: score('max', 'glitch'), tail: 3.2, onCommand: exec, onReset: reset, onSettle: settle,
    // `palette`, `to` and `from` qualify a command; `grid` does too when it rides along with `sheet`
    commandsOf: function (e) { return e.sheet ? ['sheet'] : Object.keys(e).filter(function (k) { return ['at', 'palette', 'to', 'from', 'i', 't'].indexOf(k) < 0; }); }
  });
  bts.source = sourceOf(score);
  setSound(!CAPTURE);
  if (CAPTURE) document.documentElement.classList.add('capture');
  var srcLines = bts.source, ev = 0;
  srcLines.forEach(function (l, i) { if (/\{\s*at:/.test(l)) scoreLineOf[ev++] = i; });
  renderCode($('#scoreSrc'), srcLines, -1);
  reset(); wire(); showSource('create'); transport();
  if (!CAPTURE) requestAnimationFrame(loop);
  root.Studio = { exec: exec, step: step, renderBeatWav: function (sec) { return Beat.render(BPM, sec).then(Beat.wav64); }, get state() { return ST; }, get film() { return film; }, conductor: bts, openPanel: openPanel, setMode: setMode };

