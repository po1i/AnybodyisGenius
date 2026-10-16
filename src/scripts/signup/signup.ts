import { subscribe } from './providers';
import { signupConfig } from '../../data/signup.config';

const STORE_KEY = 'aig:early-access';
// Practical, not RFC-complete: something@something.tld, no spaces.
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

const normalize = (raw: string) => {
  const v = raw.trim();
  const at = v.lastIndexOf('@');
  return at < 0 ? v : v.slice(0, at) + '@' + v.slice(at + 1).toLowerCase();
};

const readStore = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
const remember = (email: string) => {
  try {
    const all = readStore();
    if (!all.includes(email.toLowerCase())) all.push(email.toLowerCase());
    localStorage.setItem(STORE_KEY, JSON.stringify(all.slice(-5)));
  } catch {
    /* storage unavailable: fine */
  }
};

const MESSAGES = {
  invalid: 'Check the address. It needs an @ and a domain, like name@example.org.',
  empty: 'Enter your email address to join.',
  rate_limited: 'Too many tries in a row. Wait a minute, then try again.',
  error: 'We couldn’t reach the list just now. Your address is still here, so try again in a moment.',
};

const today = () =>
  new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());

const forms = Array.from(document.querySelectorAll<HTMLFormElement>('form[data-signup]'));
let inFlight = false;

function showSuccess(email: string, opts: { duplicate?: boolean; focusForm?: HTMLFormElement } = {}) {
  for (const form of forms) {
    const box = form.closest<HTMLElement>('[data-signup-box]')!;
    const done = box.querySelector<HTMLElement>('[data-signup-done]')!;
    const title = done.querySelector<HTMLElement>('[data-done-title]')!;
    const body = done.querySelector<HTMLElement>('[data-done-body]')!;
    const stamp = done.querySelector<HTMLElement>('[data-done-stamp]')!;

    if (opts.duplicate && signupConfig.doubleOptIn) {
      title.textContent = 'You’ve already asked to join.';
      body.textContent = `We sent a confirmation link to ${email}. If you can’t find it, check your spam folder, then open it to finish joining.`;
      stamp.textContent = '';
    } else if (opts.duplicate) {
      title.textContent = 'You’re already on the list.';
      body.textContent = 'Nothing more to do. We’ll write when your invitation is ready.';
      stamp.textContent = '';
    } else if (signupConfig.doubleOptIn) {
      title.textContent = 'Check your inbox.';
      body.textContent = `We’ve sent a confirmation link to ${email}. Open it and you’re on the list.`;
      stamp.textContent = `Requested ${today()}`;
    } else {
      title.textContent = 'You’re on the list.';
      body.textContent = `We’ll write to ${email} when your invitation is ready.`;
      stamp.textContent = `Entered on the list, ${today()}`;
    }
    box.dataset.state = 'done';
    form.setAttribute('aria-hidden', 'true');
    form.inert = true;
    done.hidden = false;
  }
  const target = opts.focusForm?.closest<HTMLElement>('[data-signup-box]')?.querySelector<HTMLElement>('[data-done-title]');
  target?.focus({ preventScroll: false });
}

const FIELD_ERRORS = new Set(['empty', 'invalid']);

function setError(form: HTMLFormElement, key: keyof typeof MESSAGES | null, custom?: string) {
  const input = form.querySelector<HTMLInputElement>('input[type="email"]')!;
  const msg = form.querySelector<HTMLElement>('[data-signup-msg]')!;
  const box = form.closest<HTMLElement>('[data-signup-box]')!;
  if (!key) {
    input.removeAttribute('aria-invalid');
    msg.hidden = true;
    msg.querySelector('[data-msg-text]')!.textContent = '';
    delete box.dataset.err;
    if (box.dataset.state === 'error') box.dataset.state = 'idle';
    return;
  }
  box.dataset.err = key;
  if (FIELD_ERRORS.has(key)) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
  msg.querySelector('[data-msg-text]')!.textContent = custom ?? MESSAGES[key];
  msg.hidden = false;
  box.dataset.state = 'error';
}

function setLoading(form: HTMLFormElement, on: boolean) {
  const box = form.closest<HTMLElement>('[data-signup-box]')!;
  const input = form.querySelector<HTMLInputElement>('input[type="email"]')!;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  box.dataset.state = on ? 'loading' : 'idle';
  input.readOnly = on;
  button.setAttribute('aria-disabled', String(on));
  form.setAttribute('aria-busy', String(on));
  const status = form.querySelector<HTMLElement>('[data-signup-status]');
  if (status) status.textContent = on ? 'Sending…' : '';
}

for (const form of forms) {
  const input = form.querySelector<HTMLInputElement>('input[type="email"]')!;
  const trap = form.querySelector<HTMLInputElement>('input[name="company"]');
  let attempted = false;

  const box = form.closest<HTMLElement>('[data-signup-box]')!;
  const fieldError = () => !box.dataset.err || FIELD_ERRORS.has(box.dataset.err);

  input.addEventListener('blur', () => {
    if (!attempted || !input.value || !fieldError()) return;
    setError(form, EMAIL_RE.test(normalize(input.value)) ? null : 'invalid');
  });
  input.addEventListener('input', () => {
    if (box.dataset.state === 'error' && fieldError() && EMAIL_RE.test(normalize(input.value))) {
      setError(form, null);
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (inFlight) return;
    attempted = true;
    const email = normalize(input.value);

    if (!email) {
      setError(form, 'empty');
      input.focus();
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setError(form, 'invalid');
      input.focus();
      return;
    }
    setError(form, null);

    // Bots fill the hidden field. Pretend it worked and send nothing.
    if (trap && trap.value) {
      showSuccess(email, { focusForm: form });
      return;
    }
    if (readStore().includes(email.toLowerCase())) {
      showSuccess(email, { duplicate: true, focusForm: form });
      return;
    }

    inFlight = true;
    setLoading(form, true);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const result = await subscribe(email, ctrl.signal);
      setLoading(form, false);
      if (result.status === 'success') {
        remember(email);
        showSuccess(email, { focusForm: form });
      } else if (result.status === 'duplicate') {
        remember(email);
        showSuccess(email, { duplicate: true, focusForm: form });
      } else if (result.status === 'invalid') {
        setError(form, 'invalid');
        input.focus();
      } else if (result.status === 'rate_limited') {
        setError(form, 'rate_limited');
      } else {
        setError(form, 'error');
      }
    } catch {
      setLoading(form, false);
      setError(form, 'error');
    } finally {
      clearTimeout(timer);
      inFlight = false;
    }
  });
}

