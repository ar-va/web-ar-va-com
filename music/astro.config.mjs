// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// music.ar-va.com: every page is rendered per request (`export const prerender = false`).
export default defineConfig({
  adapter: cloudflare({ imageService: 'passthrough' }),
  // Logos and favicons, the same files on every site.
  publicDir: '../shared/public',
  // Logins live in D1 (shared/lib/store.ts); no KV namespace needed.
  session: false,
  security: { checkOrigin: true },
  vite: {
    plugins: [tailwindcss()],
  },
});
