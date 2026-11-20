// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import remarkBreaks from 'remark-breaks';

// https://astro.build/config
export default defineConfig({
  // Pages stay pre-rendered unless they say `export const prerender = false` (the login and comments do).
  adapter: cloudflare({ imageService: 'passthrough' }),
  // Logos and favicons, the same files on every site (shared/).
  publicDir: './shared/public',
  // Logins live in D1 (shared/lib/store.ts); no KV namespace needed.
  session: false,
  security: { checkOrigin: true },
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    remarkPlugins: [remarkBreaks],
  },
});
