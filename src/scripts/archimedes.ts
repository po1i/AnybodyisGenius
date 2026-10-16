// Background: Archimedes measuring a circle (Measurement of a Circle, Prop. 3).
// A dotted circle between an inscribed and a circumscribed polygon. Each new
// section doubles the sides, 6 → 12 → 24 → 48 → 96, and at the final signup
// the circle closes. The drawing only ever gets more exact: no rotation, no
// spinning, and scrolling back keeps what was reached.
//
// Rendering is on demand: a rAF loop runs only while something is moving.
// The canvas sits under the content (z-index -2); the demo plate, the signup
// boxes and Fig. 2 sit on paper above it.

import { STAGES, THETA0 } from '../data/archimedes';

type V = [number, number];

const root = document.documentElement;
const motion = root.classList.contains('motion');
const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

const INK = '28,27,24';
const PLATE = '239,235,227';
const CONTROL = '133,126,114';
const RUBRIC = '168,50,28';
const TAU = Math.PI * 2;
const STORE = 'aig:circle';

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const resolve = (t: number) => 1 - Math.pow(1 - t, 4); // close to cubic-bezier(.16,1,.3,1)
const draw = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const now = () => performance.now();
const store = {
  get: (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch { /* fine */ } },
};

export function startArchimedes() {
  // high-contrast modes get the plain page
  if (window.matchMedia('(forced-colors: active), (prefers-contrast: more)').matches) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'arch';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d', { alpha: true })!;

  // ---- geometry -----------------------------------------------------------
  let vw = 0, vh = 0, maxVh = 0;
  let cx = 0, cy = 0, R = 0, phone = false, dpr = 1;
  let boxX = 0, boxY = 0, boxS = 0;   // the figure's square, in viewport px
  let offX = 0, offY = 0;             // canvas origin inside that square (only the on-screen part is allocated)
  let dots: HTMLCanvasElement | null = null;

  const layout = () => {
    vw = document.documentElement.clientWidth;
    vh = window.innerHeight;
    maxVh = Math.max(maxVh, vh);
    phone = vw < 768;
    const margin = vw >= 1200 ? 48 : 40;
    const gridW = Math.min(vw - margin * 2, 1200);
    if (vw >= 1200) {
      cx = (vw + gridW) / 2;
      cy = maxVh * 0.5;
      R = clamp(maxVh * 0.4, 280, 440);
    } else if (!phone) {
      cx = (vw + gridW) / 2;
      cy = maxVh * 0.32;
      R = vw * 0.34;
    } else {
      cx = vw;
      cy = maxVh * 0.26;
      R = vw * 0.6;
    }
    boxS = Math.ceil(R * 2.6);
    boxX = Math.round(cx - boxS / 2);
    boxY = Math.round(cy - boxS / 2);
    const mem = (navigator as any).deviceMemory as number | undefined;
    const save = (navigator as any).connection?.saveData;
    dpr = Math.min(window.devicePixelRatio || 1, mem && mem <= 4 || save ? 1.5 : 2);
    // the figure overhangs the viewport; allocate only the part that can be seen
    const x0 = Math.max(0, boxX), y0 = Math.max(0, boxY);
    const cw = Math.max(1, Math.min(vw, boxX + boxS) - x0);
    const ch = Math.max(1, Math.min(maxVh, boxY + boxS) - y0);
    offX = boxX - x0;
    offY = boxY - y0;
    canvas.style.left = `${x0}px`;
    canvas.style.top = `${y0}px`;
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    // pre-render the dotted circle (dashed arcs are slow on some phones)
    dots = document.createElement('canvas');
    dots.width = canvas.width;
    dots.height = canvas.height;
    const d = dots.getContext('2d')!;
    d.setTransform(dpr, 0, 0, dpr, offX * dpr, offY * dpr);
    d.strokeStyle = `rgba(${CONTROL},${phone ? 0.26 : 0.32})`;
    d.lineWidth = 1;
    d.setLineDash([2, 4]);
    d.beginPath();
    d.arc(boxS / 2, boxS / 2, R, 0, TAU);
    d.stroke();
  };

  // figure coordinates (unit circle, y up) → canvas CSS px
  const P = (x: number, y: number, r = 1): V => [boxS / 2 + x * R * r, boxS / 2 - y * R * r];
  const dir = (a: number): V => [Math.cos(a), Math.sin(a)];

  // ---- state --------------------------------------------------------------
  let stage = 0;            // index into STAGES that is fully drawn
  let target = 0;           // furthest stage reached
  let trans: { t0: number; dur: number; from: number; start: number } | null = null;
  let closeT0 = 0, closed = 0;      // circle closing: dots → solid, polygons fade
  let introT0 = 0, intro = false;
  let fade = { t0: 0, from: 0, to: 1 }, alpha = 1;
  let anticip = 0, anticipShown = 0;
  const lamp = { a: Math.PI, target: Math.PI, s: 0, sTarget: 0, edge: -1, dwellT0: 0, preview: 0, lastMove: 0 };
  let paused = false, typing = false;
  let rewardDue = false, rewardT0 = 0;   // a signup draws the closed circle once more, in red

  // ---- drawing --------------------------------------------------------------
  const poly = (pts: V[]) => {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
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

  const render = (t: number) => {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = alpha;
    const lineA = phone ? 0.09 : 0.11;
    const n = STAGES[stage];

    // intro: circle, one radius, six equal sides, the outer hexagon, the band
    let introP = 1;
    if (intro) {
      introP = clamp((t - introT0) / 3300);
      if (introP >= 1) intro = false;
    }
    const it = (t - introT0);
    const seg = (a: number, b: number) => (intro ? clamp((it - a) / (b - a)) : 1);

    // dotted / closing circle
    const circleA = seg(0, 600);
    if (closed < 1 && dots) {
      ctx.globalAlpha = alpha * circleA * (1 - closed);
      ctx.drawImage(dots, 0, 0);
    }
    ctx.setTransform(dpr, 0, 0, dpr, offX * dpr, offY * dpr);
    if (closed > 0) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = `rgba(${INK},${lineA * 1.2})`;
      ctx.lineWidth = 1;
      ctx.setLineDash(closed < 1 ? [2 + 18 * closed, 4 * (1 - closed)] : []);
      ctx.beginPath();
      ctx.arc(boxS / 2, boxS / 2, R, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (rewardT0 && t > rewardT0) {
      const p = draw(clamp((t - rewardT0) / 1400));
      const out = clamp((t - rewardT0 - 1600) / 900);
      if (out < 1) {
        ctx.globalAlpha = alpha * (1 - out);
        ctx.strokeStyle = `rgba(${RUBRIC},0.55)`;
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.arc(boxS / 2, boxS / 2, R, -Math.PI / 2, -Math.PI / 2 + TAU * p);
        ctx.stroke();
        ctx.lineWidth = 1;
      } else rewardT0 = 0;
    }

    let prog: ((k: number) => number) | null = null;
    let nn = n;
    if (trans) {
      const el = t - trans.t0;
      const nOld = STAGES[trans.from];
      nn = nOld;
      // sweep from the starting bearing, a few ms per edge
      const per = Math.min(8, 380 / nOld);
      prog = (k: number) => {
        let d = Math.abs(((THETA0 + (TAU * k) / nOld + Math.PI / nOld - trans!.start) % TAU + TAU) % TAU);
        d = Math.min(d, TAU - d) / Math.PI; // 0..1
        return (el - d * nOld * 0.5 * per) / trans!.dur;
      };
    }
    const { inner, outer } = shapes(nn, prog);
    const polyA = 1 - clamp(closed * 1.6 - 0.6); // polygons fade once the circle is solid

    // band between the polygons
    ctx.globalAlpha = alpha * seg(2900, 3300) * polyA;
    ctx.fillStyle = `rgba(${PLATE},${phone ? 0.5 : 0.7})`;
    ctx.beginPath();
    poly(outer);
    poly(inner);
    ctx.fill('evenodd');

    ctx.lineWidth = 1;
    ctx.strokeStyle = `rgba(${INK},${lineA})`;

    // inner polygon (drawn side by side during the intro)
    ctx.globalAlpha = alpha * polyA;
    if (intro) {
      const sides = clamp((it - 1000) / 1000) * inner.length;
      ctx.beginPath();
      ctx.moveTo(inner[0][0], inner[0][1]);
      for (let i = 1; i <= Math.ceil(sides) && i <= inner.length; i++) {
        const a = inner[i - 1], b = inner[i % inner.length];
        const f = Math.min(1, sides - (i - 1));
        ctx.lineTo(lerp(a[0], b[0], f), lerp(a[1], b[1], f));
      }
      ctx.stroke();
      // the radius the first side is measured against
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
      // outer polygon draws as one continuous line
      const o = draw(seg(2000, 2900)) * outer.length;
      if (o > 0) {
        ctx.beginPath();
        ctx.moveTo(outer[0][0], outer[0][1]);
        for (let i = 1; i <= Math.ceil(o) && i <= outer.length; i++) {
          const a = outer[i - 1], b = outer[i % outer.length];
          const f = Math.min(1, o - (i - 1));
          ctx.lineTo(lerp(a[0], b[0], f), lerp(a[1], b[1], f));
        }
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      poly(inner);
      poly(outer);
      ctx.stroke();
    }

    // anticipation: the next bisectors reach outward as a section approaches
    if (anticipShown > 0.01 && stage < STAGES.length - 1 && !trans) {
      ctx.globalAlpha = alpha * Math.min(1, anticipShown * 1.4);
      ctx.strokeStyle = `rgba(${INK},0.08)`;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        const [x, y] = dir(THETA0 + (TAU * k) / n + Math.PI / n);
        const a = P(x, y, 0.6), b = P(x, y, 0.6 + 0.4 * anticipShown);
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(b[0], b[1]);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // attention lamp: the construction of the edge nearest the pointer
    if (lamp.s > 0.01 && !trans && !intro && closed === 0) {
      const k = Math.round(((((lamp.a - THETA0 - Math.PI / n) % TAU) + TAU) % TAU) / (TAU / n)) % n;
      for (let off = -2; off <= 2; off++) {
        const kk = (k + off + n) % n;
        const g = Math.exp(-(off * off) / (2 * 1.5 * 1.5)) * lamp.s;
        if (g < 0.04) continue;
        const a0 = THETA0 + (TAU * kk) / n, a1 = a0 + TAU / n, am = a0 + Math.PI / n;
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = `rgba(${INK},${0.14 * g})`;
        ctx.beginPath();
        for (const a of [a0, a1]) {
          const [x, y] = dir(a);
          const p = P(x, y, 0.55), q = P(x, y, 1.2);
          ctx.moveTo(p[0], p[1]);
          ctx.lineTo(q[0], q[1]);
        }
        // apothem with a right-angle mark at the edge
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
        // dwell: preview the next doubling for this one edge
        if (off === 0 && lamp.preview > 0.01 && stage < STAGES.length - 1) {
          const v0 = P(...dir(a0)), v1 = P(...dir(a1)), top = P(mx, my);
          const f = resolve(lamp.preview);
          const mid = P(mx, my, lerp(ap, 1, f));
          ctx.strokeStyle = `rgba(${INK},${0.1 * lamp.s * Math.min(1, lamp.preview * 2)})`;
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
    intro || !!trans || (closed > 0 && closed < 1) || Math.abs(anticip - anticipShown) > 0.002 ||
    Math.abs(lamp.s - lamp.sTarget) > 0.004 || lamp.sTarget > 0 || (lamp.s > 0.01 && Math.abs(angDiff(lamp.target, lamp.a)) > 0.002) ||
    (lamp.edge >= 0 && lamp.preview < 1 && lamp.sTarget > 0) || (lamp.preview > 0 && lamp.sTarget === 0) ||
    alpha !== fade.to || rewardDue || rewardT0 > 0;

  const angDiff = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

  const frame = (t: number) => {
    raf = 0;
    const dt = Math.min(64, t - last) / 1000;
    last = t;

    // fade in/out (intro skip, phone sections)
    const fd = fade.to === fade.from ? 1 : clamp((t - fade.t0) / 400);
    alpha = lerp(fade.from, fade.to, fd);
    if (fd >= 1) { alpha = fade.to; fade.from = fade.to; }

    // anticipation follows scroll, smoothed (Lenis already smooths the wheel)
    const k = (window as any).__lenis ? 20 : 12;
    anticipShown += (anticip - anticipShown) * (1 - Math.exp(-k * dt));

    // lamp spring and intensity
    lamp.a += angDiff(lamp.target, lamp.a) * (1 - Math.exp(-14 * dt));
    if (finePointer && t - lamp.lastMove > 1200) lamp.sTarget = 0;
    lamp.s += (lamp.sTarget - lamp.s) * (1 - Math.exp(-10 * dt));
    if (lamp.sTarget > 0 && lamp.edge >= 0 && t - lamp.dwellT0 > 600) lamp.preview = Math.min(1, lamp.preview + dt / 0.7);
    else lamp.preview = Math.max(0, lamp.preview - dt / 0.35);

    // stage transition
    if (trans && t - trans.t0 > trans.dur + (trans.dur < 500 ? 220 : 480)) {
      stage = trans.from + 1;
      trans = null;
    }
    if (!trans && stage < target) startTrans(t);
    if (!trans && stage === STAGES.length - 1 && closed === 0 && target >= STAGES.length - 1) closeT0 = t, (closed = 0.0001);
    if (closed > 0 && closed < 1) closed = motion ? clamp((t - closeT0) / 1500, 0.0001, 1) : 1;
    if (rewardDue && closed >= 1) { rewardDue = false; if (motion) rewardT0 = t + 150; }

    render(t);
    if (!paused && busy()) raf = requestAnimationFrame(frame);
  };

  const kick = () => {
    if (paused || raf) return;
    last = now();
    raf = requestAnimationFrame(frame);
  };

  const startTrans = (t: number) => {
    const pending = target - stage;
    const dur = !motion ? 1 : pending > 1 ? 340 : 900;
    trans = { t0: t, dur, from: stage, start: lamp.s > 0.05 ? lamp.a : Math.PI };
    if (!motion) { stage = target; trans = null; }
  };

  // ---- inputs ---------------------------------------------------------------
  const goTo = (s: number) => {
    if (s <= target) return;
    target = Math.min(s, STAGES.length - 1);
    kick();
  };

  // thresholds: section headings crossing 62% of the viewport
  const marks: [string, number][] = [['#how-title', 1], ['#mission-title', 2], ['#faq-title', 3], ['#final-title', 4]];
  const heads = marks.map(([sel, s]) => [document.querySelector<HTMLElement>(sel), s] as const).filter(([el]) => el);
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        // reached: in the top 62% of the viewport, or already scrolled past
        if (!e.isIntersecting && e.boundingClientRect.top > 0) continue;
        const s = heads.find(([el]) => el === e.target)?.[1];
        if (s != null) goTo(s);
      }
    },
    { rootMargin: '0px 0px -38% 0px' },
  );
  heads.forEach(([el]) => io.observe(el!));

  // anticipation: progress over the ~38vh before the next heading crosses the line
  let tops: number[] = [];
  const measure = () => {
    tops = heads.map(([el]) => el!.getBoundingClientRect().top + window.scrollY);
  };
  const onScroll = () => {
    if (!motion || stage >= STAGES.length - 1) return;
    const next = target + 1;
    const i = heads.findIndex(([, s]) => s === next);
    if (i < 0) return;
    const line = window.scrollY + vh * 0.62;
    const p = clamp(1 - (tops[i] - line) / (vh * 0.38));
    if (p !== anticip) { anticip = p >= 1 ? 0 : p; kick(); }
  };

  // pointer lamp (fine pointers only); never over controls or the demo
  const CONTROLS = 'a, button, input, label, summary, select, textarea, [data-demo], .signup, dialog';
  if (motion && finePointer) {
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const x = e.clientX - (boxX + boxS / 2);
      const y = -(e.clientY - (boxY + boxS / 2));
      const d = Math.hypot(x, y) / R;
      const over = (e.target as Element).closest?.(CONTROLS);
      const near = d < 0.6 ? 0 : d < 1 ? (d - 0.6) / 0.4 : d < 1.4 ? 1 - (d - 1) / 0.4 : 0;
      lamp.sTarget = over || typing || closed > 0 ? 0 : near;
      lamp.target = Math.atan2(y, x);
      lamp.lastMove = now();
      const n = STAGES[stage];
      const edge = Math.round(((((lamp.target - THETA0 - Math.PI / n) % TAU) + TAU) % TAU) / (TAU / n)) % n;
      if (edge !== lamp.edge) { lamp.edge = edge; lamp.dwellT0 = now(); }
      if (lamp.sTarget > 0 || lamp.s > 0.01) kick();
    }, { passive: true });
    document.addEventListener('pointerleave', () => { lamp.sTarget = 0; kick(); });
  }
  document.addEventListener('focusin', (e) => {
    if ((e.target as Element).matches?.('input[type="email"]')) { typing = true; lamp.sTarget = 0; kick(); }
  });
  document.addEventListener('focusout', (e) => {
    if ((e.target as Element).matches?.('input[type="email"]')) typing = false;
  });

  // a signup anywhere completes the construction (after any dialog closes)
  let rewarded = false;
  const finish = () => {
    if (rewarded) return;
    rewarded = rewardDue = true;
    target = STAGES.length - 1;
    store.set(STORE, 'closed');
    kick();
  };
  let dialogOpen = false;
  window.addEventListener('aig:lock', () => (dialogOpen = true));
  window.addEventListener('aig:unlock', () => {
    dialogOpen = false;
    if (pendingFinish) { pendingFinish = false; finish(); }
  });
  let pendingFinish = false;
  new MutationObserver(() => {
    if (rewarded || !document.querySelector('[data-signup-box][data-state="done"]')) return;
    if (dialogOpen) pendingFinish = true;
    else finish();
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-state'] });

  // visibility: pause under the demo plate; on phones show only at the hero and the end
  const plate = document.querySelector<HTMLElement>('.plate');
  const hero = document.querySelector<HTMLElement>('.hero');
  const final = document.querySelector<HTMLElement>('.final');
  const shown = { plate: false, hero: true, final: false };
  const setVisible = () => {
    const v = !shown.plate && (!phone || shown.hero || shown.final);
    canvas.classList.toggle('is-hidden', !v);
    const wasPaused = paused;
    paused = !v || document.hidden;
    if (wasPaused && !paused) kick();
  };
  const cover = new IntersectionObserver(
    ([e]) => {
      // the plate is opaque; pause once it leaves almost nothing of the drawing
      shown.plate = e.intersectionRect.height >= window.innerHeight * 0.85;
      setVisible();
    },
    { threshold: Array.from({ length: 21 }, (_, i) => i / 20) },
  );
  if (plate) cover.observe(plate);
  const sect = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.target === hero) shown.hero = e.isIntersecting;
      if (e.target === final) shown.final = e.isIntersecting;
    }
    setVisible();
  });
  if (hero) sect.observe(hero);
  if (final) sect.observe(final);
  document.addEventListener('visibilitychange', setVisible);

  // ---- start ------------------------------------------------------------------
  let resizeT = 0;
  let lastW = 0;
  const onResize = () => {
    clearTimeout(resizeT);
    resizeT = window.setTimeout(() => {
      const w = document.documentElement.clientWidth;
      const h = window.innerHeight;
      if (w === lastW && Math.abs(h - maxVh) / maxVh < 0.15) return; // mobile toolbars
      lastW = w;
      layout();
      measure();
      render(now());
    }, 150);
  };
  layout();
  lastW = vw;
  measure();
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', onScroll, { passive: true });
  new ResizeObserver(() => measure()).observe(document.body);

  if (store.get(STORE) === 'closed' || document.querySelector('[data-signup-box][data-state="done"]')) {
    stage = target = STAGES.length - 1;
    closed = 1;
    rewarded = true;
  }
  const late = now() > 2200;
  if (motion && !late && !store.get('aig:intro') && closed === 0) {
    store.set('aig:intro', '1');
    intro = true;
    introT0 = now() + 100;
  } else if (motion) {
    fade = { t0: now(), from: 0, to: 1 };
    alpha = 0;
  }
  requestAnimationFrame(() => requestAnimationFrame(() => canvas.classList.add('is-ready')));
  setVisible();
  kick();
  render(now());
}
