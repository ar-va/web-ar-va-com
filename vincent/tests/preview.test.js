import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

// Reads the built page, so these run after `npm run build -w vincent` and are skipped on a clone that hasn't built.
const built = new URL('../dist/preview/index.html', import.meta.url);
const skip = existsSync(built) ? false : 'vincent is not built';
const html = skip ? '' : readFileSync(built, 'utf8');
const panel = (name) => {
  const start = html.indexOf(`data-view-panel="${name}"`);
  assert.ok(start > 0, `no ${name} view`);
  const next = html.indexOf('data-view-panel="', start + 20);
  return html.slice(start, next < 0 ? undefined : next);
};

test('has every screen', { skip }, () => {
  for (const name of ['files', 'share', 'login', 'admin']) panel(name);
});

test('the preview cannot collect anything', { skip }, () => {
  assert.ok(!/<form\b/i.test(html));
  assert.ok(!/type=["']?password/i.test(html));
  assert.ok(!/<input\b(?![^>]*\breadonly\b)(?![^>]*type="(checkbox|radio)")[^>]*>/i.test(html), 'every text input is read-only');
});

test('the login mock has no real fields and no Nextcloud name', { skip }, () => {
  const login = panel('login');
  assert.ok(!/<input\b/i.test(login));
  assert.ok(!/nextcloud/i.test(login));
});

test('the login mock is labelled as a preview', { skip }, () => {
  assert.ok(/class="preview-badge"[^>]*>\s*Preview/.test(panel('login')));
});

test('the preview page stays out of search engines', { skip }, () => {
  assert.ok(/<meta name="robots" content="noindex, nofollow"/.test(html));
});

test('the share view has the note, its footer and the file request', { skip }, () => {
  const share = panel('share');
  for (const text of ['notecard', 'Get your own free account', 'Upload files to']) assert.ok(share.includes(text), text);
});

test('the admin view has Theming and Appearance', { skip }, () => {
  const admin = panel('admin');
  for (const text of ['Background and color', 'Primary color', 'Custom CSS', 'Appearance and accessibility', 'High contrast']) assert.ok(admin.includes(text), text);
});
