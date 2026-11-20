// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// Every page is rendered on request (the list changes as messages are published), so there is nothing to pre-render.
export default defineConfig({
  output: 'server',
  adapter: cloudflare({ imageService: 'passthrough' }),
  session: false,
  // Refuses form posts from other sites (403).
  security: { checkOrigin: true },
  vite: {
    plugins: [tailwindcss()],
  },
});
