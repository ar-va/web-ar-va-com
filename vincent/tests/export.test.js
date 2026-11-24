import test from 'node:test';
import assert from 'node:assert/strict';
import { exportCss, settings } from '../src/lib/export.ts';
import { DEFAULT_CHOICES, NEXTCLOUD_COLOR_VARS, generateTheme } from '../src/lib/theme.ts';

const theme = generateTheme(DEFAULT_CHOICES);
const css = exportCss(theme);
const blocks = () => {
  const light = css.slice(css.indexOf('html:root'), css.indexOf('@media'));
  const media = css.slice(css.indexOf('@media'), css.indexOf('body[data-theme-dark] {'));
  const dark = css.slice(css.indexOf('body[data-theme-dark] {'));
  return { light, media, dark };
};

test('has the light, device-dark and chosen-dark blocks', () => {
  assert.equal(css.match(/@media \(prefers-color-scheme: dark\)/g).length, 1);
  assert.equal(css.match(/html:root/g).length, 2);
  assert.equal(css.match(/body\[data-theme-dark\] \{/g).length, 1);
});

test('every variable is in every block with the right mode', () => {
  const { light, media, dark } = blocks();
  for (const name of NEXTCLOUD_COLOR_VARS) {
    assert.ok(light.includes(`${name}: ${theme.light[name]};`), `light ${name}`);
    assert.ok(media.includes(`${name}: ${theme.dark[name]};`), `media ${name}`);
    assert.ok(dark.includes(`${name}: ${theme.dark[name]};`), `dark ${name}`);
  }
});

test('removes the background image', () => {
  assert.equal(css.match(/--image-background: none;/g).length, 3);
});

test('leaves both high contrast themes out of the light and device-dark blocks', () => {
  const { light, media } = blocks();
  for (const block of [light, media]) {
    assert.ok(block.includes('[data-theme-light-highcontrast]'));
    assert.ok(block.includes('[data-theme-dark-highcontrast]'));
  }
  assert.ok(light.includes('body:not([data-theme-dark],'));
  assert.ok(media.includes('body:not([data-theme-light],'));
});

test('is safe to paste', () => {
  assert.ok(!/[<`]/.test(css));
  assert.ok(!css.includes('!important'));
  assert.ok(!css.includes('undefined'));
  assert.equal(css.match(/\{/g).length, css.match(/\}/g).length);
});

test('settings give the values for the admin panel', () => {
  assert.deepEqual(settings(theme), { primary: theme.light['--color-primary-element'], background: theme.light['--color-background-plain'] });
});
