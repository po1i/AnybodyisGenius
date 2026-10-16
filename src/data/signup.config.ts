/* ==========================================================================
   EMAIL SIGNUP INTEGRATION POINT
   --------------------------------------------------------------------------
   1. Create a free Loops account (loops.so) and a form: Forms > New form.
   2. Open the form's Settings tab and copy the Form Endpoint ID
      (the last part of https://app.loops.so/api/newsletter-form/XXXXXXXX).
   3. Paste it into `loops.formId` below and change `provider` to 'loops'.
   4. In Loops, turn on double opt-in (Settings > Sending) to match
      `doubleOptIn: true`, which sets the success message wording.
   Only public form IDs belong in this file. Never put an API key here:
   this file ships to every visitor's browser.
   ========================================================================== */

export type Provider = 'mock' | 'loops' | 'kit';

export const signupConfig = {
  provider: 'mock' as Provider,
  doubleOptIn: true,
  loops: {
    formId: '', // [[PLACEHOLDER: Loops form endpoint ID]]
    source: 'early-access-page',
    mailingLists: '',
  },
  kit: {
    formId: '',
  },
  mock: {
    delayMs: 900,
  },
};
