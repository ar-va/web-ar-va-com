// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// brand.ar-va.com: one static page built from the files beside it (ARVA-brand-rules.md, arva-tokens.css, logo/,
// avatars/), which the build also copies into dist/ so AI tools can read them by URL. No server code.
export default defineConfig({
  // Favicons and the header's logos, the same files on every ARVA site.
  publicDir: '../shared/public',
  vite: {
    plugins: [tailwindcss()],
  },
});
