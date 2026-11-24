// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// vincent.ar-va.com: a Nextcloud theme generator. Static: colours are worked out in the browser, nothing is uploaded.
export default defineConfig({
  // Favicons and the header's logos, the same files on every ARVA site.
  publicDir: '../shared/public',
  vite: {
    plugins: [tailwindcss()],
  },
});
