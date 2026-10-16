// Smooth wheel and trackpad scrolling (Lenis). Loaded only when motion is
// allowed, after first paint. Touch stays native. In-page links glide, then
// move keyboard focus to their target. Paused while a dialog is open.
const root = document.documentElement;

if (root.classList.contains('motion')) {
  import('lenis').then(({ default: Lenis }) => {
    const lenis = new Lenis({ autoRaf: true, lerp: 0.085, stopInertiaOnNavigate: true });
    (window as any).__lenis = lenis;

    window.addEventListener('aig:lock', () => lenis.stop());
    window.addEventListener('aig:unlock', () => lenis.start());

    document.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
      if (!a) return;
      const id = decodeURIComponent(a.hash.slice(1));
      const target = id ? document.getElementById(id) : null;
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, {
        offset: -24,
        duration: 1.2,
        easing: (t: number) => 1 - Math.pow(1 - t, 4),
        onComplete: () => {
          if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
          target.focus({ preventScroll: true });
        },
      });
      history.pushState(null, '', `#${id}`);
    });
  });
}

export {};
