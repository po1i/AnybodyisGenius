// Archimedes measuring a circle (Measurement of a Circle, Prop. 3): a dotted
// circle between an inscribed and a circumscribed polygon. The page shows it
// twice, always in its own space and never behind text:
//   - beside the headline (wide screens): it draws itself in, and on a mouse
//     the edge nearest the pointer shows its construction;
//   - beside the final signup: when it comes into view the sides double,
//     6 → 12 → 24 → 48 → 96, and the circle closes.
// A signup anywhere completes both drawings and traces the circle once in red.
//
// Rendering is on demand: a figure's rAF loop runs only while it is on screen
// and something is moving.

import { STAGES, THETA0 } from '../data/archimedes';

type V = [number, number];
type Kind = 'hero' | 'final';

const root = document.documentElement;
const motion = root.classList.contains('motion');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

const INK = '28,27,24';
const PLATE = '239,235,227';
const CONTROL = '133,126,114';
const RUBRIC = '168,50,28';
const TAU = Math.PI * 2;
const LAST = STAGES.length - 1;
const STORE = 'aig:circle';

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const resolve = (t: number) => 1 - Math.pow(1 - t, 4); // close to cubic-bezier(.16,1,.3,1)
const draw = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const now = () => performance.now();
const store = {
  get: (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch { /* fine */ } },
};

interface Figure { complete: () => void }

export function startArchimedes() {
  // high-contrast modes keep the static drawing
  if (window.matchMedia('(forced-colors: active), (prefers-contrast: more)').matches) return;
  const figures = [...document.querySelectorAll<HTMLElement>('[data-arch]')].map((host) =>
    mount(host, host.dataset.arch === 'final' ? 'final' : 'hero'),
  );
  if (!figures.length) return;

  // a signup anywhere completes the drawings (after any dialog has closed)
  const done = () => document.querySelector('[data-signup-box][data-state="done"]') !== null;
  let completed = false, dialogOpen = false, pending = false;
  const complete = () => {
    if (completed) return;
    completed = true;
    store.set(STORE, 'closed');
    figures.forEach((f) => f.complete());
  };
  window.addEventListener('aig:lock', () => (dialogOpen = true));
  window.addEventListener('aig:unlock', () => {
    dialogOpen = false;
    if (pending) { pending = false; complete(); }
  });
  const check = () => {
    if (completed || !done()) return;
    if (dialogOpen) pending = true;
    else complete();
  };
  new MutationObserver(check).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-state'] });
  // a signup (or an open dialog) from before this ran
  dialogOpen = root.classList.contains('is-locked');
  check();
}

