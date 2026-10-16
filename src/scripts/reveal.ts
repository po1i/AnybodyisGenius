// Gentle reveals for headings, steps, FAQ entries and figures. Anything already
// on screen at load is left alone, so the first frame is always complete.
const root = document.documentElement;

if (root.classList.contains('motion') && 'IntersectionObserver' in window) {
  const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
  const fold = window.innerHeight;
  const pending = els.filter((el) => el.getBoundingClientRect().top > fold * 0.92);

  // stagger siblings that share a [data-reveal-group]
  const groups = new Map<Element, number>();
  for (const el of pending) {
    const g = el.closest('[data-reveal-group]');
    if (g) {
      const n = groups.get(g) ?? 0;
      el.style.setProperty('--rv-i', String(n));
      groups.set(g, n + 1);
    }
    el.classList.add('rv-pending');
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        el.classList.add('rv-in');
        el.classList.remove('rv-pending');
        io.unobserve(el);
        el.addEventListener('transitionend', () => el.classList.remove('rv-in'), { once: true });
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
  );
  pending.forEach((el) => io.observe(el));

  // never leave anything hidden in print
  window.addEventListener('beforeprint', () => pending.forEach((el) => el.classList.remove('rv-pending')));
}

export {};
