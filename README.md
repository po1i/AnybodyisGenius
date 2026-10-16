# Anybody Is Genius: early-access page

A single landing page whose one job is to collect early-access signups. Static Astro site, no
server, about 115 KB of fonts and about 15 KB of JavaScript (compressed).

## Run it

```sh
npm install
npm run dev        # http://localhost:4321
npm run build      # outputs dist/
```

## Connect the email list (Loops)

Until this is done the forms run in **test mode**: they look like they work, but no address is
saved anywhere.

**What to send Claude (or do yourself):** the Loops **Form Endpoint**, a URL like
`https://app.loops.so/api/newsletter-form/abc123`. It's public, so it's safe to paste in chat. Never
share a Loops **API key**: the form doesn't need one, and it would end up in every visitor's browser.

1. Create a free account at loops.so. The free plan emails up to 1,000 subscribed contacts (with a
   small Loops footer). Contacts past 1,000 are still kept.
2. In Loops, open **Forms** in the sidebar, select the **Settings** tab, and copy the URL in the
   **Form Endpoint** field.
3. In `src/data/signup.config.ts`, paste it into `loops.formId` (the whole URL or just the last
   part) and change `provider` to `'loops'`. Push to `main` and the site redeploys in about a minute.
4. Test it on the live site with a fresh address, then check it appears in your contacts in
   Loops. Wait a minute between tries: the endpoint is rate limited per visitor, and an address
   that's already on the list shows "You're already on the list."

### Confirmation emails (later, needs your own domain)

Loops can't send any email, including a "confirm your address" email, until you verify a sending
domain you own (`po1i.github.io` doesn't count). Signups are stored either way, so this can wait
until you're ready to send the first invitation.

1. Get a domain (for example the product's name). The same domain can also replace
   `po1i.github.io/AnybodyisGenius` as the site's address (see Deploy).
2. In Loops, go to **Settings > Domain**, add the DNS records it shows (a subdomain like
   `mail.yourdomain.com` is recommended), then click **Verify Records**.
3. Turn on double opt-in under **Settings > Sending**, and set `doubleOptIn: true` in
   `src/data/signup.config.ts`. The success message, the FAQ and the privacy page then mention the
   confirmation email. New signups show as *Pending* in Loops until they confirm.

Kit is also supported as a fallback (`provider: 'kit'`), but its form endpoint isn't officially
documented. To check every form state without sending anything, keep test mode on and use an
address containing `fail` (network error) or `busy` (rate limit).

## Edit content

- Business facts and placeholders: `src/data/site.ts` (launch date, logo, contact email, phone,
  Instagram, privacy URL). Any `null` value shows a dashed `[[PLACEHOLDER: …]]` tag on the page.
- The demo text, figure captions and margin notes: `src/data/demo.ts`.
- Section copy: the components in `src/components/`.

## Before launch

| Item | Where |
| --- | --- |
| Logo (SVG preferred) | Add to `public/`, set `logo` in `src/data/site.ts` |
| Launch date | `launchDate` in `src/data/site.ts` (appears in the header and FAQ) |
| Contact email | `contactEmail` in `src/data/site.ts` (footer and privacy page) |
| Phone number | `phone` in `src/data/site.ts` (footer) |
| Final privacy policy | Replace the draft in `src/pages/privacy.astro`, or point `privacyUrl` at a hosted policy |
| Policy date | `src/pages/privacy.astro` (the provider name fills in from the signup config) |
| Loops Form Endpoint; double opt-in once you have a domain | `src/data/signup.config.ts` (see above) |
| Confirm the email promise | The page promises one email at invitation time and at most one short note a month before it, and says addresses are never sold or shared with advertisers. Change the copy if that isn't right. |
| Social preview image | Optional: add `og:image` in `src/layouts/Base.astro` |

## Deploy

Every push to `main` builds the site and publishes it with GitHub Pages, using the workflow in
`.github/workflows/deploy.yml`. The live address is `https://po1i.github.io/AnybodyisGenius/`.

- One-time setup: in this repository, go to **Settings > Pages** and set **Source** to
  **GitHub Actions**.
- Custom domain: add it under **Settings > Pages**, then in the workflow set `SITE_BASE` to `/`
  and `SITE_URL` to the domain (for example `https://anybodyisgenius.com`).

## Motion and the circle drawings

- Smooth scrolling (Lenis), scroll reveals, the hero entrance, the pill-to-dialog morph and the
  circle animations all switch off when the visitor asks for reduced motion. The page is complete
  without any of them, and without JavaScript.
- One-stage scrolling (`src/scripts/sheets.ts`): each section is a sheet that pins, and the next
  slides over it while it settles back and dims. When a wheel or trackpad scroll stops within 30%
  of a screen before the next section, the page glides the rest of the way (or settles back if a
  scroll carried you just past a section start). It never takes over scrolling: touch, keyboard
  and scrollbar work normally, nothing glides while you type or the dialog is open, and reduced
  motion, no-JS and print get the plain page. On wide screens a scene index sits in the left
  margin. Sections are marked with `data-sheet` (the last one, `final`, doesn't pin); tune the
  glide with `AHEAD` and `BEHIND` in the script.
- The circle drawings are Archimedes' construction from *Measurement of a Circle*, Proposition 3: a
  circle between an inscribed and a circumscribed polygon. One sits beside the headline on wide
  screens; it draws itself in once per visit, and on a mouse the edge nearest the pointer shows
  its construction (resting there previews the next doubling). Fig. 3 sits beside the final
  signup: when it comes into view the sides double, 6 → 12 → 24 → 48 → 96, and the circle closes.
  A signup anywhere completes both drawings and traces the circle once in red; that state lasts
  for the browser session.
- They never sit behind text, render only while on screen and changing, and show a static drawing
  without JavaScript and in forced-colors mode.
- Code: `src/scripts/archimedes.ts` (timing, colors), `src/components/ArchFigure.astro` (static
  fallback) and `src/data/archimedes.ts` (stages and starting angle).

## Fonts

Literata (TypeTogether) and Atkinson Hyperlegible Next (Braille Institute), both under the SIL Open
Font License 1.1, with license files in `src/assets/fonts/`. The files are static instances cut
from the variable fonts and subset to Latin plus the Greek letters the equation uses. The headline
and body faces are preloaded, and size-matched fallback faces stop the text from shifting when the
fonts arrive.

## The demo's accuracy

The five readings were written, then checked by three independent reviewers (physics, teaching,
editorial), merged, and re-checked by a fourth. One error was caught and fixed in that last pass.
Key values were recomputed: North Pole about 524 W/m² and equator about 385 W/m² at the June
solstice, 16.2 h and 7.9 h of daylight at 50°N, perihelion 147.1 and aphelion 152.1 million km.
The Level 5 citation is Hays, Imbrie & Shackleton (1976), Science 194, 1121–1132. Have a subject
expert read it once more before launch if you can.