function mount(host: HTMLElement, kind: Kind): Figure {
  const canvas = document.createElement('canvas');
  host.append(canvas);
  host.classList.add('is-live');
  const ctx = canvas.getContext('2d', { alpha: true })!;

  // ---- geometry -----------------------------------------------------------
  let S = 0, R = 0, dpr = 1;
  let dots: HTMLCanvasElement | null = null;
  const layout = () => {
    S = host.clientWidth;
    if (!S) return false;
    R = (S / 2 - 2) / 1.155; // the outer hexagon's corners just fit
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const px = Math.round(S * dpr);
    canvas.width = canvas.height = px;
    // pre-render the dotted circle (dashed arcs are slow on some phones)
    dots = document.createElement('canvas');
    dots.width = dots.height = px;
    const d = dots.getContext('2d')!;
    d.setTransform(dpr, 0, 0, dpr, 0, 0);
    d.strokeStyle = `rgba(${CONTROL},0.8)`;
    d.lineWidth = 1;
    d.setLineDash([2, 4]);
    d.beginPath();
    d.arc(S / 2, S / 2, R, 0, TAU);
    d.stroke();
    return true;
  };
  // unit circle (y up) → canvas CSS px
  const P = (x: number, y: number, r = 1): V => [S / 2 + x * R * r, S / 2 - y * R * r];
  const dir = (a: number): V => [Math.cos(a), Math.sin(a)];

  // ---- state --------------------------------------------------------------
  let stage = 0, target = 0;
  let trans: { t0: number; dur: number; from: number; start: number } | null = null;
  let fast = false;                       // signup: quick doublings
  let closeT0 = 0, closed = 0;            // dots → solid circle, polygons fade
  let introT0 = 0, intro = false;
  let fade = { t0: 0, from: 1, to: 1 }, alpha = 1;
  let rewardDue = false, rewardT0 = 0;
  let started = false, visible = false, completeDue = false;
  const lamp = { a: Math.PI, target: Math.PI, s: 0, sTarget: 0, edge: -1, dwellT0: 0, preview: 0, lastMove: 0 };
  let typing = false;

  // ---- drawing --------------------------------------------------------------
  const poly = (pts: V[]) => {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
  };
  const partial = (pts: V[], amount: number) => {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i <= Math.ceil(amount) && i <= pts.length; i++) {
      const a = pts[i - 1], b = pts[i % pts.length];
      const f = Math.min(1, amount - (i - 1));
      ctx.lineTo(lerp(a[0], b[0], f), lerp(a[1], b[1], f));
    }
  };

  // vertices for stage n, or mid-transition n → 2n with per-edge progress
  const shapes = (n: number, prog: ((k: number) => number) | null) => {
    const inner: V[] = [];
    const outer: V[] = [];
    const t1 = Math.tan(Math.PI / n), t2 = Math.tan(Math.PI / (2 * n));
    for (let k = 0; k < n; k++) {
      const a = THETA0 + (TAU * k) / n;
      const [x, y] = dir(a);
      inner.push(P(x, y));
      if (prog) {
        const p = resolve(clamp(prog(k)));
        const [mx, my] = dir(a + Math.PI / n);
        inner.push(P(mx, my, lerp(Math.cos(Math.PI / n), 1, p)));
      }
    }
    for (let j = 0; j < n; j++) {
      const a = THETA0 + (TAU * j) / n;
      const [x, y] = dir(a);
      const [px, py] = dir(a + Math.PI / 2);
      if (prog) {
        // the corner before tangent j belongs to edge j-1, the one after to edge j
        const tl = lerp(t1, t2, resolve(clamp(prog((j - 1 + n) % n))));
        const tr = lerp(t1, t2, resolve(clamp(prog(j))));
        outer.push(P(x - tl * px, y - tl * py), P(x + tr * px, y + tr * py));
      } else {
        outer.push(P(x + t1 * px, y + t1 * py));
      }
    }
    return { inner, outer };
  };

  const LINE = 0.34;
  const render = (t: number) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!S || !dots) return;
    const it = t - introT0;
    if (intro && it >= 3300) intro = false;
    const seg = (a: number, b: number) => (intro ? clamp((it - a) / (b - a)) : 1);

    let prog: ((k: number) => number) | null = null;
    let n = STAGES[stage];
    if (trans) {
      const el = t - trans.t0;
      const nOld = STAGES[trans.from];
      const per = Math.min(8, 380 / nOld);
      const start = trans.start;
      const dur = trans.dur;
      n = nOld;
      // sweep around from the starting bearing, a few ms per edge
      prog = (k: number) => {
        let d = Math.abs((((THETA0 + (TAU * k) / nOld + Math.PI / nOld - start) % TAU) + TAU) % TAU);
        d = Math.min(d, TAU - d) / Math.PI;
        return (el - d * nOld * 0.5 * per) / dur;
      };
    }
    const { inner, outer } = shapes(n, prog);
    const polyA = 1 - clamp(closed * 1.6 - 0.6); // polygons fade once the circle is solid

    // band between the polygons, under the circle and the lines
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = alpha * seg(2900, 3300) * polyA;
    ctx.fillStyle = `rgb(${PLATE})`;
    ctx.beginPath();
    poly(outer);
    poly(inner);
    ctx.fill('evenodd');

    // dotted circle, then the solid one as it closes
    if (closed < 1) {
      ctx.globalAlpha = alpha * seg(0, 600) * (1 - closed);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(dots, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    ctx.lineWidth = 1;
    if (closed > 0) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = `rgba(${INK},0.5)`;
      ctx.setLineDash(closed < 1 ? [2 + 18 * closed, 4 * (1 - closed)] : []);
      ctx.beginPath();
      ctx.arc(S / 2, S / 2, R, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // the reward: the closed circle traced once in red, from the top
    if (rewardT0 && t > rewardT0) {
      const out = clamp((t - rewardT0 - 1600) / 900);
      if (out < 1) {
        ctx.globalAlpha = alpha * (1 - out);
        ctx.strokeStyle = `rgba(${RUBRIC},0.85)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(S / 2, S / 2, R, -Math.PI / 2, -Math.PI / 2 + TAU * draw(clamp((t - rewardT0) / 1400)));
        ctx.stroke();
        ctx.lineWidth = 1;
      } else rewardT0 = 0;
    }

    ctx.strokeStyle = `rgba(${INK},${LINE})`;
    ctx.globalAlpha = alpha * polyA;
    if (intro) {
      // one radius, six equal sides, then the outer hexagon in one line
      const rA = seg(600, 1000) * (1 - seg(2700, 3200));
      if (rA > 0) {
        ctx.globalAlpha = alpha * rA;
        const c = P(0, 0), v = inner[0];
        ctx.beginPath();
        ctx.moveTo(c[0], c[1]);
        ctx.lineTo(lerp(c[0], v[0], seg(600, 1000)), lerp(c[1], v[1], seg(600, 1000)));
        ctx.stroke();
        ctx.globalAlpha = alpha * polyA;
      }
      ctx.beginPath();
      partial(inner, clamp((it - 1000) / 1000) * inner.length);
      ctx.stroke();
      const o = draw(seg(2000, 2900)) * outer.length;
      if (o > 0) {
        ctx.beginPath();
        partial(outer, o);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      poly(inner);
      poly(outer);
      ctx.stroke();
    }

    // attention lamp: the construction of the edge nearest the pointer
    if (lamp.s > 0.01 && !trans && !intro && closed === 0) {
      const k = Math.round(((((lamp.a - THETA0 - Math.PI / n) % TAU) + TAU) % TAU) / (TAU / n)) % n;
      for (let off = -2; off <= 2; off++) {
        const kk = (k + off + n) % n;
        const g = Math.exp(-(off * off) / 4.5) * lamp.s;
        if (g < 0.04) continue;
        const a0 = THETA0 + (TAU * kk) / n, a1 = a0 + TAU / n, am = a0 + Math.PI / n;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = `rgba(${INK},${0.32 * g})`;
        ctx.beginPath();
        for (const a of [a0, a1]) {
          const [x, y] = dir(a);
          const p = P(x, y, 0.55), q = P(x, y, 1.15);
          ctx.moveTo(p[0], p[1]);
          ctx.lineTo(q[0], q[1]);
        }
        // apothem, with a right-angle mark where it meets the edge
        const [mx, my] = dir(am);
        const ap = Math.cos(Math.PI / n);
        const s = P(mx, my, 0.55), e = P(mx, my, ap);
        ctx.moveTo(s[0], s[1]);
        ctx.lineTo(e[0], e[1]);
        if (off === 0) {
          const [tx, ty] = dir(am + Math.PI / 2);
          const m = 5 / R;
          const c1 = P(mx * ap - mx * m, my * ap - my * m);
          const c2 = P(mx * ap - mx * m + tx * m, my * ap - my * m + ty * m);
          const c3 = P(mx * ap + tx * m, my * ap + ty * m);
          ctx.moveTo(c1[0], c1[1]);
          ctx.lineTo(c2[0], c2[1]);
          ctx.lineTo(c3[0], c3[1]);
        }
        ctx.stroke();
        // resting on an edge previews its next doubling
        if (off === 0 && lamp.preview > 0.01 && stage < LAST) {
          const v0 = P(...dir(a0)), v1 = P(...dir(a1)), top = P(mx, my);
          const f = resolve(lamp.preview);
          const mid = P(mx, my, lerp(ap, 1, f));
          ctx.strokeStyle = `rgba(${INK},${0.28 * lamp.s * Math.min(1, lamp.preview * 2)})`;
          ctx.beginPath();
          ctx.moveTo(e[0], e[1]);
          ctx.lineTo(lerp(e[0], top[0], f), lerp(e[1], top[1], f));
          ctx.moveTo(v0[0], v0[1]);
          ctx.lineTo(mid[0], mid[1]);
          ctx.lineTo(v1[0], v1[1]);
          ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1;
  };

  // ---- the loop -------------------------------------------------------------
  let raf = 0;
  let last = now();
  const busy = () =>
    intro || !!trans || stage < target || (closed > 0 && closed < 1) || rewardDue || rewardT0 > 0 ||
    alpha !== fade.to || lamp.sTarget > 0 || lamp.s > 0 || lamp.preview > 0;

  const frame = (t: number) => {
    raf = 0;
    const dt = Math.min(64, t - last) / 1000;
    last = t;

    const fd = fade.to === fade.from ? 1 : clamp((t - fade.t0) / 450);
    alpha = lerp(fade.from, fade.to, fd);
    if (fd >= 1) { alpha = fade.to; fade.from = fade.to; }

    lamp.a += angDiff(lamp.target, lamp.a) * (1 - Math.exp(-14 * dt));
    if (t - lamp.lastMove > 1200) lamp.sTarget = 0;
    lamp.s += (lamp.sTarget - lamp.s) * (1 - Math.exp(-10 * dt));
    if (lamp.s < 0.005 && lamp.sTarget === 0) lamp.s = 0;
    if (lamp.sTarget > 0 && lamp.edge >= 0 && t - lamp.dwellT0 > 600) lamp.preview = Math.min(1, lamp.preview + dt / 0.7);
    else lamp.preview = Math.max(0, lamp.preview - dt / 0.35);

    // doublings, one at a time
    if (trans && t - trans.t0 > trans.dur + (trans.dur < 500 ? 220 : 380)) {
      stage = trans.from + 1;
      trans = null;
    }
    if (!trans && stage < target && !intro) {
      const dur = !motion ? 1 : fast ? 340 : 760;
      trans = { t0: t, dur, from: stage, start: lamp.s > 0.05 ? lamp.a : Math.PI / 2 };
      if (!motion) { stage = target; trans = null; }
    }
    // the final figure closes once it reaches 96 sides; the hero only after a signup
    const shouldClose = stage === LAST && (kind === 'final' || completeDue);
    if (!trans && shouldClose && closed === 0) { closeT0 = t; closed = 0.0001; }
    if (closed > 0 && closed < 1) closed = motion ? clamp((t - closeT0) / 1500, 0.0001, 1) : 1;
    if (rewardDue && closed >= 1) { rewardDue = false; if (motion) rewardT0 = t + 150; }

    render(t);
    if (visible && busy()) raf = requestAnimationFrame(frame);
  };

  const kick = () => {
    if (!visible || raf || !S) return;
    last = now();
    raf = requestAnimationFrame(frame);
  };

  // ---- first view -------------------------------------------------------------
  const begin = () => {
    started = true;
    const t = now();
    if (store.get(STORE) === 'closed' || completeDue) {
      // already signed up this session: the finished drawing
      stage = target = LAST;
      closed = 1;
      if (motion) { fade = { t0: t, from: 0, to: 1 }; alpha = 0; }
      return;
    }
    if (kind === 'hero') {
      if (motion && !store.get('aig:intro')) {
        store.set('aig:intro', '1');
        intro = true;
        introT0 = t + 120;
      } else if (motion) {
        fade = { t0: t, from: 0, to: 1 };
        alpha = 0;
      }
    } else if (motion) {
      // final: the hexagon appears, then the sides double up to 96 and it closes
      fade = { t0: t, from: 0, to: 1 };
      alpha = 0;
      window.setTimeout(() => { if (target < LAST) { target = LAST; kick(); } }, 700);
    }
    // reduced motion: the hexagons stay, as the caption describes
  };

  // ---- inputs ---------------------------------------------------------------
  const io = new IntersectionObserver(
    ([e]) => {
      visible = e.isIntersecting && e.intersectionRatio >= 0.35;
      if (visible && !started && layout()) begin();
      kick();
    },
    { threshold: [0, 0.35, 0.6] },
  );
  io.observe(host);

  const relayout = () => {
    if (host.clientWidth === S && Math.min(window.devicePixelRatio || 1, 2) === dpr) return;
    if (layout()) {
      if (!started && visible) begin();
      if (started) render(now()); // a figure that hasn't begun stays blank until it fades in
      kick();
    }
  };
  new ResizeObserver(relayout).observe(host);
  // moving to a sharper screen (or zooming) changes the pixel ratio without resizing the host
  const watchDpr = () =>
    window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
      .addEventListener('change', () => { relayout(); watchDpr(); }, { once: true });
  watchDpr();

  if (motion && finePointer) {
    host.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = host.getBoundingClientRect();
      const x = e.clientX - (r.left + S / 2);
      const y = -(e.clientY - (r.top + S / 2));
      const d = Math.hypot(x, y) / R;
      const near = d < 0.45 ? 0 : d < 0.9 ? (d - 0.45) / 0.45 : d < 1.2 ? 1 : 1 - (d - 1.2) / 0.2;
      lamp.sTarget = typing || closed > 0 ? 0 : clamp(near);
      lamp.target = Math.atan2(y, x);
      lamp.lastMove = now();
      const n = STAGES[stage];
      const edge = Math.round(((((lamp.target - THETA0 - Math.PI / n) % TAU) + TAU) % TAU) / (TAU / n)) % n;
      if (edge !== lamp.edge) { lamp.edge = edge; lamp.dwellT0 = now(); }
      kick();
    });
    host.addEventListener('pointerleave', () => { lamp.sTarget = 0; kick(); });
  }
  document.addEventListener('focusin', (e) => {
    if ((e.target as Element).matches?.('input[type="email"]')) { typing = true; lamp.sTarget = 0; kick(); }
  });
  document.addEventListener('focusout', (e) => {
    if ((e.target as Element).matches?.('input[type="email"]')) typing = false;
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) kick(); });

  return {
    // a signup: double quickly to 96, close, then trace the circle in red
    complete() {
      completeDue = true;
      fast = true;
      target = LAST;
      rewardDue = motion;
      kick();
    },
  };
}
