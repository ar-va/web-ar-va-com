// The header's bell (shared/scripts/bell.ts): GET = the logged-in person's newest comment alerts, POST = all seen.
import type { APIRoute } from 'astro';
import { currentUser, listAlerts, markAlertsSeen } from '@shared/lib/store';

export const prerender = false;

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } });

export const GET: APIRoute = async ({ cookies }) => {
  const user = await currentUser(cookies);
  return user ? json({ items: await listAlerts(user) }) : json({ items: [] }, 401);
};

export const POST: APIRoute = async ({ request, cookies, url }) => {
  // A bodiless fetch isn't covered by Astro's checkOrigin; cross-site callers are refused here.
  if (request.headers.get('origin') !== url.origin) return json({ error: 'Forbidden' }, 403);
  const user = await currentUser(cookies);
  if (!user) return json({ error: 'Log in first.' }, 401);
  await markAlertsSeen(user);
  return json({ ok: true });
};
