// "One stage" scrolling. Each section is a sheet of paper: it pins in place,
// and the next one slides up over it while it settles back and dims. When a
// wheel or trackpad scroll stops close to the next section, the page glides
// the rest of the way. Scrolling itself is never taken over: touch, keyboard
// and scrollbar work as usual, and reduced motion gets the plain page.
//
// Sticky sheets keep their place in the layout, so anything that needs a real
// scroll position (in-page links, deep links, keyboard focus) asks layoutTop()
// or viewTop() here instead of getBoundingClientRect(), which reports where a
// pinned sheet is drawn, not where it sits in the document.

const root = document.documentElement;
const sheets = Array.from(document.querySelectorAll<HTMLElement>('[data-sheet]'));
const enabled = root.classList.contains('motion') && sheets.length > 1;

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const anchorOf = (sheet: HTMLElement) => sheet.previousElementSibling as HTMLElement;
const startOf = (sheet: HTMLElement) => anchorOf(sheet).getBoundingClientRect().top + window.scrollY;
let vh = window.innerHeight;

/** Where an element sits in the document, even inside a pinned sheet. */
export function layoutTop(el: HTMLElement): number {
  const sheet = el.closest<HTMLElement>('[data-sheet]');
  if (!enabled || !sheet) return el.getBoundingClientRect().top + window.scrollY;
  let y = 0;
  let n: HTMLElement | null = el;
  while (n && n !== sheet) {
    y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  if (n !== sheet) return el.getBoundingClientRect().top + window.scrollY;
  return startOf(sheet) + y;
}

/** A scroll position that shows the element, clear of the sheet that comes after it. */
export function viewTop(el: HTMLElement, pad = 24): number {
  const y = layoutTop(el) - pad;
  const sheet = el.closest<HTMLElement>('[data-sheet]');
  const i = enabled && sheet ? sheets.indexOf(sheet) : -1;
  if (i < 0 || i === sheets.length - 1) return Math.max(0, y);
  // a pinned sheet doesn't move; the one after it has to be kept off the screen
  return Math.max(0, Math.min(y, startOf(sheets[i + 1]) - vh));
}

/** The scroll position where a section's scene begins (for its heading). */
export function sceneTop(el: HTMLElement): number | null {
  const sheet = el.closest<HTMLElement>('[data-sheet]');
  if (!enabled || !sheet) return null;
  const heading = document.getElementById(sheet.getAttribute('aria-labelledby') ?? '');
  if (heading !== el && !heading?.contains(el) && el !== sheet) return null;
  return sheets.indexOf(sheet) === 0 ? 0 : startOf(sheet);
}

const jump = (y: number) => {
  const lenis = (window as any).__lenis;
  if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
  else window.scrollTo(0, y);
};

if (enabled) {
  // a static, zero-height marker before each sheet records where it starts
  for (const s of sheets) {
    const a = document.createElement('div');
    a.className = 'sheet-anchor';
    a.setAttribute('aria-hidden', 'true');
    s.before(a);
  }
  const make = (cls: string, s: HTMLElement) => {
    const d = document.createElement('div');
    d.className = cls;
    d.setAttribute('aria-hidden', 'true');
    s.append(d);
    return d;
  };
  // the shade that dims a sheet as the next one covers it, and the shadow
  // along the top edge of the sheet doing the covering
  const shades = sheets.slice(0, -1).map((s) => make('sheet-shade', s));
  const edges = sheets.slice(1).map((s) => make('sheet-edge', s));
  root.classList.add('sheets');

  // ---- layout ---------------------------------------------------------------
  const heights = new Map<HTMLElement, number>();
  const height = (s: HTMLElement) => heights.get(s) ?? s.offsetHeight;
  const stuckTop = (s: HTMLElement) => Math.min(0, vh - height(s));
  const cover = new Array<number>(sheets.length).fill(0);

  let roW = window.innerWidth, roH = window.innerHeight;
  const ro = new ResizeObserver((entries) => {
    const sameViewport = window.innerWidth === roW && window.innerHeight === roH;
    roW = window.innerWidth;
    roH = window.innerHeight;
    for (const e of entries) {
      const s = e.target as HTMLElement;
      const h = e.borderBoxSize?.[0]?.blockSize ?? s.offsetHeight;
      const prev = heights.get(s);
      const i = sheets.indexOf(s);
      // a pinned sheet on screen grew (Fig. 1 at level 5, or its tour): keep it
      // drawn where it was, so the controls stay put and it grows downward
      if (sameViewport && prev !== undefined && h > prev && i < sheets.length - 1 && cover[i] < 0.999) {
        const was = Math.min(0, vh - prev);
        const natural = anchorOf(s).getBoundingClientRect().top;
        if (natural < was - 1) jump(window.scrollY - (was - natural));
      }
      heights.set(s, h);
      s.style.setProperty('--h', `${h}px`);
    }
    origins();
    schedule();
  });
  sheets.forEach((s) => ro.observe(s));
  // settle back around the middle of what is on screen while the sheet is pinned
  const origins = () => {
    for (const s of sheets) s.style.transformOrigin = `50% ${Math.round(vh / 2 - stuckTop(s))}px`;
  };
  window.addEventListener('resize', () => {
    vh = window.innerHeight;
    origins();
    schedule();
  });

  // ---- per frame: how much of each sheet the next one covers ---------------
  const covered = new Set<string>();
  let current = -1;
  const nav = document.querySelector<HTMLElement>('[data-scenes]');
  const navLinks = nav ? Array.from(nav.querySelectorAll<HTMLAnchorElement>('a')) : [];

  const update = () => {
    raf = 0;
    // reads first: where each sheet starts, untouched by the transforms below
    const anchors = sheets.map((s) => anchorOf(s).getBoundingClientRect().top);
    // then writes
    let changed = false;
    for (let i = 0; i < sheets.length - 1; i++) {
      const s = sheets[i];
      const next = sheets[i + 1];
      const last = i + 1 === sheets.length - 1; // the final sheet doesn't pin
      const nextTop = last ? anchors[i + 1] : Math.max(anchors[i + 1], stuckTop(next));
      // measured against the part of this sheet that is on screen once it pins
      const open = Math.min(vh, height(s));
      const c = clamp((open - nextTop) / open);
      if (Math.abs(c - cover[i]) < 0.001) continue;
      cover[i] = c;
      const moving = c > 0.001 && c < 0.999;
      s.style.transform = c > 0.001 ? `scale(${(1 - 0.045 * c).toFixed(4)})` : '';
      s.style.willChange = moving ? 'transform' : '';
      s.style.opacity = c >= 0.999 ? '0' : ''; // fully under the next sheet: nothing to draw
      shades[i].style.opacity = (0.14 * c).toFixed(3);
      edges[i].style.opacity = moving ? Math.min(1, c * 6).toFixed(3) : '0';
      const full = c >= 0.999;
      const id = s.dataset.sheet || String(i);
      if (full !== covered.has(id)) {
        changed = true;
        if (full) { covered.add(id); s.dataset.covered = ''; } else { covered.delete(id); delete s.dataset.covered; }
      }
    }
    if (changed) window.dispatchEvent(new CustomEvent('aig:sheets', { detail: { covered: [...covered] } }));

    // the current scene: the last one whose start has passed the upper part of the screen
    let cur = 0;
    anchors.forEach((t, i) => { if (t <= vh * 0.45) cur = i; });
    if (cur !== current) {
      current = cur;
      navLinks.forEach((a, i) => (i === cur ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current')));
      nav?.classList.toggle('is-on', cur > 0);
    }
  };
  let raf = 0;
  const schedule = () => { if (!raf) raf = requestAnimationFrame(update); };
  window.addEventListener('scroll', schedule, { passive: true });
  if (nav) nav.hidden = false;
  schedule();

  // ---- keyboard focus never lands on something covered or off screen ---------
  // Checked a frame later, after the browser's own scroll-into-view, on live rects.
  document.addEventListener('focusin', (e) => requestAnimationFrame(() => {
    const t = e.target as HTMLElement;
    if (document.activeElement !== t || !t.matches(':focus-visible')) return; // keyboard focus only
    const s = t.closest<HTMLElement>('[data-sheet]');
    const i = s ? sheets.indexOf(s) : -1;
    if (i < 0 || i === sheets.length - 1) return;
    const r = t.getBoundingClientRect();
    if (r.top >= 0 && r.bottom <= sheets[i + 1].getBoundingClientRect().top) return;
    jump(viewTop(t, vh * 0.3));
  }));

  // ---- deep links and Back/Forward --------------------------------------------
  // The browser's fragment scroll (re-applied while loading) reads the drawn
  // position of pinned sheets and overshoots, so position these ourselves.
  const toHash = () => {
    const id = decodeURIComponent(location.hash.slice(1));
    const t = id ? document.getElementById(id) : null;
    if (!t) return;
    jump(sceneTop(t) ?? viewTop(t));
  };
  // a reload or a return from another page already restores where the visitor was
  const navType = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type;
  if (location.hash && navType !== 'reload' && navType !== 'back_forward') {
    if (document.readyState === 'complete') requestAnimationFrame(toHash);
    else window.addEventListener('load', () => requestAnimationFrame(toHash), { once: true });
  }
  window.addEventListener('popstate', () => requestAnimationFrame(toHash));

  // ---- settle: finish the glide into a nearby section -----------------------
  const AHEAD = 0.3;   // of the viewport: glide on into the section you were heading for
  const BEHIND = 0.08; // or settle back if this gesture carried you just past a start
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const typing = () => (document.activeElement as HTMLElement | null)?.matches?.('input, textarea, select, [contenteditable]') ?? false;

  const attach = (lenis: any) => {
    if (!fine) return;
    let dir = 0;
    let timer = 0;
    let from: number | null = null; // where the current wheel/trackpad gesture began
    const stops = () => sheets.map((s, i) => (i === 0 ? 0 : startOf(s)));
    const settle = () => {
      const start = from ?? (lenis.targetScroll as number);
      from = null;
      if (lenis.isStopped || typing() || document.hidden || !dir) return;
      const dest = lenis.targetScroll as number;
      const max = (lenis.limit as number) ?? Infinity;
      const list = stops().filter((v) => v <= max + 1);
      const next = list.find((v) => v > dest + 1);
      const prev = [...list].reverse().find((v) => v <= dest + 1);
      const ahead = dir > 0 ? next : prev;
      const behind = dir > 0 ? prev : next;
      let target: number | undefined;
      if (ahead !== undefined && Math.abs(ahead - dest) <= vh * AHEAD) target = ahead;
      // settle back only if this gesture crossed the stop, so slow reading scrolls stay put
      else if (behind !== undefined && Math.abs(behind - dest) <= vh * BEHIND && dir * (behind - start) > 1) target = behind;
      if (target === undefined || Math.abs(target - dest) < 2) return;
      lenis.scrollTo(target, { lerp: 0.07, userData: { initiator: 'settle' } });
    };
    lenis.on('virtual-scroll', ({ deltaY, event }: { deltaY: number; event: Event }) => {
      clearTimeout(timer);
      if (event.type.startsWith('touch')) { dir = 0; from = null; return; }
      if ((event as WheelEvent).ctrlKey || !deltaY) return; // pinch-zoom, sideways swipes
      dir = Math.sign(deltaY);
      if (from === null) from = lenis.targetScroll; // emitted before Lenis adds this delta
      timer = window.setTimeout(settle, 150);
    });
  };
  if ((window as any).__lenis) attach((window as any).__lenis);
  else window.addEventListener('aig:lenis', () => attach((window as any).__lenis), { once: true });
}
