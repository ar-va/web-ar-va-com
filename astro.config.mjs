// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';
import remarkBreaks from 'remark-breaks';

// https://astro.build/config
export default defineConfig({
  // Pages stay pre-rendered unless they say `export const prerender = false` (the music site does).
  adapter: cloudflare({ imageService: 'passthrough' }),
  // The music site keeps its own sessions in D1; no KV namespace needed.
  session: false,
  security: { checkOrigin: true },
  vite: {
    plugins: [tailwindcss()],
  },
  markdown: {
    remarkPlugins: [remarkBreaks],
  },
});
