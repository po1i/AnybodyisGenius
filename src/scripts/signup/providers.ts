import { signupConfig, type Provider } from '../../data/signup.config';

export type SignupStatus = 'success' | 'duplicate' | 'invalid' | 'rate_limited' | 'error';
export interface SignupResult {
  status: SignupStatus;
  message?: string;
}
type Adapter = (email: string, signal: AbortSignal) => Promise<SignupResult>;

const parseJson = (res: Response) => res.json().catch(() => ({}) as Record<string, unknown>);

// Loops: https://loops.so/docs/forms/custom-form
// A urlencoded POST with no custom headers is a CORS "simple request".
const loops: Adapter = async (email, signal) => {
  const { formId, source, mailingLists } = signupConfig.loops;
  if (!formId) return { status: 'error', message: 'Signup is not connected yet.' };
  const body = new URLSearchParams({ email, source });
  if (mailingLists) body.set('mailingLists', mailingLists);
  const res = await fetch(`https://app.loops.so/api/newsletter-form/${encodeURIComponent(formId)}`, {
    method: 'POST',
    body,
    signal,
  });
  if (res.status === 429) return { status: 'rate_limited' };
  const data = (await parseJson(res)) as { success?: boolean; message?: string };
  if (res.ok && data.success) return { status: 'success' };
  const message = typeof data.message === 'string' ? data.message : undefined;
  if (message && /already/i.test(message)) return { status: 'duplicate' };
  if (message && /email/i.test(message) && /invalid|valid/i.test(message)) return { status: 'invalid' };
  return { status: 'error', message };
};

// Kit (ConvertKit) public form endpoint. Undocumented as an API; widely used.
const kit: Adapter = async (email, signal) => {
  const { formId } = signupConfig.kit;
  if (!formId) return { status: 'error', message: 'Signup is not connected yet.' };
  const res = await fetch(`https://app.kit.com/forms/${encodeURIComponent(formId)}/subscriptions`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: new URLSearchParams({ email_address: email }),
    signal,
  });
  if (res.status === 429) return { status: 'rate_limited' };
  const data = (await parseJson(res)) as { status?: string };
  if (res.ok && (data.status === 'success' || data.status === 'quarantined')) return { status: 'success' };
  return { status: 'error' };
};

// Test mode for previews and development: no network, always succeeds
// unless the address contains "fail" (network error) or "busy" (rate limit).
const mock: Adapter = (email, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      if (email.includes('fail')) resolve({ status: 'error' });
      else if (email.includes('busy')) resolve({ status: 'rate_limited' });
      else resolve({ status: 'success' });
    }, signupConfig.mock.delayMs);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });

const adapters: Record<Provider, Adapter> = { loops, kit, mock };

export const subscribe: Adapter = (email, signal) => adapters[signupConfig.provider](email, signal);
