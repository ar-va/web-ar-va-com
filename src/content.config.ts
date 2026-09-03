// src/content.config.ts
import { z, defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

const blogCollection = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    public: z.coerce.date().optional(),
    modified: z.coerce.date().optional(),
    tags: z.preprocess((val) => {
      if (typeof val === 'string') return val.split(',').map(t => t.trim());
      return val;
    }, z.array(z.string())).optional(),
  }),
});

export const collections = {
  'blog': blogCollection,
};