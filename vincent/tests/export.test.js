import test from 'node:test';
import assert from 'node:assert/strict';
import { exportCss, settings } from '../src/lib/export.ts';
import { DEFAULT_CHOICES, NEXTCLOUD_COLOR_VARS, generateTheme } from '../src/lib/theme.ts';

const theme = generateTheme(DEFAULT_CHOICES);
const css = exportCss(theme);
const blocks = () => {
  const at = (text) => css.indexOf(text);
  const system = css.slice(at('@media not (prefers-contrast: more)'), at('@media (prefers-color-scheme: dark)'));
  const media = css.slice(at('@media (prefers-color-scheme: dark)'), at('body[data-theme-light] {'));
  const light = css.slice(at('body[data-theme-light] {'), at('body[data-theme-dark] {'));
  const dark = css.slice(at('body[data-theme-dark] {'));
  return { system, media, light, dark };
};

test('has the device-light, device-dark, chosen-light and chosen-dark blocks', () => {
  assert.equal(css.match(/@media not \(prefers-contrast: more\)/g).length, 1);
  assert.equal(css.match(/@media \(prefers-color-scheme: dark\) and \(not \(prefers-contrast: more\)\)/g).length, 1);
  assert.equal(css.match(/html:root/g).length, 2);
  assert.equal(css.match(/body\[data-theme-light\] \{/g).length, 1);
  assert.equal(css.match(/body\[data-theme-dark\] \{/g).length, 1);
});

test('every variable is in every block with the right mode', () => {
  const { system, media, light, dark } = blocks();
  for (const name of NEXTCLOUD_COLOR_VARS) {
    assert.ok(system.includes(`${name}: ${theme.light[name]};`), `system ${name}`);
    assert.ok(media.includes(`${name}: ${theme.dark[name]};`), `media ${name}`);
    assert.ok(light.includes(`${name}: ${theme.light[name]};`), `light ${name}`);
    assert.ok(dark.includes(`${name}: ${theme.dark[name]};`), `dark ${name}`);
  }
});

test('removes the background image', () => {
  assert.equal(css.match(/--image-background: none;/g).length, 4);
});

test('leaves both high contrast themes out of the device blocks', () => {
  const { system, media } = blocks();
  for (const block of [system, media]) {
    assert.ok(block.includes('[data-theme-light-highcontrast]'));
    assert.ok(block.includes('[data-theme-dark-highcontrast]'));
  }
  assert.ok(system.includes('body:not([data-theme-dark],'));
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
