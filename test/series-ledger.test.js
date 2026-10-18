// Copyright 2026 Quantova Inc
// SPDX-License-Identifier: Apache-2.0 OR MIT

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');
const { honest } = require('./honest');

const dirs = [];
test.after(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

function folder() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'qballot-series-'));
  dirs.push(d);
  return d;
}

const refused = (e) => e.code === 'QBALLOT_LEDGER';

test('with a ledger the ballot batches of a station return are sealed in one series', async () => {
  const w = await honest();
  const { q, K, all } = w;
  const dir = folder();
  const at = all.batch.statement.sealedAt;
  const seal = (ballots, more) => q.batch(Object.assign({ key: K.count, stationReturn: all.stationReturn, batchRoot: 'cd'.repeat(32), ballots, sealedAt: at, ledger: dir }, more));
  const results = await Promise.allSettled([seal('40', { first: true }), seal('50', { first: true })]);
  assert.strictEqual(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.ok(refused(results.find((r) => r.status === 'rejected').reason));
});

test('with a ledger a tabulation log continues only from its latest entry', async () => {
  const w = await honest();
  const { q, K, all } = w;
  const dir = folder();
  const at = all.entry.statement.recordedAt;
  const log = (action, more) => q.entry(Object.assign({ key: K.tabulator, software: all.software, action, detail: Buffer.from(action), recordedAt: at, ledger: dir }, more));
  const e1 = await log('load', { first: true });
  const e2 = await log('count', { previous: e1 });
  await assert.rejects(log('recount', { previous: e1 }), refused);
  await assert.rejects(log('again', { first: true }), refused);
  assert.deepStrictEqual(await q.ledgerLatest(dir, 'entry', q.refOf(all.software)), e2);
});
