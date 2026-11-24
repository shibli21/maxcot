// filmkit/film.js: Player (a film's clock and actor) and Editor (the timeline).
import K from '../kit.js';
import { Actor } from '../rig.js';
import { CAST } from '../design.js';
import { render, camera } from '../character.js';

  // ── hand-lettered end card ───────────────────────────────────────────────
  function card(ctx, w, h, t, text) {
    K.paper(ctx, w, h, '#f2f1ea', 1);
    var buf = K.buffer('card', w, h), c = buf.ctx, fs = Math.min(w / (text.length * 0.98 + 1.2), h * 0.26), rnd = K.rng(Math.floor(t * 8) + 3);
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, w, h);
    c.save(); c.translate(w / 2, h / 2); c.transform(1, -0.08, -0.32, 1, 0, 0);
    c.font = 'italic 900 ' + fs + 'px "Arial Black", Impact, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#000'; c.fillText(text, 0, 0); c.lineWidth = fs * 0.04; c.strokeStyle = '#000'; c.strokeText(text, 0, 0);
    c.restore();
    // scribble fill: keep the hatching only where the letters are
    c.globalCompositeOperation = 'source-in'; c.fillStyle = '#1c1c1c'; c.fillRect(0, 0, w, h);
    c.globalCompositeOperation = 'destination-out'; c.strokeStyle = '#000'; c.lineWidth = Math.max(1, fs * 0.012);
    for (var d = -h; d < w; d += fs * 0.055) { c.beginPath(); c.moveTo(d + rnd() * 3, h); c.lineTo(d + h * 0.9 + rnd() * 3, 0); c.stroke(); }
    c.globalCompositeOperation = 'source-over';
    var reveal = K.clamp(t / 0.6, 0, 1);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w * reveal * 1.1, h); ctx.clip(); ctx.drawImage(buf, 0, 0); ctx.restore();
  }

  // ── Player ───────────────────────────────────────────────────────────────
  // skins: { name: skin } so a film's tracks can name their styles as plain strings
  function Player(film, o) {
    o = o || {};
    this.film = film; this.skins = o.skins || {}; this.cardText = o.cardText || 'MAXCOT'; this.t = 0; this.playing = false; this.camOverride = null; this.aspect = 'wide'; this.key = 'film';
    this.total = film.shots.reduce(function (a, s) { return Math.max(a, s.from + s.len); }, 0) + (film.end ? film.end.len : 0);
    this.seek(0);
  }
  Player.prototype.beats = function () {
    var out = []; this.film.shots.forEach(function (s) { s.beats.forEach(function (b) { out.push(Object.assign({ t: s.from + b.at, shot: s.id }, b)); }); });
    return out.sort(function (a, b) { return a.t - b.t; });
  };
  Player.prototype.segAt = function (track, t) { var L = this.film.tracks[track] || []; for (var i = 0; i < L.length; i++) if (t >= L[i].from && t < L[i].to) return L[i]; return null; };
  Player.prototype.whoAt = function (t) { var s = this.segAt('who', t); return s ? s.who : this.film.actor.key; };
  Player.prototype.styleAt = function (t) {
    var s = this.segAt('style', t); if (s) return s;
    var L = this.film.tracks.style || [], prev = null; L.forEach(function (x) { if (x.to <= t) prev = x; }); return prev || { style: 'pencil' };
  };
  Player.prototype.shotAt = function (t) { var S = this.film.shots; for (var i = 0; i < S.length; i++) if (t >= S[i].from && t < S[i].from + S[i].len) return S[i]; return null; };
  Player.prototype.apply = function (b) { if (b.pose) this.actor.pose(b.pose); if (b.look) this.actor.gaze = b.look; };
  Player.prototype.seek = function (t) {
    this.t = K.clamp(t, 0, this.total); this.who = this.whoAt(this.t);
    this.actor = new Actor({ who: this.who, t: this.t });
    var self = this; this.beats().forEach(function (b) { if (b.t <= self.t) self.apply(b); });
    this.actor.snap();
  };
  Player.prototype.update = function (dt) {
    if (this.playing) {
      var t0 = this.t, t1 = Math.min(this.total, this.t + dt), self = this;
      this.beats().forEach(function (b) { if (b.t > t0 && b.t <= t1) self.apply(b); });
      this.t = t1; if (t1 >= this.total) this.playing = false;
    }
    var who = this.whoAt(this.t); if (who !== this.who) { this.who = who; this.actor.cast(who); }
    this.actor.update(this.playing ? dt : Math.min(dt, 0.02));
  };
  Player.prototype.camera = function (override) {
    var shot = this.shotAt(this.t), cams = this.film.cameras || [];
    var c = override != null ? cams[override] : (this.camOverride != null ? cams[this.camOverride] : null);
    return c ? c : (shot ? shot.camera : { frame: 'full' });
  };
  Player.prototype.render = function (ctx, w, h, o) {
    o = o || {};
    var endFrom = this.total - (this.film.end ? this.film.end.len : 0);
    if (this.t >= endFrom && this.film.end) { card(ctx, w, h, this.t - endFrom, o.cardText || this.cardText); return; }
    var seg = this.styleAt(this.t), cam = this.camera(o.camIndex), F = this.actor.frame(), t = this.t;
    var cm = camera(F.P, w, h, cam.frame || 'full'), skins = this.skins, sk = function (n) { return skins[n] || skins.pencil; };
    if (cam.kind === 'handheld') { cm.cx += K.noise(t * 1.3, 1) * w * 0.02; cm.cy += K.noise(t * 1.1, 2) * h * 0.02; }
    var shot = this.shotAt(t); if (cam.kind === 'push' && shot) cm.unit *= 1 + 0.15 * (t - shot.from) / shot.len;
    var key = this.key + (o.camIndex == null ? '' : o.camIndex);
    var opts = { skin: sk(seg.style), palette: o.palette, t: o.t == null ? performance.now() / 1000 : o.t, key: key, cam: cm };
    var since = t - (seg.from || 0);
    if (seg.blend === 'wipe' && since >= 0 && since < 0.3) {
      var prev = this.styleAt((seg.from || 0) - 0.001);
      render(ctx, w, h, F, Object.assign({}, opts, { skin: sk(prev.style) }));
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w * since / 0.3, h); ctx.clip();
      render(ctx, w, h, F, opts); ctx.restore();
    } else render(ctx, w, h, F, opts);
  };

  // ── Editor: shots / camera / who plays it / style ───────────────────────
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function Editor(host, player, o) {
    o = o || {}; var self = this;
    this.player = player; this.pps = 60; this.sel = null; this.onPick = o.onPick; this.onChange = o.onChange;
    host.innerHTML = '';
    var head = el('div', 'tl-head');
    this.btn = el('button', 'tl-btn', 'Play'); this.btn.onclick = function () { player.playing = !player.playing; if (player.t >= player.total) player.seek(0); };
    this.clock = el('span', 'tl-clock', '0.00 / ' + player.total.toFixed(2) + ' s');
    head.appendChild(this.btn); head.appendChild(this.clock);
    this.aspects = {};
    [['wide', 'Wide', '16:9'], ['tall', 'Tall', '9:16'], ['square', 'Square', '1:1'], ['portrait', 'Portrait', '4:5']].forEach(function (a) {
      var b = el('button', 'tl-btn asp'); b.innerHTML = a[1] + ' <small>' + a[2] + '</small>'; b.onclick = function () { player.aspect = a[0]; self.sync(); if (o.onAspect) o.onAspect(a[0]); };
      self.aspects[a[0]] = b; head.appendChild(b);
    });
    host.appendChild(head);
    var grid = el('div', 'tl-grid'); this.grid = grid;
    var zoom = el('div', 'tl-zoom'), zm = el('button', 'tl-btn', '−'), zp = el('button', 'tl-btn', '+');
    zm.onclick = function () { self.pps = Math.max(20, self.pps / 1.25); self.layout(); }; zp.onclick = function () { self.pps = Math.min(240, self.pps * 1.25); self.layout(); };
    zoom.appendChild(zm); zoom.appendChild(zp);
    this.ruler = el('div', 'tl-lane tl-ruler'); grid.appendChild(zoom); grid.appendChild(this.ruler);
    this.rows = {};
    [['shots', 'Shots'], ['camera', 'Camera'], ['actor', player.film.actor.label, true], ['who', 'Who plays it'], ['style', 'Style']].forEach(function (r) {
      var lab = el('div', 'tl-label' + (r[2] ? ' tl-actor' : ''), r[1]), lane = el('div', 'tl-lane' + (r[2] ? ' tl-actor' : ''));
      grid.appendChild(lab); grid.appendChild(lane); self.rows[r[0]] = { label: lab, lane: lane };
      lane.addEventListener('mousedown', function (e) { if (e.target === lane) { self.seekTo(e, lane); } });
    });
    this.ruler.addEventListener('mousedown', function (e) { self.seekTo(e, self.ruler); });
    this.head = el('div', 'tl-playhead'); grid.appendChild(this.head);
    host.appendChild(grid);
    this.picker = el('div', 'tl-picker'); host.appendChild(this.picker);
    this.layout();
  }
  Editor.prototype.px = function (t) { return Math.round(t * this.pps); };
  Editor.prototype.seekTo = function (e, lane) { var r = lane.getBoundingClientRect(); this.player.seek((e.clientX - r.left + lane.scrollLeft) / this.pps); };
  Editor.prototype.place = function (b, t0, t1) { b.style.left = this.px(t0) + 'px'; b.style.width = Math.max(4, this.px(t1) - this.px(t0) - 2) + 'px'; };
  Editor.prototype.layout = function () {
    var self = this, P = this.player, F = P.film, total = P.total;
    this.ruler.innerHTML = '';
    for (var s = 0; s <= total; s += 2) { var tk = el('span', 'tl-tick', String(s)); tk.style.left = this.px(s) + 'px'; this.ruler.appendChild(tk); }
    Object.keys(this.rows).forEach(function (k) { if (k !== 'actor') self.rows[k].lane.innerHTML = ''; self.rows[k].lane.style.minWidth = self.px(total) + 'px'; });
    var endFrom = total - (F.end ? F.end.len : 0);
    F.shots.forEach(function (sh) {
      var b = el('div', 'blk', sh.id); self.place(b, sh.from, sh.from + sh.len); self.rows.shots.lane.appendChild(b);
      var c = el('div', 'blk', ({ full: 'Full', close: 'Close', medium: 'Medium' })[sh.camera.frame] || sh.camera.frame); self.place(c, sh.from, sh.from + sh.len); self.rows.camera.lane.appendChild(c);
    });
    if (F.end) { var eb = el('div', 'blk end', 'End card'); self.place(eb, endFrom, total); self.rows.shots.lane.appendChild(eb); }
    var hatch = el('div', 'blk hatch'); self.place(hatch, 0, endFrom); self.rows.who.lane.appendChild(hatch);
    ['who', 'style'].forEach(function (row) {
      (F.tracks[row] || []).forEach(function (seg, i) {
        var label = row === 'who' ? (CAST[seg.who] || {}).label || seg.who : (self.player.skins[seg.style] || {}).label || seg.style;
        var b = el('div', 'blk edit' + (self.sel && self.sel.row === row && self.sel.i === i ? ' sel' : ''));
        b.innerHTML = '<i class="grip">∷</i>' + label;
        var hl = el('span', 'h l'), hr = el('span', 'h r'); b.appendChild(hl); b.appendChild(hr);
        self.place(b, seg.from, seg.to); self.rows[row].lane.appendChild(b);
        b.addEventListener('mousedown', function (e) {
          e.stopPropagation(); self.select(row, i);
          if (e.target === hl || e.target === hr) self.drag(e, row, i, e.target === hl ? 'from' : 'to');
        });
      });
    });
    this.sync();
  };
  Editor.prototype.drag = function (e, row, i, edge) {
    var self = this, L = this.player.film.tracks[row], seg = L[i], x0 = e.clientX, v0 = seg[edge];
    var lo = edge === 'from' ? (i > 0 ? L[i - 1].to : 0) : seg.from + 0.2, hi = edge === 'to' ? (L[i + 1] ? L[i + 1].from : this.player.total) : seg.to - 0.2;
    var move = function (ev) { seg[edge] = Math.round(K.clamp(v0 + (ev.clientX - x0) / self.pps, lo, hi) * 20) / 20; self.layout(); if (self.onChange) self.onChange(); };
    var up = function () { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  };
  Editor.prototype.select = function (row, i) {
    var L = this.player.film.tracks[row] || [];
    if (i == null) { var t = this.player.t; i = 0; L.forEach(function (s, j) { if (t >= s.from) i = j; }); }
    if (!L[i]) return;
    this.sel = { row: row, i: i }; this.layout(); if (this.onPick) this.onPick(row, L[i]);
  };
  Editor.prototype.assign = function (value) {
    if (!this.sel) return; var seg = this.player.film.tracks[this.sel.row][this.sel.i];
    if (this.sel.row === 'who') seg.who = value; else seg.style = value;
    this.layout(); this.player.seek(this.player.t); if (this.onChange) this.onChange();
  };
  Editor.prototype.sync = function () {
    var P = this.player; this.clock.textContent = P.t.toFixed(2) + ' / ' + P.total.toFixed(2) + ' s';
    this.btn.textContent = P.playing ? 'Pause' : 'Play';
    var lane = this.rows.shots.lane; this.head.style.left = (lane.offsetLeft + this.px(P.t)) + 'px';
    for (var k in this.aspects) this.aspects[k].classList.toggle('on', k === P.aspect);
  };

export { Player, Editor, card };

