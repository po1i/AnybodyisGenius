// Business facts and placeholders. Anything still null renders as a visible
// [[PLACEHOLDER: …]] tag and is listed in README.md under "Before launch".

export const site = {
  name: 'Anybody Is Genius',
  headline: 'Get 1% smarter, every day.',
  description:
    'Anybody Is Genius is an AI teacher for adults. It finds what you already know, teaches just past it, and brings ideas back until they stick. Join the early-access list.',

  /** e.g. 'spring 2027'. null shows a placeholder. */
  launchDate: null as string | null,
  /** Path under /public, e.g. 'logo.svg'. null keeps the text wordmark and shows a placeholder. */
  logo: null as string | null,
  /** Public contact address. */
  contactEmail: null as string | null,
  /** Public phone number. */
  phone: null as string | null,
  instagram: { handle: '@wpo1i', url: 'https://www.instagram.com/wpo1i/' },
  /** The privacy policy: a page in this site (e.g. 'privacy.html') or the full https:// address of a hosted policy. */
  privacyUrl: 'privacy.html',
} as const;

/** Link to the privacy policy. Pages in this site get the base path; full addresses are used as given. */
export const privacyHref = (base: string): string =>
  /^([a-z][a-z\d+.-]*:|\/\/)/i.test(site.privacyUrl) ? site.privacyUrl : `${base}${site.privacyUrl}`;
