// Fig. 2: "what you know" and the band just past it. Draws once on view, then
// (with motion allowed) the edge eases forward as if learning. Visitors can
// drag it with a pointer or use the arrow keys on the slider.
const fig = document.querySelector<HTMLElement>('[data-fig2]');

if (fig) {
  const wrap = fig.querySelector<HTMLElement>('.f2-wrap')!;
  const svg = fig.querySelector<SVGSVGElement>('[data-f2-svg]')!;
  const known = fig.querySelector<SVGPathElement>('[data-f2-known]')!;
  const band = fig.querySelector<SVGGElement>('[data-f2-band]')!;
  const dotted = band.querySelector<SVGPathElement>('.dotted')!;
  const knob = fig.querySelector<SVGCircleElement>('[data-f2-knob]')!;
  const range = fig.querySelector<HTMLInputElement>('[data-f2-range]')!;
  const motion = document.documentElement.classList.contains('motion');
  const MIN = Number(range.min), MAX = Number(range.max);
  const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
  const xOf = (v: number) => 8 + v * 2.6;

  let touched = false;
  let raf = 0;

  const render = (v: number) => {
    const x = xOf(v);
    known.setAttribute('d', `M8 62 H${x.toFixed(1)}`);
    band.style.transform = `translateX(${x.toFixed(1)}px)`;
    dotted.setAttribute('d', `M58 62 H${Math.max(60, 272 - x).toFixed(1)}`);
    knob.setAttribute('cx', x.toFixed(1));
  };
  const set = (v: number) => {
    v = clamp(Math.round(v), MIN, MAX);
    range.value = String(v);
    range.setAttribute('aria-valuetext', `${v} percent`);
    render(v);
  };
  set(Number(range.value));

  // keyboard (and assistive tech) through the native slider
  range.style.pointerEvents = 'none';
  range.addEventListener('input', () => {
    touched = true;
    cancelAnimationFrame(raf);
    render(Number(range.value));
  });

  // pointer: the knob follows the finger exactly
  const fromPointer = (clientX: number) => {
    const r = svg.getBoundingClientRect();
    const vbX = ((clientX - r.left) / r.width) * 280;
    return (vbX - 8) / 2.6;
  };
  let drag: { id: number; x0: number; y0: number; active: boolean } | null = null;
  wrap.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, active: e.pointerType === 'mouse' };
    if (drag.active) {
      touched = true;
      cancelAnimationFrame(raf);
      wrap.setPointerCapture(e.pointerId);
      set(fromPointer(e.clientX));
    }
  });
  wrap.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.active) {
      const dx = Math.abs(e.clientX - drag.x0), dy = Math.abs(e.clientY - drag.y0);
      if (dx < 6 && dy < 6) return;
      if (dy >= dx) { drag = null; return; }
      drag.active = true;
      touched = true;
      cancelAnimationFrame(raf);
      wrap.setPointerCapture(e.pointerId);
    }
    set(fromPointer(e.clientX));
  });
  const stop = () => (drag = null);
  wrap.addEventListener('pointerup', (e) => {
    // a tap (no drag) on touch still moves the edge to where it landed
    if (drag && !drag.active && e.pointerType !== 'mouse') {
      touched = true;
      cancelAnimationFrame(raf);
      set(fromPointer(e.clientX));
    }
    stop();
  });
  wrap.addEventListener('pointercancel', stop);

  // the edge moves as you learn: one slow advance when the figure arrives
  const advance = () => {
    if (!motion || touched) return;
    const from = Number(range.value), to = 62, dur = 6500;
    const t0 = performance.now();
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now: number) => {
      if (touched) return;
      const t = Math.min(1, (now - t0) / dur);
      set(from + (to - from) * ease(t));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };

  const draw = () => fig.classList.add('is-drawn');
  if (!('IntersectionObserver' in window)) draw();
  else {
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        draw();
        window.setTimeout(advance, 1600);
      },
      { threshold: 0.5 },
    );
    io.observe(fig);
  }
}
