// src/content.config.ts
import { z, defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';

const blogCollection = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/blog' }),
  schema: z.object({
    created: z.coerce.date().optional(),
    modified: z.coerce.date().optional(),
    slug: z.string().optional(),
    excerpt: z.any().transform(val => typeof val === 'string' ? val : undefined).optional(),
    tags: z.preprocess((val) => {
      if (typeof val === 'string') return val.split(',').map(t => t.trim());
      if (Array.isArray(val)) return val.map(t => String(t).trim());
      return [];
    }, z.array(z.string())).optional(),
  }),
});

export const collections = {
  'blog': blogCollection,
};