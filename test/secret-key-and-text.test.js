// Copyright 2026 Quantova Inc
// SPDX-License-Identifier: Apache-2.0 OR MIT

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const util = require('util');
const q = require('..');

test('a generated key never shows its bytes when printed or serialised', () => {
  const key = q.generateKey();
  const hex = Buffer.from(key).toString('hex');
  const listed = Array.from(key).join(',');
  const shown = [util.inspect(key), util.inspect({ key }), JSON.stringify({ key }), String(key), `${key}`, util.format('%o', key), util.format('%j', { key }), key.toLocaleString()];
  for (const s of shown) {
    assert.ok(!s.includes(hex), s);
    assert.ok(!s.replace(/\s/g, '').includes(listed.slice(0, 24)), s);
  }
  assert.ok(key instanceof Uint8Array);
  assert.strictEqual(key.length, 32);
  assert.strictEqual(Object.prototype.toString.call(key.slice(0, 4)), '[object Uint8Array]');
  assert.strictEqual(q.keyId(key), q.keyId(Uint8Array.from(key)));
});

test('text with an unassigned code point or a noncharacter is refused', () => {
  const F = require('../lib/format');
  for (const t of ['a\u0378b', 'a\ufffeb', 'a\u{10ffff}b']) assert.ok(F.textProblem(t, 64, 'text'), JSON.stringify(t));
  assert.strictEqual(F.textProblem('plain text', 64, 'text'), null);
});

test('a signing key of zero bytes or in shared memory is refused', () => {
  const shared = new Uint8Array(new SharedArrayBuffer(32));
  shared.set(q.generateKey());
  assert.throws(() => q.describeKey(new Uint8Array(32)));
  assert.throws(() => q.describeKey(shared));
});

test('a misspelled or unknown option of a signing call is refused and nothing is signed', () => {
  const spec = require('../lib/format').SPEC;
  const [type, t] = Object.entries(spec.types).find(([, x]) => Object.keys(x.links || {}).length === 0 && !x.chain && !x.secretParty && !x.deriveFields);
  const key = q.generateKey();
  const opts = { key, [t.time]: new Date(Date.now() - 1000).toISOString() };
  let n = 1;
  for (const [name, def] of Object.entries(t.fields || {})) {
    const kind = def[0];
    if (kind === 'text') opts[name] = 'T' + name;
    else if (kind === 'digest') opts[name] = 'ab'.repeat(32);
    else if (kind === 'currency') opts[name] = 'EUR';
    else if (kind === 'amount' || kind === 'posamount') opts[name] = '100';
    else if (kind === 'size') opts[name] = 10;
    else if (kind === 'time') opts[name] = new Date(Date.now() + 3600000 * n++).toISOString();
    else if (kind === 'key') opts[name] = q.keyId(q.generateKey());
    else if (kind === 'party') opts[name] = q.commitParty('P' + name).ref;
  }
  assert.ok(q[type](opts));
  assert.throws(() => q[type](Object.assign({}, opts, { notAnOption: 'x' })), /is not used by/);
});

test('the folder ledger refuses to run on Windows where folder owners and modes cannot be checked', () => {
  const was = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
  try {
    assert.throws(() => q.folderLedger(require('os').tmpdir()), /Windows/);
  } finally {
    Object.defineProperty(process, 'platform', was);
  }
});
