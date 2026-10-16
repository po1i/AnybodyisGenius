// Floating "Join early access" pill and its dialog. The two inline forms stay
// the primary path; the pill only appears once the hero form has scrolled
// away, hides near the final form, and never shows after a signup.

const pill = document.querySelector<HTMLButtonElement>('[data-pill]');
const dialog = document.querySelector<HTMLDialogElement>('[data-join]');

if (pill && dialog && typeof dialog.showModal === 'function') {
  const panel = dialog.querySelector<HTMLElement>('[data-join-panel]')!;
  const closeBtn = dialog.querySelector<HTMLButtonElement>('[data-join-close]')!;
  const grab = dialog.querySelector<HTMLElement>('[data-join-grab]')!;
  const heroBox = document.querySelector('#email-top')?.closest('[data-signup-box]');
  const finalBox = document.querySelector('#email-bottom')?.closest('[data-signup-box]');
  const motion = () => document.documentElement.classList.contains('motion');
  const canMorph = () => motion() && 'startViewTransition' in document;
  const isPhone = () => window.matchMedia('(max-width: 639px)').matches;

  pill.hidden = false;

  // ---- when the pill shows -------------------------------------------------
  let pastHero = false;
  let nearFinal = false;
  const done = () => document.querySelector('[data-signup-box][data-state="done"]') !== null;
  const update = () => {
    const show = pastHero && !nearFinal && !done() && !dialog.open;
    pill.classList.toggle('is-shown', show);
    pill.tabIndex = show ? 0 : -1;
    pill.setAttribute('aria-hidden', String(!show));
  };
  if ('IntersectionObserver' in window) {
    if (heroBox)
      new IntersectionObserver(([e]) => {
        pastHero = !e.isIntersecting && e.boundingClientRect.top < 0;
        update();
      }).observe(heroBox);
    if (finalBox)
      new IntersectionObserver(([e]) => {
        nearFinal = e.isIntersecting;
        update();
      }, { rootMargin: '0px 0px 15% 0px' }).observe(finalBox);
  }
  // a signup anywhere retires the pill
  new MutationObserver(update).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['data-state'] });
  update();

  // ---- open / close ----------------------------------------------------------
  const lock = (on: boolean) => {
    document.documentElement.classList.toggle('is-locked', on);
    window.dispatchEvent(new CustomEvent(on ? 'aig:lock' : 'aig:unlock'));
  };

  const open = () => {
    if (dialog.open) return;
    lock(true);
    const morph = canMorph() && pill.classList.contains('is-shown');
    if (!morph) {
      dialog.showModal();
      update();
      return;
    }
    dialog.classList.add('vt-morph');
    document.documentElement.classList.add('vt-join');
    pill.style.viewTransitionName = 'join';
    const vt = (document as any).startViewTransition(() => {
      pill.style.viewTransitionName = '';
      panel.style.viewTransitionName = 'join';
      dialog.showModal();
      update();
    });
    vt.finished.finally(() => {
      panel.style.viewTransitionName = '';
      dialog.classList.remove('vt-morph');
      document.documentElement.classList.remove('vt-join');
    });
  };

  const close = (how: 'morph' | 'slide' | 'plain' = 'morph') => {
    if (!dialog.open) return;
    const finish = () => {
      lock(false);
      update();
      if (pill.classList.contains('is-shown')) pill.focus({ preventScroll: true });
    };
    const pillWillShow = pastHero && !nearFinal && !done();
    if (how === 'morph' && canMorph() && pillWillShow && !isPhone()) {
      dialog.classList.add('vt-morph');
      document.documentElement.classList.add('vt-join');
      panel.style.viewTransitionName = 'join';
      const vt = (document as any).startViewTransition(() => {
        panel.style.viewTransitionName = '';
        dialog.close();
        pill.style.viewTransitionName = 'join';
        pill.classList.add('is-shown');
      });
      vt.finished.finally(() => {
        pill.style.viewTransitionName = '';
        dialog.classList.remove('vt-morph');
        document.documentElement.classList.remove('vt-join');
        finish();
      });
      return;
    }
    animateOut().then(finish);
  };

  // Script-driven exit: CSS exit transitions for dialogs aren't consistent
  // across browsers yet, so fade or slide the panel and backdrop here.
  const animateOut = async () => {
    if (!motion()) {
      dialog.close();
      return;
    }
    dialog.classList.add('vt-morph');
    const from = getComputedStyle(dialog).transform;
    const ease = 'cubic-bezier(0.4, 0, 1, 1)';
    const anims = [
      isPhone()
        ? dialog.animate([{ transform: from === 'none' ? 'translateY(0)' : from }, { transform: 'translateY(100%)' }], { duration: 300, easing: ease, fill: 'forwards' })
        : dialog.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(10px) scale(0.985)' }], { duration: 220, easing: ease, fill: 'forwards' }),
      dialog.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, easing: 'linear', fill: 'forwards', pseudoElement: '::backdrop' }),
    ];
    await Promise.allSettled(anims.map((a) => a.finished));
    dialog.style.transform = '';
    dialog.close();
    anims.forEach((a) => a.cancel());
    dialog.classList.remove('vt-morph');
  };

  pill.addEventListener('click', open);
  document.querySelectorAll<HTMLElement>('[data-open-join]').forEach((b) => b.addEventListener('click', open));
  closeBtn.addEventListener('click', () => close());
  // Escape: let the dialog close the normal way, then tidy up
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close('plain');
  });
  // click on the backdrop (the dialog box itself, outside the panel)
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close('plain');
  });
  // while the opening morph runs, the browser sends clicks to <html>; one that
  // lands outside the panel is still a backdrop click
  document.addEventListener('click', (e) => {
    if (!dialog.open || e.target !== document.documentElement) return;
    const r = panel.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close('plain');
  });
  dialog.addEventListener('close', () => {
    if (document.documentElement.classList.contains('is-locked')) {
      lock(false);
      update();
    }
  });

  // ---- phone sheet: drag the handle down to dismiss --------------------------
  let drag: { id: number; y0: number; t0: number; dy: number } | null = null;
  const sheet = dialog;
  const onMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag.dy = Math.max(0, e.clientY - drag.y0);
    sheet.style.transform = `translateY(${drag.dy}px)`;
  };
  const onUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { dy, t0 } = drag;
    drag = null;
    const speed = dy / Math.max(1, performance.now() - t0);
    sheet.style.transition = '';
    if (dy > panel.offsetHeight * 0.28 || speed > 0.6) {
      close('slide'); // slides on from where the finger left it
    } else {
      sheet.style.transform = '';
    }
  };
  grab.addEventListener('pointerdown', (e) => {
    if (!isPhone()) return;
    drag = { id: e.pointerId, y0: e.clientY, t0: performance.now(), dy: 0 };
    grab.setPointerCapture(e.pointerId);
    sheet.style.transition = 'none';
  });
  grab.addEventListener('pointermove', onMove);
  grab.addEventListener('pointerup', onUp);
  grab.addEventListener('pointercancel', onUp);
}
