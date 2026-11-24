// character.ts: from rig state to a drawable SCENE.
// The body is a rounded, tapered, bevelled block, extruded and projected
// (yaw / pitch / perspective). Each side facet is back-face culled and shaded,
// and the face is mapped onto the front plane. The door split doubles as the
// mouth line. Skins never see 3D, only the flat Scene:
//   S.parts[] = { role, pts, fill, shade, edge, line, lw, group, clip, seam }
import K from './kit.js';
import { Actor } from './rig.js';
import type { Camera, CanvasLike, Ctx2D, DesignValues, Frame, Framing, MeshLine, Part, Pt, Scene, Skin } from './types.js';

type V3 = [number, number, number];
/** Projected point: screen x, screen y, depth, perspective scale. */
type P4 = [number, number, number, number];
export interface SceneView { w: number; h: number; cam: Camera; guides?: boolean; seed?: number }
  var cos = Math.cos, sin = Math.sin, PI = Math.PI, min = Math.min, max = Math.max, abs = Math.abs;
  var LIGHT = norm([-0.45, 0.68, 0.58]);

  function norm(v: V3): V3 { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }

  // ── the front outline, counter-clockwise in (u, v), v up ────────────────
  function rrect(W: number, H: number, rt: number, rb: number, n: number): Pt[] {
    var pts: Pt[] = [], hw = W / 2, hh = H / 2, i;
    rt = max(0, min(rt, hw, hh)); rb = max(0, min(rb, hw, hh));
    function arc(cx: number, cy: number, r: number, a0: number, a1: number) { for (i = 0; i <= n; i++) { var a = a0 + (a1 - a0) * i / n; pts.push([cx + cos(a) * r, cy + sin(a) * r]); } }
    function edge(x0: number, y0: number, x1: number, y1: number, k: number) { for (i = 1; i < k; i++) pts.push([x0 + (x1 - x0) * i / k, y0 + (y1 - y0) * i / k]); }
    arc(hw - rb, -hh + rb, rb, -PI / 2, 0); edge(hw, -hh + rb, hw, hh - rt, 5);
    arc(hw - rt, hh - rt, rt, 0, PI / 2); edge(hw - rt, hh, -hw + rt, hh, 4);
    arc(-hw + rt, hh - rt, rt, PI / 2, PI); edge(-hw, hh - rt, -hw, -hh + rb, 5);
    arc(-hw + rb, -hh + rb, rb, PI, PI * 1.5); edge(-hw + rb, -hh, hw - rb, -hh, 4);
    return pts;
  }

  // ── the camera: where the figure sits in a frame of w × h ───────────────
  /** Where the figure sits in a frame of w × h: full figure, medium, or a close-up on the face. */
  function camera(P: DesignValues, w: number, h: number, frame?: Framing | string, zoom?: number): Camera {
    var z = zoom || 1, s = P['body.size'] || 1, u: number, cy: number, Hh = P['body.h'] * s;
    var wExt = 0.9 * P['body.w'] * s + 2 * (0.2 + P['hands.spread'] * 0.45 + P['hands.size'] * s * 1.6) + 0.3;
    var eyeY = Hh / 2 - P['eyes.height'] * Hh * 0.9;
    if (frame === 'close') { u = min(w / 1.15, h / 1.0) / s; cy = h * 0.44 + eyeY * u; }
    else if (frame === 'medium') { u = min(w / (wExt * 0.8), h / (Hh * 1.05)); cy = h * 0.5 + Hh * 0.12 * u; }
    else { u = min(w / max(2.25, wExt), h / (0.85 + Hh)); cy = h * 0.5 - 0.06 * u; }
    return { cx: w / 2, cy: cy, unit: u * z };
  }

  // ── build the scene ─────────────────────────────────────────────────────
  /** Flatten one posed frame into 2D parts for a skin to paint. */
  function scene(F: Frame, view: SceneView): Scene {
    var P = F.P, C = F.C, D = F.D, t = F.t, cam = view.cam;
    var size = P['body.size'] || 1;
    var W = 0.9 * P['body.w'] * size, Hh = 1.0 * P['body.h'] * size, Dd = 0.9 * P['body.d'] * size;
    var bev = min(P['body.bevel'] * size, Dd * 0.4, W * 0.2), taper = P['body.taper'];
    var rt = P['body.rt'] * min(W, Hh), rb = P['body.rb'] * min(W, Hh);
    var hover = 0.06, persp = P['view.persp'];
    var yaw = P['view.yaw'] + C.twist, pitch = P['view.pitch'] + C.nod * 0.7, roll = C.lean * 0.55;
    var sqx = 1 + C.squash * 0.55, sqy = 1 - C.squash, slant = P['body.slant'];
    var cy = cos(yaw), sy = sin(yaw), cp = cos(pitch), sp = sin(pitch), cr = cos(roll), sr = sin(roll);
    var ox = C.x, oy = C.y + hover;

    function tscale(v: number): number { var k = (v + Hh / 2) / Hh; return 1 - taper * (1 - k); }
    // body space → camera space [x, y, z]
    function body3(x: number, y: number, z: number): V3 {
      x *= sqx; z *= sqx; y = (y + Hh / 2) * sqy - Hh / 2;
      var k = (y + Hh / 2) / Hh; x += (slant * k + C.bend * k * k) * 0.5;
      var py = y + Hh / 2, x2 = x * cr - py * sr, y2 = x * sr + py * cr - Hh / 2;
      var x3 = x2 * cy + z * sy, z3 = -x2 * sy + z * cy;
      var y4 = y2 * cp - z3 * sp, z4 = y2 * sp + z3 * cp;
      return [x3 + ox, y4 + oy, z4];
    }
    // view-only space (hands float free of squash and roll)
    var vy = P['view.yaw'], vp = P['view.pitch'], vcy = cos(vy), vsy = sin(vy), vcp = cos(vp), vsp = sin(vp);
    function free3(x: number, y: number, z: number): V3 {
      var x3 = x * vcy + z * vsy, z3 = -x * vsy + z * vcy, y4 = y * vcp - z3 * vsp, z4 = y * vsp + z3 * vcp;
      return [x3 + ox, y4 + oy, z4];
    }
    function proj(p: V3): P4 { var s = 1 / (1 - p[2] * persp * 0.3); return [cam.cx + p[0] * s * cam.unit, cam.cy - p[1] * s * cam.unit, p[2], s]; }
    function B(x: number, y: number, z: number): P4 { return proj(body3(x, y, z)); }
    function onFace(u: number, v: number): P4 { return B(u * tscale(v), v, Dd / 2 + 0.002); }
    function faceLoop(pts: Pt[]): Pt[] { return pts.map(function (q): Pt { var r = onFace(q[0], q[1]); return [r[0], r[1]]; }); }

    var parts: Part[] = [], S = { w: view.w, h: view.h, unit: cam.unit, t: t, seed: view.seed || 0, parts: parts, guides: !!view.guides, cam: cam, F: F, key: 'main' } as Scene;

    // shadow on the floor
    var floorY = -Hh / 2 - 0.32, sh: P4[] = [];
    for (var i = 0; i < 28; i++) { var a = i / 28 * PI * 2; sh.push(proj(free3(cos(a) * W * 0.62, floorY, sin(a) * Dd * 0.75))); }
    var hopLift = max(0, C.y) * 1.5;
    parts.push({ role: 'shadow', fill: 'shadow', pts: sh.map(function (q): Pt { return [q[0], q[1]]; }), alpha: 0.5 / (1 + hopLift), stroke: false });

    // rings: inset front face, bevel ring, back ring
    var N = 5, r0 = rrect(W - 2 * bev, Hh - 2 * bev, max(0, rt - bev * 0.6), max(0, rb - bev * 0.6), N), r1 = rrect(W, Hh, rt, rb, N);
    var R0 = r0.map(function (q): V3 { return [q[0] * tscale(q[1]), q[1], Dd / 2]; });
    var R1 = r1.map(function (q): V3 { return [q[0] * tscale(q[1]), q[1], Dd / 2 - bev]; });
    var R2 = r1.map(function (q): V3 { return [q[0] * tscale(q[1]), q[1], -Dd / 2]; });
    var T0 = R0.map(function (q) { return body3(q[0], q[1], q[2]); }), T1 = R1.map(function (q) { return body3(q[0], q[1], q[2]); }), T2 = R2.map(function (q) { return body3(q[0], q[1], q[2]); });
    var P0 = T0.map(proj), P1 = T1.map(proj), P2 = T2.map(proj);

    var facets: Part[] = [], all: Pt[] = [];
    function facet(Ta: V3[], Tb: V3[], Pa: P4[], Pb: P4[], kind: string) {
      for (var j = 0, n = Ta.length; j < n; j++) {
        var j2 = (j + 1) % n, q = [Pa[j], Pb[j], Pb[j2], Pa[j2]];
        var scr = q.map(function (p): Pt { return [p[0], p[1]]; });
        if (K.area(scr) >= -0.01) continue;
        var a3 = Ta[j], b3 = Tb[j], c3 = Tb[j2], d3 = Ta[j2];
        var u: V3 = [c3[0] - a3[0], c3[1] - a3[1], c3[2] - a3[2]], v: V3 = [b3[0] - d3[0], b3[1] - d3[1], b3[2] - d3[2]];
        var nrm = norm([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
        var sh2 = K.clamp(0.5 + 0.5 * (nrm[0] * LIGHT[0] + nrm[1] * LIGHT[1] + nrm[2] * LIGHT[2]), 0, 1);
        facets.push({ role: kind, fill: 'side', shade: sh2 * 0.8, normal: nrm, pts: scr, seam: true, z: (a3[2] + b3[2] + c3[2] + d3[2]) / 4 });
        all.push.apply(all, scr);
      }
    }
    facet(T1, T2, P1, P2, 'facet');
    facet(T0, T1, P0, P1, 'bevel');
    facets.sort(function (a, b) { return a.z! - b.z!; });

    // hands: compute now, draw the far one behind the body
    var hands = ['L', 'R'].map(function (s) { return hand(s); });
    hands.sort(function (a, b) { return a.z - b.z; });
    if (hands[0]!.z < -0.02) pushHand(hands[0]!);

    parts.push.apply(parts, facets);
    var front = P0.map(function (p): Pt { return [p[0], p[1]]; });
    var fN = norm(sub(body3(0, 0, 1), body3(0, 0, 0)));
    var fShade = K.clamp(0.5 + 0.5 * (fN[0] * LIGHT[0] + fN[1] * LIGHT[1] + fN[2] * LIGHT[2]), 0, 1);
    parts.push({ role: 'front', fill: 'body', shade: 0.35 + fShade * 0.65, pts: front, edge: true, lw: 1 });
    all.push.apply(all, front);
    var sil = K.hull(all);
    parts.push({ role: 'sil', pts: sil, line: true, closed: true, lw: 1.25 });
    S.front = front; S.sil = sil; S.body = K.bbox(sil); S.facets = facets;
    S.mesh = mesh(8, 10);

    // ── the face ───────────────────────────────────────────────────────────
    var cheat = (P['eyes.cheat'] || 0) * sin(yaw) * -W * 0.14;
    var splitV: number | null = P['body.split']! > 0.01 ? -Hh / 2 + P['body.split']! * Hh : null;
    var eyeV = Hh / 2 - bev - P['eyes.height']! * (Hh - 2 * bev) * 0.9;
    var ew0 = P['eyes.size']! * 0.55 * size, eh0 = ew0 * P['eyes.aspect']!;
    var exps = 2 + P['eyes.shape']! * 5;
    var eyes: EyeSpec[] = [-1, 1].map(function (side): EyeSpec {
      var s = side < 0 ? 'L' : 'R', dirIn = -side;
      var o = C['eyes.open.' + s]!, sc = C['eyes.scale']! * (o > 1 ? 1 + (o - 1) * 0.3 : 1);
      var ew = ew0 * sc, eh = eh0 * sc, cu = side * P['eyes.spacing']! * (W - 2 * bev) / 2 * tscale(eyeV) + cheat, cv = eyeV;
      return { side: side, s: s, dirIn: dirIn, o: o, ew: ew, eh: eh, cu: cu, cv: cv };
    });

    // door split across the front and around the visible side
    if (splitV != null) {
      var sv = splitV;
      [-1, 1].forEach(function (sd) {
        var n3 = sub(body3(sd, 0, 0), body3(0, 0, 0));
        if (n3[2] > 0.04) {
          var x = sd * W / 2 * tscale(sv), a = B(x, sv, Dd / 2 - bev), b = B(x, sv, -Dd / 2);
          parts.push({ role: 'split-side', pts: [[a[0], a[1]], [b[0], b[1]]], line: true, lw: 0.8 });
        }
      });
    }

    eyes.forEach(function (e) { eyeParts(e); });
    browParts();
    mouthParts();
    fxParts();
    if (hands[0]!.z >= -0.02) pushHand(hands[0]!);
    pushHand(hands[1]!);
    guideParts();
    return S;

    // ── helpers that need the closure ─────────────────────────────────────
    function sub(a: V3, b: V3): V3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
    function xy(p: P4): Pt { return [p[0], p[1]]; }
    // wire mesh over the visible planes: front, the near side, the top
    function mesh(nu: number, nv: number): MeshLine[] {
      var lines: MeshLine[] = [], j: number, k: number, pl: Pt[];
      for (j = 0; j <= nu; j++) { pl = []; for (k = 0; k <= 10; k++) pl.push(xy(onFace(-W / 2 + W * j / nu, -Hh / 2 + Hh * k / 10))); lines.push({ plane: 'front', pts: pl }); }
      for (j = 0; j <= nv; j++) { pl = []; for (k = 0; k <= 10; k++) pl.push(xy(onFace(-W / 2 + W * k / 10, -Hh / 2 + Hh * j / nv))); lines.push({ plane: 'front', pts: pl }); }
      [-1, 1].forEach(function (sd) {
        var n3 = sub(body3(sd, 0, 0), body3(0, 0, 0)); if (n3[2] <= 0.04) return;
        for (j = 0; j <= 5; j++) { var z = Dd / 2 - Dd * j / 5; pl = []; for (k = 0; k <= 10; k++) { var v = -Hh / 2 + Hh * k / 10; pl.push(xy(B(sd * W / 2 * tscale(v), v, z))); } lines.push({ plane: 'side', pts: pl }); }
        for (j = 0; j <= nv; j++) { var v2 = -Hh / 2 + Hh * j / nv; lines.push({ plane: 'side', pts: [xy(B(sd * W / 2 * tscale(v2), v2, Dd / 2)), xy(B(sd * W / 2 * tscale(v2), v2, -Dd / 2))] }); }
      });
      var nt = sub(body3(0, 1, 0), body3(0, 0, 0));
      if (nt[2] > 0.04) {
        for (j = 0; j <= nu; j++) { var x = -W / 2 + W * j / nu; lines.push({ plane: 'top', pts: [xy(B(x, Hh / 2, Dd / 2)), xy(B(x, Hh / 2, -Dd / 2))] }); }
        for (j = 0; j <= 5; j++) { var z2 = Dd / 2 - Dd * j / 5; lines.push({ plane: 'top', pts: [xy(B(-W / 2, Hh / 2, z2)), xy(B(W / 2, Hh / 2, z2))] }); }
      }
      return lines;
    }
    function superEllipse(cu: number, cv: number, ew: number, eh: number, n: number, k: number): Pt[] {
      var pts: Pt[] = [];
      for (var j = 0; j < k; j++) {
        var a = j / k * PI * 2, c = cos(a), s = sin(a);
        pts.push([cu + Math.sign(c) * Math.pow(abs(c), 2 / n) * ew, cv + Math.sign(s) * Math.pow(abs(s), 2 / n) * eh]);
      }
      return pts;
    }
    function eyeParts(e: EyeSpec) {
      var mode = D.eyeMode;
      if (mode === 'happy' || mode === 'shut' || mode === 'x' || mode === 'heart') {
        var pts: Pt[] = [], k: number;
        if (mode === 'happy') { for (k = 0; k <= 12; k++) { var u = -1 + k / 6; pts.push([e.cu + u * e.ew, e.cv - e.eh * 0.2 + e.eh * 0.75 * (1 - u * u)]); } }
        else if (mode === 'shut') pts = [[e.cu - e.dirIn * e.ew, e.cv + e.eh * 0.55], [e.cu + e.dirIn * e.ew * 0.7, e.cv], [e.cu - e.dirIn * e.ew, e.cv - e.eh * 0.55]];
        else if (mode === 'x') {
          parts.push({ role: 'eye-line', pts: faceLoop([[e.cu - e.ew, e.cv + e.eh * .7], [e.cu + e.ew, e.cv - e.eh * .7]]), line: true, lw: 1.6 });
          pts = [[e.cu - e.ew, e.cv - e.eh * .7], [e.cu + e.ew, e.cv + e.eh * .7]];
        } else {
          var hp = heart(e.cu, e.cv, e.ew * 1.25);
          parts.push({ role: 'eye-heart', fill: 'heart', pts: faceLoop(hp), edge: true, lw: 0.8 }); return;
        }
        parts.push({ role: 'eye-line', pts: faceLoop(pts), line: true, lw: 1.7 });
        return;
      }
      var upper = P['eyes.upper'] || 0, o = K.clamp(e.o, 0, 1) * (1 - upper * 0.5), tilt = C['eyes.tilt.' + e.s]!, sq = C['eyes.squint.' + e.s]!;
      var outline = superEllipse(e.cu, e.cv, e.ew, e.eh, exps, 40);
      var lid = function (u: number) { return e.cv + e.eh * (1 - 2 * (1 - o)) - tilt * e.dirIn * ((u - e.cu) / e.ew) * e.eh * 0.55 - abs(tilt) * e.eh * 0.15; };
      var low = function (u: number) { var x = (u - e.cu) / e.ew; return e.cv - e.eh + sq * e.eh * 1.1 * (1 - 0.3 * x * x); };
      var clipped = outline.map(function (q): Pt { return [q[0], K.clamp(q[1], low(q[0]), max(low(q[0]), lid(q[0])))]; });
      var openH = K.bbox(clipped).h;
      if (openH < e.eh * 0.12) {
        var ln: Pt[] = []; for (var k2 = 0; k2 <= 10; k2++) { var uu = e.cu - e.ew + k2 / 5 * e.ew; ln.push([uu, min(lid(uu), e.cv) - e.eh * 0.1 * Math.pow(1 - abs((uu - e.cu) / e.ew), 0.5) * (1 - abs(tilt))]); }
        parts.push({ role: 'eye-line', pts: faceLoop(ln), line: true, lw: 1.6 });
        return;
      }
      var white = faceLoop(clipped);
      parts.push({ role: 'eye', fill: 'eyeWhite', pts: white, edge: true, lw: 0.9 });
      // pupil
      var pr = P['eyes.pupil']! * min(e.ew, e.eh) * 0.62, lx = C['eyes.lookX']!, ly = C['eyes.lookY']!;
      var pu = e.cu + lx * e.ew * 0.45, pv = e.cv - e.eh * 0.05 + ly * e.eh * 0.4;
      var pupil = faceLoop(superEllipse(pu, pv, pr, pr * 1.08, exps, 24));
      parts.push({ role: 'pupil', fill: 'pupil', pts: pupil, clip: white, stroke: false });
      parts.push({ role: 'glint', fill: 'glint', pts: faceLoop(superEllipse(pu + pr * 0.35, pv + pr * 0.4, pr * 0.28, pr * 0.28, 2, 10)), clip: white, stroke: false });
      // heavy upper lid: the top half of the clipped outline
      var top: Pt[] = [], mid = K.bbox(clipped).cy;
      for (var j = 0; j < clipped.length; j++) if (clipped[j]![1] >= mid - 1e-6) top.push(clipped[j]!);
      top.sort(function (a, b) { return a[0] - b[0]; });
      parts.push({ role: 'lid', pts: faceLoop(top), line: true, lw: 1.5 + upper * 1.5 });
      if (P['eyes.lash']! > 0.05) {
        for (var l = 0; l < 3; l++) {
          var aa = 0.25 + l * 0.3, bu = e.cu - e.dirIn * e.ew * (0.35 + l * 0.3), bv = lid(bu) - 0.003, L2 = P['eyes.lash']! * 0.06;
          parts.push({ role: 'lash', pts: faceLoop([[bu, bv], [bu - e.dirIn * L2 * cos(aa), bv + L2 * sin(aa + 0.6)]]), line: true, lw: 1.1 });
        }
      }
      if (P['eyes.bag']! > 0.05) {
        var bg: Pt[] = []; for (var b2 = 0; b2 <= 8; b2++) { var bx = -0.7 + b2 / 8 * 1.4; bg.push([e.cu + bx * e.ew, e.cv - e.eh * 1.25 - 0.012 * (1 - bx * bx)]); }
        parts.push({ role: 'bag', pts: faceLoop(bg), line: true, lw: 0.7 * P['eyes.bag']! });
      }
    }
    function browParts() {
      eyes.forEach(function (e) {
        var bl = P['brows.len']! * 0.42 * size, th = P['brows.thick']! * 0.45 * size; if (bl < 0.005) return;
        var raise = C['brows.raise.' + e.s]!, ang = C['brows.angle.' + e.s]!, arch = P['brows.arch']!, tp = P['brows.taper']!;
        var bv = e.cv + eh0 * C['eyes.scale']! + P['brows.gap']! * 0.45 + raise * 0.07 + th;
        var topE: Pt[] = [], botE: Pt[] = [];
        for (var k = 0; k <= 10; k++) {
          var s = k / 10, u = e.cu + e.dirIn * bl * (1 - 2 * s);
          var v = bv + arch * 0.035 * sin(s * PI) + ang * 0.075 * (0.5 - s) * 2 * 0.5 + ang * 0.02;
          var w = th * (1 + tp * (0.6 - s));
          topE.push([u, v + w * (0.4 + 0.6 * sin(PI * (0.15 + s * 0.7)))]); botE.push([u, v - w * (0.4 + 0.6 * sin(PI * (0.15 + s * 0.7)))]);
        }
        parts.push({ role: 'brow', fill: 'brow', pts: faceLoop(topE.concat(botE.reverse())), edge: true, lw: 0.5 });
      });
    }
    function mouthParts() {
      var wide = C['mouth.wide']!, rnd = C['mouth.round']!, open = max(0, C['mouth.open']!), smile = C['mouth.smile']!, skew = C['mouth.skew']!;
      var mv = (splitV != null ? splitV : eyeV - 0.34 * Hh) + (P['mouth.y'] || 0) * Hh * 0.5;
      var mw = P['mouth.width']! * (W - 2 * bev) * 0.5 * wide * (1 - rnd * 0.55) * tscale(mv), mu = cheat * 0.8;
      var oh = open * 0.12 * size * (1 + rnd * 0.4);
      var corner = function (x: number) { return smile * 0.05 * x * x + skew * 0.035 * x - abs(smile) * 0.01; };
      var halfW = (W / 2) * tscale(mv) - bev * 0.5;
      if (oh < 0.012) {
        // shut: the mouth is just a bend in the door line
        var ln: Pt[] = [], k: number;
        if (splitV != null) ln.push([-halfW, mv]);
        for (k = 0; k <= 16; k++) { var x = -1 + k / 8; ln.push([mu + x * mw, mv + corner(x) - (rnd * 0.01 * (1 - x * x))]); }
        if (splitV != null) ln.push([halfW, mv]);
        parts.push({ role: 'mouth-line', pts: faceLoop(ln), line: true, lw: 1.2 });
        return;
      }
      var topL: Pt[] = [], botL: Pt[] = [], n = 18;
      for (var j = 0; j <= n; j++) {
        var x2 = -1 + j / n * 2, e = Math.sqrt(max(0, 1 - x2 * x2)), cc = corner(x2);
        topL.push([mu + x2 * mw, mv + cc + oh * (0.18 + rnd * 0.4) * e - smile * 0.012 * e]);
        botL.push([mu + x2 * mw, mv + cc - oh * Math.pow(e, 0.8 - rnd * 0.3) * (1 - rnd * 0.1)]);
      }
      var mouth = faceLoop(topL.concat(botL.slice().reverse()));
      if (splitV != null) {
        parts.push({ role: 'split', pts: faceLoop([[-halfW, mv], [mu - mw * 1.0, mv + corner(-1)]]), line: true, lw: 1.0 });
        parts.push({ role: 'split', pts: faceLoop([[mu + mw * 1.0, mv + corner(1)], [halfW, mv]]), line: true, lw: 1.0 });
      }
      parts.push({ role: 'mouth', fill: 'mouth', pts: mouth, edge: true, lw: 1.2 });
      if (C['mouth.teeth']! * (P['mouth.teeth'] == null ? 1 : P['mouth.teeth']) > 0.3 && open > 0.15) {
        var tb = min(oh * 0.35, 0.045), teeth = topL.concat(topL.map(function (q): Pt { return [q[0], q[1] - tb]; }).reverse());
        parts.push({ role: 'teeth', fill: 'teeth', pts: faceLoop(teeth), clip: mouth, edge: true, lw: 0.5 });
      }
      if (C['mouth.tongue']! > 0.1) {
        var tg = superEllipse(mu + mw * 0.1, botL[n / 2]![1] + oh * 0.2, mw * 0.55, oh * 0.4 * C['mouth.tongue']! + 0.01, 2, 20);
        parts.push({ role: 'tongue', fill: 'tongue', pts: faceLoop(tg), clip: mouth, edge: true, lw: 0.5 });
      }
    }
    function heart(cu: number, cv: number, r: number): Pt[] {
      var pts: Pt[] = []; for (var k = 0; k < 30; k++) { var a = k / 30 * PI * 2, x = 16 * Math.pow(sin(a), 3), y = 13 * cos(a) - 5 * cos(2 * a) - 2 * cos(3 * a) - cos(4 * a); pts.push([cu + x / 17 * r, cv + y / 17 * r]); }
      return pts;
    }
    function drop(cx: number, cy: number, r: number): Pt[] { var pts: Pt[] = []; for (var k = 0; k < 16; k++) { var a = k / 16 * PI * 2; pts.push([cx + sin(a) * r * (1 - 0.6 * max(0, cos(a))), cy - cos(a) * r * 1.3 + (cos(a) > 0.9 ? r : 0)]); } return pts; }
    function fxParts() {
      var k: number;
      if (C['fx.blush']! > 0.05) eyes.forEach(function (e) {
        parts.push({ role: 'blush', fill: 'blush', alpha: C['fx.blush']! * 0.55, pts: faceLoop(superEllipse(e.cu - e.dirIn * e.ew * 0.3, e.cv - e.eh * 1.6, e.ew * 1.1, e.eh * 0.35, 2, 18)), stroke: false });
      });
      if (C['fx.tears']! > 0.05) eyes.forEach(function (e) {
        for (k = 0; k < 3; k++) {
          var ph = (t * 1.3 + k / 3 + (e.side > 0 ? 0.15 : 0)) % 1;
          parts.push({ role: 'tear', fill: 'tear', pts: faceLoop(drop(e.cu - e.dirIn * e.ew * 0.7, e.cv - e.eh * 0.9 - ph * 0.42, 0.022 * C['fx.tears']!)), edge: true, lw: 0.6, alpha: 1 - ph * 0.6 });
        }
      });
      if (C['fx.sweat']! > 0.05) parts.push({ role: 'sweat', fill: 'tear', pts: faceLoop(drop(W * 0.34, Hh * 0.38 - (t * 0.12 % 0.12), 0.035 * C['fx.sweat']!)), edge: true, lw: 0.7 });
      var top = proj(body3(0, Hh / 2, 0));
      if (C['fx.hearts']! > 0.05) for (k = 0; k < 3; k++) {
        var ph2 = (t * 0.5 + k / 3) % 1, hx = top[0] + (k - 1) * cam.unit * 0.38 + sin(t * 2 + k) * cam.unit * 0.04, hy = top[1] - cam.unit * (0.1 + ph2 * 0.5);
        parts.push({ role: 'heart', fill: 'heart', pts: heart(hx, hy, cam.unit * 0.06 * C['fx.hearts']! * (1 - ph2 * 0.3)), edge: true, lw: 0.8, alpha: 1 - ph2 });
      }
      if (C['fx.burst']! > 0.05) {
        var bb = S.body, rr = Math.hypot(bb.w, bb.h) * 0.62;
        for (k = 0; k < 18; k++) {
          var a = k / 18 * PI * 2 + 0.2, r1 = rr * (1.05 + K.hash(k + Math.floor(t * 8)) * 0.15), r2 = r1 + cam.unit * 0.18 * C['fx.burst']!;
          parts.push({ role: 'burst', pts: [[bb.cx + cos(a) * r1, bb.cy + sin(a) * r1], [bb.cx + cos(a) * r2, bb.cy + sin(a) * r2]], line: true, lw: 1.4, accent: k % 3 });
        }
      }
      if (C['fx.zzz']! > 0.05) for (k = 0; k < 3; k++) {
        var ph3 = (t * 0.35 + k / 3) % 1, zs = cam.unit * 0.05 * (0.6 + ph3), zx = top[0] + cam.unit * (0.3 + ph3 * 0.25), zy = top[1] - cam.unit * (0.05 + ph3 * 0.45);
        parts.push({ role: 'zzz', pts: [[zx, zy], [zx + zs, zy], [zx, zy + zs], [zx + zs, zy + zs]], line: true, lw: 1, alpha: 1 - ph3 });
      }
    }

    // ── hands ─────────────────────────────────────────────────────────────
    function hand(s: string): HandSpec {
      var side = s === 'L' ? -1 : 1, hs = P['hands.size']! * size;
      var hy = P['hands.y']! * Hh * 0.5 + C['hand' + s + '.y']! * Hh * 0.85;
      var hx = side * (W / 2 + 0.08 + P['hands.spread']! * 0.45 + hs * 0.5) + C['hand' + s + '.x']! * 1.3;
      var hz = 0.05 + C['hand' + s + '.z']! * Dd * 0.9;
      var c3 = free3(hx, hy, hz), c = proj(c3);
      return { s: s, side: side, shape: D['hand' + s]!, rot: C['hand' + s + '.rot']!, c: c, z: c3[2], scale: hs * 1.35 * cam.unit * c[3] };
    }
    function capsule(x0: number, y0: number, x1: number, y1: number, r: number): Pt[] {
      var a = Math.atan2(y1 - y0, x1 - x0), pts: Pt[] = [], k: number;
      for (k = 0; k <= 8; k++) { var b = a + PI / 2 + k / 8 * PI; pts.push([x0 + cos(b) * r, y0 + sin(b) * r]); }
      for (k = 0; k <= 8; k++) { var b2 = a - PI / 2 + k / 8 * PI; pts.push([x1 + cos(b2) * r, y1 + sin(b2) * r]); }
      return pts;
    }
    function rbox(x0: number, y0: number, x1: number, y1: number, r: number): Pt[] { return rrect(x1 - x0, y1 - y0, r, r, 4).map(function (q): Pt { return [q[0] + (x0 + x1) / 2, q[1] + (y0 + y1) / 2]; }); }
    function handShape(shape: string): { polys: Pt[][]; lines: Pt[][] } {
      var polys: Pt[][] = [], lines: Pt[][] = [], fist = function () { polys.push(rbox(-0.32, -0.3, 0.32, 0.32, 0.17)); };
      var fingersUp = function (n: number) {
        var xs = [0.2, 0.07, -0.07, -0.2];
        for (var i = 0; i < n; i++) polys.push(capsule(xs[i]!, 0.15, xs[i]! + (i - 1) * 0.06, 0.78 - abs(i - 1.2) * 0.06, 0.085));
      };
      switch (shape) {
        case 'open': case 'four':
          polys.push(rbox(-0.3, -0.32, 0.3, 0.3, 0.17)); fingersUp(4);
          if (shape === 'open') polys.push(capsule(-0.24, -0.08, -0.56, 0.24, 0.09));
          break;
        case 'fist': fist(); polys.push(capsule(-0.3, 0.02, 0.06, 0.06, 0.085)); for (var k = 0; k < 3; k++) lines.push([[-0.15 + k * 0.15, 0.32], [-0.15 + k * 0.15, 0.2]]); break;
        case 'point': case 'one': fist(); fingersUp(1); polys.push(capsule(-0.3, 0.0, 0.0, 0.04, 0.085)); break;
        case 'two': fist(); fingersUp(2); polys.push(capsule(-0.3, 0.0, 0.0, 0.04, 0.085)); break;
        case 'three': fist(); fingersUp(3); break;
        case 'thumbsup': polys.push(rbox(-0.3, -0.32, 0.32, 0.22, 0.16)); polys.push(capsule(-0.18, 0.15, -0.2, 0.68, 0.1)); for (var k2 = 0; k2 < 3; k2++) lines.push([[0.32, -0.2 + k2 * 0.14], [0.14, -0.2 + k2 * 0.14]]); break;
        default: // rest: a hanging mitt
          polys.push(rbox(-0.27, -0.5, 0.27, 0.32, 0.22)); polys.push(capsule(-0.24, 0.1, -0.4, -0.18, 0.09));
          lines.push([[0.02, -0.5], [0.02, -0.18]]); lines.push([[0.15, -0.46], [0.15, -0.2]]);
      }
      return { polys: polys, lines: lines };
    }
    function pushHand(h: HandSpec) {
      var g = 'hand' + h.s, sh = handShape(h.shape), mir = h.side < 0 ? -1 : 1;
      var rot = h.rot * mir, cr2 = cos(rot), sr2 = sin(rot);
      var map = function (q: Pt): Pt { var x = q[0] * mir, y = q[1]; var xr = x * cr2 - y * sr2, yr = x * sr2 + y * cr2; return [h.c[0] + xr * h.scale, h.c[1] - yr * h.scale]; };
      sh.polys.forEach(function (pl, idx) {
        parts.push({ role: 'hand', fill: 'hand', shade: 0.75, pts: pl.map(map), group: g, groupStart: idx === 0, edge: true });
      });
      sh.lines.forEach(function (ln) { parts.push({ role: 'hand-line', pts: ln.map(map), line: true, group: g, lw: 0.7 }); });
      if (D.prop === 'letter' && h.s === 'R') {
        var lp = ([[-0.1, 0.25], [0.95, 0.35], [0.9, 1.05], [-0.15, 0.95]] as Pt[]).map(map);
        parts.push({ role: 'prop', fill: 'eyeWhite', pts: lp, edge: true, lw: 0.9 });
        for (var k = 0; k < 3; k++) parts.push({ role: 'prop-line', pts: ([[0.05, 0.5 + k * 0.15], [0.75, 0.57 + k * 0.15]] as Pt[]).map(map), line: true, lw: 0.5 });
      }
      var info = { x: h.c[0], y: h.c[1], r: h.scale };
      if (h.s === 'L') S.handL = info; else S.handR = info;
    }
    function guideParts() {
      var gl = function (pts: Pt[]) { parts.push({ role: 'guide', pts: pts, line: true, lw: 0.6, guide: true }); };
      gl([B(0, -Hh / 2 - 0.25, Dd / 2), B(0, Hh / 2 + 0.25, Dd / 2)].map(xy));
      [eyeV, splitV == null ? 0 : splitV, -Hh / 2 + 0.05].forEach(function (v) {
        gl([B(-W / 2 - 0.2, v, Dd / 2), B(W / 2 + 0.2, v, Dd / 2)].map(xy));
      });
      gl([B(-W / 2, Hh / 2 + 0.1, -Dd / 2), B(-W / 2, -Hh / 2 - 0.1, -Dd / 2)].map(xy));
      gl([B(-W / 2 - 0.15, Hh / 2, Dd / 2), B(-W / 2 - 0.15, Hh / 2, -Dd / 2 - 0.2)].map(xy));
      [S.handL, S.handR].forEach(function (hh) {
        if (!hh) return; var c: Pt[] = [];
        for (var j = 0; j < 24; j++) { var a = j / 24 * PI * 2; c.push([hh.x + cos(a) * hh.r * 0.62, hh.y + sin(a) * hh.r * 0.62]); }
        parts.push({ role: 'guide', pts: c, line: true, closed: true, lw: 0.6, guide: true });
      });
    }
  }

  interface EyeSpec { side: number; s: string; dirIn: number; o: number; ew: number; eh: number; cu: number; cv: number }
  interface HandSpec { s: string; side: number; shape: string; rot: number; c: P4; z: number; scale: number }

  // ── render one frame of one actor into a 2D context ─────────────────────
  export interface RenderOptions {
    skin: Skin;
    palette?: string;
    frame?: Framing | string;
    guides?: boolean;
    /** Time used for the skin's boil and effects; defaults to the frame's time. */
    t?: number;
    /** Keeps per-canvas buffers apart for skins that remember the last frame. */
    key?: string;
    zoom?: number;
    cam?: Camera | null;
    /** Paint the skin's background. Default true. */
    ground?: boolean;
    seedOff?: number;
  }
  /** Draw one frame of one actor. Returns the Scene that was painted. */
  function render(ctx: Ctx2D, w: number, h: number, F: Frame, o: RenderOptions): Scene {
    var skin = o && o.skin, t = o.t == null ? F.t : o.t;
    if (!skin || !skin.draw) throw new Error('maxcot render: pass a skin, e.g. import { pencil } from "maxcot/skins"');
    var cam = o.cam || camera(F.P, w, h, o.frame || 'full', o.zoom);
    var fps = skin.fps || 12, seed = Math.floor(t * fps) + (o.seedOff || 0);
    var S = scene(F, { w: w, h: h, cam: cam, guides: o.guides, seed: seed });
    return paint(ctx, S, skin, { t: t, palette: o.palette, key: o.key, ground: o.ground });
  }

  /** Paint an already-built scene (one actor, or several merged) with a skin. */
  function paint(ctx: Ctx2D, S: Scene, skin: Skin, o: { t: number; palette?: string; key?: string; ground?: boolean }): Scene {
    S.palette = o.palette; S.key = o.key || 'main'; S.style = skin.name;
    var view = { w: S.w, h: S.h, t: o.t, palette: o.palette, seed: S.seed, key: S.key };
    if (o.ground !== false) {
      ctx.save();
      if (skin.ground && skin.ground.draw) skin.ground.draw(ctx, S.w, S.h, o.t, K, view);
      else { ctx.fillStyle = (skin.ground && skin.ground.css) || '#f3f2ec'; ctx.fillRect(0, 0, S.w, S.h); }
      ctx.restore();
    }
    ctx.save(); skin.draw(S, ctx, view); ctx.restore();
    return S;
  }

  /**
   * Merge several actors' scenes into one, so a skin paints them in a single pass
   * (whole-frame effects like glitch then treat the cast as one picture).
   * Scenes go far to near; every shadow is drawn first.
   */
  function mergeScenes(scenes: Scene[]): Scene {
    if (scenes.length === 1) return scenes[0]!;
    var shadows: Part[] = [], rest: Part[] = [], all: Pt[] = [];
    scenes.forEach(function (s, i) {
      s.parts.forEach(function (p) { p.actor = i; (p.role === 'shadow' ? shadows : rest).push(p); });
      all.push.apply(all, s.sil);
    });
    var first = scenes[0]!;
    return Object.assign({}, first, {
      parts: shadows.concat(rest), actors: scenes, sil: K.hull(all), body: K.bbox(all),
      facets: scenes.flatMap(function (s) { return s.facets; }), mesh: scenes.flatMap(function (s) { return s.mesh; }),
      guides: scenes.some(function (s) { return s.guides; })
    });
  }

  // ── a character on a canvas ─────────────────────────────────────────────
  export interface CharacterOptions {
    skin: Skin;
    /** Share an Actor between canvases, or let the character make its own. */
    actor?: Actor;
    who?: string;
    pose?: string;
    palette?: string;
    frame?: Framing | string;
    guides?: boolean;
    key?: string;
    /** Draw once (and again only when marked dirty), at a fixed moment. */
    isStatic?: boolean;
    /** Run its own requestAnimationFrame loop. Default true in browsers; pass false and call step(dt) to drive it yourself. */
    autoplay?: boolean;
  }

  /** One canvas, one actor, redrawn at the skin's own frame rate. */
  export class Character {
    canvas: CanvasLike;
    ctx: Ctx2D;
    actor: Actor;
    skin: Skin;
    palette?: string;
    frame: Framing | string;
    guides: boolean;
    zoom = 1;
    cam: Camera | null = null;
    key: string;
    isStatic: boolean;
    /** Force a redraw on the next draw(). */
    dirty = true;
    last = -1;
    /** Draw this frame instead of the actor's (for external control). */
    F: Frame | null = null;
    /** The last scene drawn. */
    S: Scene | null = null;
    /** Seconds this character has been running. */
    time = 0;
    private raf = 0;
    private lastNow = 0;

    constructor(canvas: CanvasLike, o: CharacterOptions) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d') as Ctx2D;
      this.actor = o.actor || new Actor({ who: o.who });
      if (o.pose) this.actor.pose(o.pose).snap();
      this.skin = o.skin; this.palette = o.palette; this.frame = o.frame || 'full'; this.guides = !!o.guides;
      this.key = o.key || ('c' + Math.random().toString(36).slice(2, 8)); this.isStatic = !!o.isStatic;
      var auto = o.autoplay == null ? typeof requestAnimationFrame === 'function' && !o.isStatic : o.autoplay;
      if (auto) this.start();
    }
    /** Morph design dials, e.g. { 'body.w': 1.2 }. */
    set(values: Record<string, number>): this { for (var k in values) this.actor.set(k, values[k]!); this.dirty = true; return this; }
    /** Spring into a pose. */
    pose(name: string | string[]): this { this.actor.pose(name); this.dirty = true; return this; }
    /** Morph into another actor. */
    cast(who: string): this { this.actor.cast(who); this.dirty = true; return this; }
    /** Change skin (and optionally palette). */
    setSkin(skin: Skin, palette?: string): this { this.skin = skin; if (palette) this.palette = palette; this.dirty = true; return this; }
    /** Draw at time t if the skin's frame has moved on (or force). Returns whether it drew. */
    draw(t: number, force?: boolean): boolean {
      var skin = this.skin, step = Math.floor(t * ((skin && skin.fps) || 12));
      if (this.isStatic && !this.dirty && !force) return false;
      if (!force && step === this.last && !this.dirty) return false;
      this.last = step; this.dirty = false;
      var F = this.F || this.actor.frame(this.isStatic ? 0.6 : null);
      this.S = render(this.ctx, this.canvas.width, this.canvas.height, F, {
        skin: this.skin, palette: this.palette, frame: this.frame, guides: this.guides, t: t, key: this.key, zoom: this.zoom, cam: this.cam
      });
      return true;
    }
    /** Advance the actor by dt seconds and draw. Use this when autoplay is off. */
    step(dt: number): this { this.time += dt; this.actor.update(dt); this.draw(this.time); return this; }
    /** Start the built-in animation loop. */
    start(): this {
      if (this.raf) return this;
      var self = this; this.lastNow = performance.now();
      var tick = function (now: number) { self.step(Math.min(0.1, (now - self.lastNow) / 1000)); self.lastNow = now; self.raf = requestAnimationFrame(tick); };
      this.raf = requestAnimationFrame(tick);
      return this;
    }
    /** Stop the built-in loop. */
    stop(): this { if (this.raf) cancelAnimationFrame(this.raf); this.raf = 0; return this; }
  }

  /** Put a character on a canvas. */
  function create(canvas: CanvasLike, o: CharacterOptions): Character { return new Character(canvas, o); }

export { create, render, paint, mergeScenes, scene, camera, rrect };
export const Ch = { create, render, paint, mergeScenes, scene, camera, rrect };
