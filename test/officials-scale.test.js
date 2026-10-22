// Copyright 2026 Quantova Inc
// SPDX-License-Identifier: Apache-2.0 OR MIT

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const q = require('..');

test('an election may trust far more than sixty four presiding officer keys', async () => {
  const auth = q.generateKey();
  const officialKeys = Array.from({ length: 1000 }, () => crypto.randomBytes(32).toString('hex'));
  const r = await q.verify({ format: 'none' }, { type: 'result', network: 'testnet', requireAnchor: false, at: new Date().toISOString(), authorityKeys: [q.keyId(auth)], officialKeys });
  assert.strictEqual(r.valid, false);
  await assert.rejects(q.verify({ format: 'none' }, { type: 'result', network: 'testnet', requireAnchor: false, at: new Date().toISOString(), authorityKeys: [q.keyId(auth)], officialKeys: Array.from({ length: 100001 }, () => crypto.randomBytes(32).toString('hex')) }), /1 to 100000 trusted keys/);
});
