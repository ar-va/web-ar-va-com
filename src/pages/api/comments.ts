// Blog comment form posts here (add or delete), then back to the post.
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { createCleanSlug } from '../../utils/helpers';
import { addComment, currentUser, deleteComment } from '../../music/store';
import { loginHref } from '../../music/lib';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, url, redirect }) => {
  const form = await request.formData();
  const slug = String(form.get('slug') ?? '');
  const posts = await getCollection('blog');
  if (!posts.some((p) => (p.data.slug || createCleanSlug(p.id)) === slug)) return new Response('Not found', { status: 404 });

  const back = `/blog/${encodeURIComponent(slug)}#comments`;
  const user = await currentUser(cookies);
  if (!user) return redirect(loginHref(url, url.origin + back), 303);

  if (form.get('action') === 'delete') {
    await deleteComment({ slug }, Number(form.get('id')), user);
  } else {
    const error = await addComment({ slug }, user, String(form.get('body') ?? ''));
    if (error) cookies.set('comment_error', error, { path: '/', maxAge: 60, httpOnly: true, secure: true, sameSite: 'lax' });
  }
  return redirect(back, 303);
};
