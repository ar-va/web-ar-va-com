// Blog comment form posts here (new, reply, edit, delete), then back to the post.
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { createCleanSlug } from '../../utils/helpers';
import { env } from 'cloudflare:workers';
import { commentForm, currentUser } from '@shared/lib/store';
import { loginHref } from '@shared/lib/lib';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, url, redirect, locals }) => {
  const form = await request.formData();
  const slug = String(form.get('slug') ?? '');
  const posts = await getCollection('blog');
  const post = posts.find((p) => (p.data.slug || createCleanSlug(p.id)) === slug);
  if (!post) return new Response('Not found', { status: 404 });

  const page = `/blog/${encodeURIComponent(slug)}`;
  const back = `${page}#comments`;
  const user = await currentUser(cookies);
  if (!user) return redirect(loginHref(url, url.origin + back), 303);

  // Blog comments notify the admin (and whoever was replied to). A refused comment comes back as a cookie the post shows once.
  const result = await commentForm({ slug }, form, user, { ownerId: Number(env.ADMIN_TELEGRAM_ID) || null, title: post.body?.match(/^#\s+(.+)$/m)?.[1] ?? slug, url: `${url.origin}${page}` },
    (p) => locals.cfContext.waitUntil(p));
  if ('anchor' in result) return redirect(`${page}#${result.anchor}`, 303);
  cookies.set('comment_error', result.error, { path: '/', maxAge: 60, httpOnly: true, secure: true, sameSite: 'lax' });
  return redirect(back, 303);
};
