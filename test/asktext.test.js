// The name box that replaces window.prompt() (Electron has none): what a typed name becomes, Tab staying inside,
// and that no prompt() is left in the app's code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { textOrDefault, nextFocus, NAME_MAX } from '../js/asktext.js';

test('a typed name is trimmed and capped; nothing typed falls back to the default', () => {
  assert.equal(textOrDefault('  Tour poster  ', 'Untitled'), 'Tour poster');
  assert.equal(textOrDefault('', 'Static Bloom teaser'), 'Static Bloom teaser');
  assert.equal(textOrDefault('   ', 'My edit copy'), 'My edit copy');
  assert.equal(textOrDefault(null, ' Default '), 'Default');
  assert.equal(textOrDefault('', ''), '');
  assert.equal(textOrDefault('x'.repeat(300), '').length, NAME_MAX);
  assert.equal(textOrDefault('abcdef', '', 3), 'abc');
});

test('Tab goes round the box and wraps at both ends', () => {
  const items = ['input', 'x', 'cancel', 'save'];
  assert.equal(nextFocus(items, 'input'), 'x');
  assert.equal(nextFocus(items, 'save'), 'input');
  assert.equal(nextFocus(items, 'input', true), 'save');
  assert.equal(nextFocus(items, 'cancel', true), 'x');
  assert.equal(nextFocus(items, 'outside'), 'input');
  assert.equal(nextFocus(items, 'outside', true), 'save');
  assert.equal(nextFocus([], 'input'), null);
});

test('no window.prompt() is left in the app (the Mac app throws on it)', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'js');
  const left = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.js')) {
        const code = readFileSync(p, 'utf8').replace(/\/\/.*$/gm, '');
        if (/(^|[^.\w])prompt\s*\(|window\.prompt\s*\(/m.test(code)) left.push(p.slice(root.length + 1));
      }
    }
  };
  walk(root);
  assert.deepEqual(left, []);
});
