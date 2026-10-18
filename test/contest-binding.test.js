// Copyright 2026 Quantova Inc
// SPDX-License-Identifier: Apache-2.0 OR MIT

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('crypto');
const q = require('..');
const F = require('../lib/format');
const native = require('../lib/native');
const { network } = require('./chain');

function signedAs(env, changes, key) {
  const statement = Object.assign({}, env.statement, changes);
  const signature = native.sign(key, F.payload(env.type, statement), new Uint8Array(crypto.randomBytes(32)));
  const out = Object.assign({}, env, { statement, signature: Buffer.from(signature).toString('base64') });
  delete out.anchor;
  return out;
}

function polls() {
  const net = network(Math.floor(Date.now() / 1000));
  const auth = q.generateKey();
  const t = (s) => new Date(Date.now() - s * 1000).toISOString();
  const election = q.election({ key: auth, name: 'Municipal 2026', pollsOpen: t(7200), pollsClose: t(3600), calledAt: t(10000) });
  const software = q.software({ key: auth, name: 'Counter', version: '1.0', buildDigest: 'c'.repeat(64), certifiedAt: t(9500) });
  const north = q.contest({ key: auth, election, contest: 'north-mayor', candidates: 'alice,bob', publishedAt: t(9400) });
  const south = q.contest({ key: auth, election, contest: 'south-mayor', candidates: 'alice,bob', publishedAt: t(9400) });
  const mandate = (official, station, contests, issued) => q.mandate({ key: auth, election, officialKeyId: q.keyId(official), office: 'presiding officer', station, contests, validFrom: t(7300), validTo: t(600), issuedAt: issued || t(8000) });
  const ret = (official, m, contest, tally, cast) => q.stationReturn({ key: official, mandate: m, software, election, contest, ballotsIssued: String(cast), ballotsCast: String(cast), tally, resultsDigest: 'd'.repeat(64), signedAt: t(3300) });
  const result = (returns) => q.result({ key: auth, election, contest: 'north-mayor', returns, declaredAt: t(900) });
  const verify = (env, records, officials, extra) => q.verify(env, Object.assign({ type: 'result', requireAnchor: false, allSupplied: true, at: new Date().toISOString(), authorityKeys: [q.keyId(auth)], officialKeys: officials.map((o) => q.keyId(o)), records }, net.opts, extra || {}));
  return { auth, t, election, software, north, south, mandate, ret, result, verify };
}

test('a return for a contest its mandate does not name is refused, and a result counting it is never valid', async () => {
  const p = polls();
  const [o1, o2, o3] = [q.generateKey(), q.generateKey(), q.generateKey()];
  const m1 = p.mandate(o1, 'north-ward-1', 'north-mayor');
  const m2 = p.mandate(o2, 'north-ward-2', 'north-mayor');
  const m3 = p.mandate(o3, 'south-ward-3', 'south-mayor');
  const r1 = p.ret(o1, m1, 'north-mayor', 'alice=600,bob=500', 1100);
  const r2 = p.ret(o2, m2, 'north-mayor', 'alice=400,bob=300', 700);
  assert.throws(() => p.ret(o3, m3, 'north-mayor', 'alice=0,bob=900', 900), /does not name the contest/);
  const foreign = signedAs(p.ret(o3, m3, 'south-mayor', 'alice=0,bob=900', 900), { contest: 'north-mayor' }, o3);
  const base = [p.election, p.software, p.north, p.south, m1, m2, m3];
  const alone = await q.verify(foreign, Object.assign({ type: 'stationReturn', requireAnchor: false, at: new Date().toISOString(), authorityKeys: [q.keyId(p.auth)], officialKeys: [q.keyId(o3)], records: base }, network(Math.floor(Date.now() / 1000)).opts));
  assert.strictEqual(alone.status, 'invalid');
  assert.ok(alone.checks.some((c) => c.name === 'contest' && !c.ok));
  const rigged = await p.verify(p.result([r1, r2, foreign]), base.concat([r1, r2, foreign]), [o1, o2, o3]);
  assert.strictEqual(rigged.valid, false);
  const honest = await p.verify(p.result([r1, r2]), base.concat([r1, r2]), [o1, o2, o3]);
  assert.strictEqual(honest.status, 'valid', JSON.stringify(honest.checks.filter((c) => !c.ok)));
});

test('a mandate issued after the polls opened is refused, and a result counting its station is never valid', async () => {
  const p = polls();
  const [o1, o3] = [q.generateKey(), q.generateKey()];
  assert.throws(() => p.mandate(o3, 'south-ward-3', 'north-mayor', p.t(1800)), /issued before the polls open/);
  const m1 = p.mandate(o1, 'north-ward-1', 'north-mayor');
  const late = signedAs(p.mandate(o3, 'south-ward-3', 'north-mayor'), { issuedAt: p.t(1800) }, p.auth);
  const r1 = p.ret(o1, m1, 'north-mayor', 'alice=600,bob=500', 1100);
  const r3 = signedAs(p.ret(o3, p.mandate(o3, 'south-ward-3', 'north-mayor'), 'north-mayor', 'alice=0,bob=900', 900), { mandateRef: F.refOf(F.parse(late)) }, o3);
  const lone = await q.verify(late, Object.assign({ type: 'mandate', requireAnchor: false, at: new Date().toISOString(), authorityKeys: [q.keyId(p.auth)], records: [p.election] }, network(Math.floor(Date.now() / 1000)).opts));
  assert.strictEqual(lone.status, 'invalid');
  assert.ok(lone.checks.some((c) => c.name === 'issued before polls' && !c.ok));
  const r = await p.verify(p.result([r1, r3]), [p.election, p.software, p.north, m1, late, r1, r3], [o1, o3]);
  assert.strictEqual(r.valid, false);
});

test('a result declared from more than two thousand records verifies valid', async () => {
  const p = polls();
  const officials = [];
  for (let i = 0; i < 60; i += 1) officials.push(q.generateKey());
  const mandates = [];
  const returns = [];
  for (let i = 0; i < 1100; i += 1) {
    const o = officials[i % officials.length];
    const m = p.mandate(o, 'ward-' + i, 'north-mayor');
    mandates.push(m);
    returns.push(p.ret(o, m, 'north-mayor', 'alice=1,bob=1', 2));
  }
  const records = [p.election, p.software, p.north].concat(mandates, returns);
  assert.ok(records.length > 2000);
  const r = await p.verify(p.result(returns), records, officials);
  assert.strictEqual(r.status, 'valid', JSON.stringify(r.checks.filter((c) => !c.ok)).slice(0, 400));
});
