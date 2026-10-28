// Blog comment form posts here (add or delete), then back to the post.
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { createCleanSlug } from '../../utils/helpers';
import { env } from 'cloudflare:workers';
import { addComment, currentUser, deleteComment, editComment } from '../../music/store';
import { commentNotices, loginHref } from '../../music/lib';
import { notify } from '../../music/notify';

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, url, redirect, locals }) => {
  const form = await request.formData();
  const slug = String(form.get('slug') ?? '');
  const posts = await getCollection('blog');
  const post = posts.find((p) => (p.data.slug || createCleanSlug(p.id)) === slug);
  if (!post) return new Response('Not found', { status: 404 });

  const back = `/blog/${encodeURIComponent(slug)}#comments`;
  const user = await currentUser(cookies);
  if (!user) return redirect(loginHref(url, url.origin + back), 303);

  const action = form.get('action');
  const id = Number(form.get('id'));
  const body = String(form.get('body') ?? '');
  let error: string | null = null;
  if (action === 'delete') {
    await deleteComment({ slug }, id, user);
  } else if (action === 'edit') {
    error = await editComment({ slug }, id, user, body);
  } else {
    const saved = await addComment({ slug }, user, body, Number(form.get('parent_id')) || null);
    if ('error' in saved) {
      error = saved.error;
    } else {
      // Blog comments notify the admin (and whoever was replied to).
      locals.cfContext.waitUntil(notify(commentNotices({
        authorId: user.id, authorName: user.name, ownerId: Number(env.ADMIN_TELEGRAM_ID) || null, parentAuthorId: saved.parentAuthorId,
        title: post.body?.match(/^#\s+(.+)$/m)?.[1] ?? slug, body: body.trim(), url: `${url.origin}/blog/${encodeURIComponent(slug)}#comment-${saved.id}`,
      })));
      return redirect(`/blog/${encodeURIComponent(slug)}#comment-${saved.id}`, 303);
    }
  }
  if (error) cookies.set('comment_error', error, { path: '/', maxAge: 60, httpOnly: true, secure: true, sameSite: 'lax' });
  return redirect(back, 303);
};
