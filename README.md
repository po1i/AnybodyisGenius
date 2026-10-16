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

The form runs in test mode until you connect a provider. Everything lives in one file,
`src/data/signup.config.ts`.

1. Create a free account at loops.so. The free plan covers up to 1,000 contacts.
2. Go to **Forms**, create a form, open its **Settings** tab, and copy the **Form Endpoint**. It
   looks like `https://app.loops.so/api/newsletter-form/abc123`. The ID is the last part.
3. In `signup.config.ts`, paste the ID into `loops.formId` and change `provider` to `'loops'`.
4. In Loops, go to **Settings > Sending** and turn on double opt-in. The page's success message
   already says "Check your inbox." If you leave double opt-in off, set `doubleOptIn: false` so it
   says "You're on the list" instead.
5. Deploy, then make one real signup from the live site and check it arrives in Loops.

Only public form IDs go in that file. Never paste an API key there, because the file ships to every
visitor's browser. Kit is also supported as a fallback (`provider: 'kit'`).

In test mode, addresses containing `fail` simulate a network error and `busy` simulates a rate
limit, so every state can be checked without sending anything.

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
| Email provider name and policy date | `src/pages/privacy.astro` |
| Loops form ID and double opt-in | `src/data/signup.config.ts` (see above) |
| Confirm the email promise | The page promises one email at invitation time and at most one short note a month before it, and says addresses are never sold or shared with advertisers. Change the copy if that isn't right. |
| Social preview image | Optional: add `og:image` in `src/layouts/Base.astro` |

## Deploy

Every push to `main` builds the site and publishes it with GitHub Pages, using the workflow in
`.github/workflows/deploy.yml`. The live address is `https://po1i.github.io/AnybodyisGenius/`.

- One-time setup: in this repository, go to **Settings > Pages** and set **Source** to
  **GitHub Actions**.
- Custom domain: add it under **Settings > Pages**, then in the workflow set `SITE_BASE` to `/`
  and `SITE_URL` to the domain (for example `https://anybodyisgenius.com`).

## Motion and the background drawing

- Smooth scrolling (Lenis), scroll reveals, the hero entrance, the pill-to-dialog morph and the
  background drawing all switch off when the visitor asks for reduced motion. The page is complete
  without any of them, and without JavaScript.
- The background is Archimedes' construction from *Measurement of a Circle*, Proposition 3: a
  circle between an inscribed and a circumscribed polygon. The sides double, 6 → 12 → 24 → 48 → 96,
  as each section heading (`#how-title`, `#mission-title`, `#faq-title`, `#final-title`) passes
  62% of the viewport. It only moves forward: scrolling back keeps the stage already reached. At
  96 sides the circle closes. A signup anywhere finishes the construction and traces the closed
  circle once in red, and the closed state lasts for the browser session.
- On a mouse, the edge nearest the pointer shows its construction lines; resting there previews
  the next doubling for that one edge. It never reacts over controls or the forms.
- It renders only while something is changing, pauses under the demo plate and in background
  tabs, shows on phones only at the top and the bottom of the page, and is left out entirely in
  forced-colors and high-contrast modes and in print.
- Code: `src/scripts/archimedes.ts` (layout, timing, colors) and `src/data/archimedes.ts`
  (stages and starting angle).

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
