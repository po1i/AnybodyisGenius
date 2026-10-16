/* ==========================================================================
   EMAIL SIGNUP INTEGRATION POINT
   --------------------------------------------------------------------------
   1. Create a free Loops account (loops.so).
   2. Open Forms in the sidebar, select the Settings tab, and copy the
      Form Endpoint (https://app.loops.so/api/newsletter-form/XXXXXXXX).
   3. Paste it into `loops.formId` below (the whole URL or just the ID) and
      change `provider` to 'loops'.
   4. Confirmation emails (double opt-in) need a sending domain you own,
      verified in Loops under Settings > Domain; github.io can't be used.
      Once it's verified, turn on double opt-in (Settings > Sending) and set
      `doubleOptIn: true`. That also updates the success message, the FAQ
      and the privacy page, which mention the confirmation email only then.
   Only public form IDs belong in this file. Never put an API key here:
   this file ships to every visitor's browser.
   ========================================================================== */

export type Provider = 'mock' | 'loops' | 'kit';

export const signupConfig = {
  provider: 'mock' as Provider,
  doubleOptIn: false,
  loops: {
    formId: '', // [[PLACEHOLDER: Loops form endpoint]]
    source: 'early-access-page',
    mailingLists: '', // optional: comma-separated IDs of public mailing lists
  },
  kit: {
    formId: '',
  },
  mock: {
    delayMs: 900,
  },
};

/** The Loops form ID, whether the whole Form Endpoint URL or just its last part was pasted. */
export const loopsFormId = (): string =>
  signupConfig.loops.formId.trim().split('/').filter(Boolean).pop() ?? '';
