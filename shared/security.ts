// Security headers on every page of the four sites (security review, 2026-11-22). Static files get the same two from
// shared/public/_headers: keep both in step.
// - nosniff: browsers treat a file as the type the site says it is and never guess (a text file can't run as a script).
// - frame-ancestors 'self': only the site's own pages may show it in a frame, so another site can't lay one of these
//   pages invisibly under its own buttons. (It doesn't affect frames these pages show: Telegram's login, YouTube.)
// HSTS (always https) is switched on in Cloudflare's dashboard for the whole domain, not here.
export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "frame-ancestors 'self'",
};

export function withSecurityHeaders(response: Response) {
  const out = new Response(response.body, response); // a copy: responses from fetch() or the assets have fixed headers
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) out.headers.set(name, value);
  return out;
}
