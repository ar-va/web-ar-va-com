// The security headers every ARVA site sends (shared/security.ts) on each page anon renders.
import { defineMiddleware } from 'astro:middleware';
import { withSecurityHeaders } from '@shared/security';

export const onRequest = defineMiddleware(async (_, next) => withSecurityHeaders(await next()));
