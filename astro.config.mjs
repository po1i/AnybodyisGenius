import { defineConfig } from 'astro/config';

// SITE_BASE: "/" on a custom domain or a user/org Pages site,
// "/<repo>/" on a project Pages site.
export default defineConfig({
  // absolute URLs (canonical, link previews) are only written when this is set
  site: process.env.SITE_URL || undefined,
  base: process.env.SITE_BASE ?? '/',
  output: 'static',
  trailingSlash: 'ignore',
  build: { inlineStylesheets: 'always', format: 'file' },
});
