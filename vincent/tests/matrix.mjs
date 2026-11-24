// Loads the exported CSS in real Chrome beside stylesheets built like Nextcloud's, for every kind of visitor, device
// mode and load order. Run: npm run test:browser -w vincent
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportCss } from '../src/lib/export.ts';
import { DEFAULT_CHOICES, generateTheme } from '../src/lib/theme.ts';

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const NAMES = ['--color-main-background', '--color-primary-element'];
const own = (id) => NAMES.map((n, i) => `${n}:#${id}0${i}`).join(';');
// The same media queries a real page has: a device asking for more contrast gets high contrast without choosing it.
const NEXTCLOUD = `:root{${own('1111')}}
@media (prefers-color-scheme: light){:root{${own('1212')}}}
@media (prefers-color-scheme: dark){:root{${own('2222')}}}
@media (prefers-contrast: more){:root{${own('5555')}}}
@media (prefers-color-scheme: dark) and (prefers-contrast: more){:root{${own('6666')}}}
[data-theme-light]{${own('3333')}}
[data-theme-dark]{${own('4444')}}
[data-theme-light-highcontrast]{${own('5555')}}
[data-theme-dark-highcontrast]{${own('6666')}}`;

const theme = generateTheme(DEFAULT_CHOICES);
const css = exportCss(theme);
const values = (vars) => NAMES.map((n) => vars[n]);
const ownValues = (id) => NAMES.map((_, i) => `#${id}0${i}`);

const CASES = [
  ['', 'light', values(theme.light)], ['', 'dark', values(theme.dark)],
  ['data-theme-default', 'light', values(theme.light)], ['data-theme-default', 'dark', values(theme.dark)],
  ['data-theme-light', 'light', values(theme.light)], ['data-theme-light', 'dark', values(theme.light)],
  ['data-theme-dark', 'light', values(theme.dark)], ['data-theme-dark', 'dark', values(theme.dark)],
  ['data-theme-light-highcontrast', 'light', ownValues('5555')], ['data-theme-light-highcontrast', 'dark', ownValues('5555')],
  ['data-theme-dark-highcontrast', 'light', ownValues('6666')], ['data-theme-dark-highcontrast', 'dark', ownValues('6666')],
  ['', 'light', ownValues('5555'), 'more'], ['', 'dark', ownValues('6666'), 'more'],
  ['data-theme-default', 'light', ownValues('5555'), 'more'], ['data-theme-default', 'dark', ownValues('6666'), 'more'],
  ['data-theme-light', 'light', values(theme.light), 'more'], ['data-theme-light', 'dark', values(theme.light), 'more'],
  ['data-theme-dark', 'light', values(theme.dark), 'more'], ['data-theme-dark', 'dark', values(theme.dark), 'more'],
  ['data-theme-light-highcontrast', 'light', ownValues('5555'), 'more'], ['data-theme-light-highcontrast', 'dark', ownValues('5555'), 'more'],
  ['data-theme-dark-highcontrast', 'light', ownValues('6666'), 'more'], ['data-theme-dark-highcontrast', 'dark', ownValues('6666'), 'more'],
];

const profile = await mkdtemp(join(tmpdir(), 'vincent-matrix-'));
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', 'about:blank']);
let failed = 0;
try {
  const browser = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Chrome did not start')), 20000);
    let log = '';
    chrome.stderr.on('data', (d) => {
      log += d;
      const m = log.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
  });
  const origin = new URL(browser).host;
  const target = await (await fetch(`http://${origin}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (waiting.has(m.id)) { waiting.get(m.id)(m.result); waiting.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise((r) => { waiting.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });

  await send('Page.enable');
  const frame = (await send('Page.getFrameTree')).frameTree.frame.id;
  let passed = 0;
  for (const order of ['after', 'before']) {
    const sheets = order === 'after' ? [NEXTCLOUD, css] : [css, NEXTCLOUD];
    for (const [attr, device, expected, pref = 'no-preference'] of CASES) {
      await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: device }, { name: 'prefers-contrast', value: pref }] });
      await send('Page.setDocumentContent', { frameId: frame, html: `<!doctype html><html><head>${sheets.map((s) => `<style>${s}</style>`).join('')}</head><body ${attr}></body></html>` });
      const { result } = await send('Runtime.evaluate', {
        expression: `JSON.stringify(${JSON.stringify(NAMES)}.map((n) => getComputedStyle(document.body).getPropertyValue(n).trim()))`,
        returnByValue: true,
      });
      const got = JSON.parse(result.value);
      if (JSON.stringify(got) === JSON.stringify(expected)) passed++;
      else { failed++; console.error(`FAIL css ${order}, body [${attr || 'guest'}], device ${device}, contrast ${pref}: got ${got}, expected ${expected}`); }
    }
  }
  console.log(`${passed}/${CASES.length * 2}`);
  ws.close();
} finally {
  chrome.kill();
  await new Promise((r) => { chrome.once('exit', r); setTimeout(r, 2000); });
  await rm(profile, { recursive: true, force: true, maxRetries: 3 });
}
process.exit(failed ? 1 : 0);
