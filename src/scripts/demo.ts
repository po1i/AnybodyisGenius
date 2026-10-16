// Progressive enhancement for Fig. 1. Level switching already works without
// this file (native radios + CSS :has). This adds drag, number keys,
// Home/End, replay after drag, a one-time nudge, and keeps the figure from
// animating while off-screen. Focus always lands on the selected radio, so
// screen readers announce the level without a separate live region.

const demo = document.querySelector<HTMLElement>('[data-demo]');

if (demo) {
  const radios = Array.from(demo.querySelectorAll<HTMLInputElement>('input[name="level"]'));
  const scale = demo.querySelector<HTMLElement>('[data-scale]')!;
  const track = demo.querySelector<HTMLElement>('.scale-inner')!;
  const rail = demo.querySelector<HTMLElement>('[data-rail]')!;
  const carriage = demo.querySelector<HTMLElement>('[data-carriage]')!;
  const fig = demo.querySelector<HTMLElement>('[data-fig]')!;
  const layers = Array.from(demo.querySelectorAll<SVGGElement>('[data-layer]'));
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const total = radios.length;
  const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

  let current = Number(radios.find((r) => r.checked)?.value ?? 1);
  let touched = false;

  const markCurrent = () => {
    layers.forEach((g) => g.toggleAttribute('data-current', Number(g.dataset.layer) === current));
  };

  const select = (n: number, opts: { focus?: boolean } = {}) => {
    n = clamp(n, 1, total);
    const r = radios[n - 1];
    if (!r.checked) r.checked = true;
    if (opts.focus) r.focus({ preventScroll: true });
    if (n === current) return;
    current = n;
    demo.dataset.lvl = String(n);
    markCurrent();
  };

  demo.dataset.lvl = String(current);
  markCurrent();

  radios.forEach((r) =>
    r.addEventListener('change', () => {
      touched = true;
      select(Number(r.value));
    }),
  );

  // Number keys jump straight to a level; Home and End go to the ends.
  scale.addEventListener('keydown', (e) => {
    let n = 0;
    if (/^[1-9]$/.test(e.key)) n = Number(e.key);
    else if (e.key === 'Home') n = 1;
    else if (e.key === 'End') n = total;
    if (!n || n > total) return;
    e.preventDefault();
    touched = true;
    select(n, { focus: true });
  });

  // Drag: the ribbon follows the pointer 1:1 and readings swap instantly at
  // each midpoint. On release the ribbon snaps and the reading resolves once.
  // A mostly vertical gesture is left to the page so phones can still scroll.
  type Drag = { id: number; type: string; x0: number; y0: number; start: number; active: boolean; width: number; left: number };
  let drag: Drag | null = null;
  let suppressClick = false;

  const reset = () => {
    drag = null;
    demo.classList.remove('is-dragging');
    carriage.style.transform = '';
  };

  track.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    suppressClick = false;
    const r = rail.getBoundingClientRect();
    drag = { id: e.pointerId, type: e.pointerType, x0: e.clientX, y0: e.clientY, start: current, active: false, width: r.width, left: r.left };
  });

  track.addEventListener('dragstart', (e) => e.preventDefault());

  track.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (e.pointerType === 'mouse' && e.buttons === 0) return reset();
    if (!drag.active) {
      const dx = Math.abs(e.clientX - drag.x0);
      const dy = Math.abs(e.clientY - drag.y0);
      if (dx < 8 && dy < 8) return;
      if (dy >= dx) return reset();
      drag.active = true;
      touched = true;
      track.setPointerCapture(e.pointerId);
      demo.classList.add('is-dragging');
    }
    const f = clamp((e.clientX - drag.left) / drag.width, 0, 0.9999);
    const lo = 0.5 / total;
    carriage.style.transform = `translateX(${(clamp(f, lo, 1 - lo) - lo) * drag.width}px)`;
    select(Math.floor(f * total) + 1);
  });

  const endDrag = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag;
    reset();
    if (!d.active) return;
    if (e.type === 'pointercancel') {
      select(d.start);
      return;
    }
    // A mouse release over a label fires a click; don't let it re-select.
    suppressClick = d.type === 'mouse';
    window.setTimeout(() => (suppressClick = false), 0);
    radios[current - 1].focus({ preventScroll: true });
    if (!reduce.matches) {
      demo.classList.add('replay');
      void demo.offsetWidth;
      demo.classList.remove('replay');
    }
  };
  track.addEventListener('pointerup', endDrag);
  track.addEventListener('pointercancel', endDrag);
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);

  scale.addEventListener(
    'click',
    (e) => {
      if (!suppressClick) return;
      e.preventDefault();
      suppressClick = false;
    },
    true,
  );

  // "Play all five": walks the levels at reading pace. Any interaction stops it.
  const tourBtn = demo.querySelector<HTMLButtonElement>('[data-tour]');
  const tourLabel = demo.querySelector<HTMLElement>('[data-tour-label]');
  const tourBar = demo.querySelector<HTMLElement>('[data-tour-bar]');
  if (tourBtn && tourLabel && tourBar) {
    tourBtn.hidden = false;
    let timer = 0;
    let anim: Animation | null = null;
    const words = (n: number) =>
      (demo.querySelector(`.reading[data-level="${n}"] .reading-text`)?.textContent ?? '').split(/\s+/).length;
    const dwell = (n: number) => Math.min(11000, Math.max(5000, words(n) * 95));

    const stopTour = (label = 'Play all five') => {
      window.clearTimeout(timer);
      anim?.cancel();
      anim = null;
      demo.classList.remove('is-touring');
      tourBtn.setAttribute('aria-pressed', 'false');
      tourLabel.textContent = label;
    };
    const runFrom = (n: number) => {
      select(n);
      const ms = dwell(n);
      anim?.cancel();
      anim = tourBar.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: ms, easing: 'linear', fill: 'forwards' });
      timer = window.setTimeout(() => {
        if (n >= total) stopTour('Play again');
        else runFrom(n + 1);
      }, ms);
    };
    tourBtn.addEventListener('click', () => {
      if (tourBtn.getAttribute('aria-pressed') === 'true') return stopTour('Resume');
      const resuming = tourLabel.textContent === 'Resume';
      touched = true;
      demo.classList.add('is-touring');
      tourBtn.setAttribute('aria-pressed', 'true');
      tourLabel.textContent = 'Pause';
      // from the start after finishing, otherwise from the level on screen
      runFrom(current >= total && !resuming ? 1 : current);
    });
    // the visitor takes over: stop
    track.addEventListener('pointerdown', () => demo.classList.contains('is-touring') && stopTour());
    scale.addEventListener('keydown', (e) => {
      if (e.target === tourBtn) return;
      if (demo.classList.contains('is-touring')) stopTour();
    });
    radios.forEach((r) => r.addEventListener('change', () => demo.classList.contains('is-touring') && stopTour()));
    document.addEventListener('visibilitychange', () => document.hidden && demo.classList.contains('is-touring') && stopTour('Resume'));
  }

  // Never play the figure's drawing while it is off-screen.
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(
      ([entry]) => fig.classList.toggle('fig-offscreen', !entry.isIntersecting),
      { threshold: 0.35 },
    ).observe(fig);

    // One quiet hint that the ribbon moves, only if nobody has touched it.
    const nudgeIO = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        nudgeIO.disconnect();
        if (reduce.matches) return;
        window.setTimeout(() => {
          if (touched) return;
          demo.classList.add('nudge');
          window.setTimeout(() => demo.classList.remove('nudge'), 1000);
        }, 800);
      },
      { threshold: 0.5 },
    );
    nudgeIO.observe(scale);
  }
}
