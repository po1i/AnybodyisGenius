// "Share with a friend" after a signup: the system share sheet where there is
// one, otherwise copy the link. Hidden where neither works.
const url = new URL(import.meta.env.BASE_URL, location.origin).href;
const canShare = typeof navigator.share === 'function';
const canCopy = typeof navigator.clipboard?.writeText === 'function';

if (canShare || canCopy) {
  for (const box of document.querySelectorAll<HTMLElement>('[data-share]')) {
    box.hidden = false;
    const btn = box.querySelector<HTMLButtonElement>('[data-share-btn]')!;
    const msg = box.querySelector<HTMLElement>('[data-share-msg]')!;
    let clear = 0;
    const say = (text: string, keep = false) => {
      msg.textContent = text;
      clearTimeout(clear);
      if (!keep) clear = window.setTimeout(() => (msg.textContent = ''), 5000);
    };
    const manual = () => say(`Copy this link: ${url}`, true);
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(url);
        say('Link copied. Paste it anywhere.');
      } catch {
        manual();
      }
    };
    btn.addEventListener('click', async () => {
      if (canShare) {
        try {
          await navigator.share({ title: 'Anybody Is Genius', text: 'An AI teacher that starts where you are.', url });
          return;
        } catch (err) {
          if ((err as DOMException)?.name === 'AbortError') return; // closed the share sheet
        }
      }
      if (canCopy) await copy();
      else manual();
    });
  }
}

export {};
