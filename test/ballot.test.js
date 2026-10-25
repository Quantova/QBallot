// Copyright 2026 Quantova Inc
// SPDX-License-Identifier: Apache-2.0 OR MIT

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const q = require('..');
const { network, stamper, iso, failing } = require('./chain');

async function election(stations, opts) {
  const o = opts || {};
  const now = Math.floor(Date.now() / 1000);
  const net = network(now - 3 * 86400);
  const at = stamper(q, net);
  const auth = q.generateKey();
  const officials = [];
  for (let i = 0; i < stations; i += 1) officials.push(q.generateKey());
  const open = now - 2 * 86400;
  const close = open + 12 * 3600;
  const validTo = close + 6 * 3600;
  const [el, software] = await at([q.election({ key: auth, name: 'Mayor 2026', pollsOpen: iso(open), pollsClose: iso(close), calledAt: iso(open - 7200) }), q.software({ key: auth, name: 'tab', version: '1', build: Buffer.from('b'), certifiedAt: iso(open - 7100) })], open - 7000);
  const list = await at(q.contest({ key: auth, election: el, contest: 'mayor', candidates: 'alice,bob', publishedAt: iso(open - 7050) }), open - 7000);
  const mandates = await at(officials.map((k, i) => q.mandate({ key: auth, election: el, officialKeyId: q.keyId(k), office: 'po', station: o.stations ? o.stations[i] : 'st-' + i, contests: 'mayor', validFrom: iso(open - 3600), validTo: iso(validTo), issuedAt: iso(open - 3600) })), open - 3500);
  const unsigned = officials.map((k, i) => q.stationReturn({ key: k, mandate: mandates[i], software, election: el, contest: 'mayor', ballotsIssued: '100', ballotsCast: '90', tally: o.tally || 'alice=50,bob=40', results: Buffer.from('r' + i), signedAt: iso(close + 600) }));
  const returns = o.single ? [] : await at(unsigned, close + 700);
  if (o.single) for (const r of unsigned) returns.push(await at(r, close + 700));
  const result = await at(q.result({ key: auth, election: el, contest: 'mayor', returns, declaredAt: iso(close + 3600) }), close + 3700);
  net.chain.block(now);
  const roles = { authorityKeys: [q.keyId(auth)], officialKeys: officials.map((k) => q.keyId(k)) };
  const base = [el, software, list].concat(mandates);
  return { net, at, auth, officials, el, software, list, mandates, unsigned, returns, result, roles, base, open, close, validTo, now };
}

test('an honest result stays valid when re-anchors and junk receipts are added in any order', async () => {
  const e = await election(2);
  const bare = Object.assign({}, e.returns[0]);
  delete bare.anchor;
  const late = await e.at(bare, e.close + 7200);
  e.net.chain.block(e.now);
  const junk = [0, 1, 2].map((i) => Object.assign({}, e.returns[1], { anchor: { junk: i } }));
  const orders = [e.returns, [late].concat(e.returns), e.returns.concat([late]), junk.concat([late], e.returns.slice().reverse()), [late].concat(junk, e.returns)];
  for (const extra of orders) {
    const r = await q.verify(e.result, Object.assign({ type: 'result', allSupplied: true, records: e.base.concat(extra) }, e.roles, e.net.opts));
    assert.strictEqual(r.status, 'valid', failing(r).join('\n'));
  }
});

test('stations whose identifiers differ only in separators, leading zeros or similar letters are one station and are never counted twice', async () => {
  for (const names of [['station-012', 'station_12'], ['st-1', 'st-l'], ['st-0', 'st-o']]) {
    await assert.rejects(election(2, { stations: names }), /counted only once/, names.join(' '));
  }
});

test('a return anchored after its mandate ended is invalid', async () => {
  const e = await election(1);
  const ret = q.stationReturn({ key: e.officials[0], mandate: e.mandates[0], software: e.software, election: e.el, contest: 'mayor', ballotsIssued: '100', ballotsCast: '90', tally: 'alice=50,bob=40', results: Buffer.from('x'), signedAt: iso(e.validTo - 60) });
  const late = await e.at(ret, e.validTo + 20 * 3600);
  e.net.chain.block(e.now);
  const r = await q.verify(late, Object.assign({ type: 'stationReturn', records: e.base }, e.roles, e.net.opts));
  assert.strictEqual(r.status, 'invalid', failing(r).join('\n'));
  assert.ok(r.checks.some((c) => c.name === 'anchored within mandate' && !c.ok && !c.indeterminate));
  const honest = await q.verify(e.returns[0], Object.assign({ type: 'stationReturn', records: e.base }, e.roles, e.net.opts));
  assert.strictEqual(honest.status, 'valid', failing(honest).join('\n'));
});

test('a return that is not anchored is not proven to fall within its mandate', async () => {
  const e = await election(1);
  const r = await q.verify(e.unsigned[0], Object.assign({ type: 'stationReturn', records: e.base }, e.roles, e.net.opts));
  assert.strictEqual(r.status, 'indeterminate', failing(r).join('\n'));
  assert.ok(r.checks.some((c) => c.name === 'anchored within mandate' && c.indeterminate));
});

test('lookalike or case variant names are refused in tallies and candidate lists', async () => {
  const e = await election(1);
  for (const tally of ['Alice=40,alice=50', 'alice=50,аlice=40', 'alice=50,alıce=1']) {
    assert.throws(() => q.stationReturn({ key: e.officials[0], mandate: e.mandates[0], software: e.software, election: e.el, contest: 'mayor', ballotsIssued: '100', ballotsCast: '90', tally, results: Buffer.from('x'), signedAt: iso(e.close + 600) }));
  }
  for (const candidates of ['Alice,alice', 'alice,аlice', 'bob,b0b']) {
    assert.throws(() => q.contest({ key: e.auth, election: e.el, contest: 'mayor', candidates, publishedAt: iso(e.open - 7050) }));
  }
});

test('a tally name that is not on the signed candidate list makes the result invalid', async () => {
  const e = await election(1, { tally: 'alice=50,bоb=40' });
  const r = await q.verify(e.result, Object.assign({ type: 'result', allSupplied: true, records: e.base.concat(e.returns) }, e.roles, e.net.opts));
  assert.strictEqual(r.status, 'invalid', failing(r).join('\n'));
  assert.ok(r.checks.some((c) => c.name === 'candidates' && !c.ok));
});

test('the candidate list must be supplied and unique', async () => {
  const e = await election(1);
  const without = e.base.filter((x) => x !== e.list);
  const open = await q.verify(e.result, Object.assign({ type: 'result', records: without.concat(e.returns) }, e.roles, e.net.opts));
  assert.strictEqual(open.status, 'indeterminate', failing(open).join('\n'));
  const strict = await q.verify(e.result, Object.assign({ type: 'result', allSupplied: true, records: without.concat(e.returns) }, e.roles, e.net.opts));
  assert.strictEqual(strict.status, 'invalid', failing(strict).join('\n'));
  const second = await e.at(q.contest({ key: e.auth, election: e.el, contest: 'mayor', candidates: 'alice,bob,carol', publishedAt: iso(e.open - 7040) }), e.open - 7000);
  e.net.chain.block(e.now);
  const two = await q.verify(e.result, Object.assign({ type: 'result', allSupplied: true, records: e.base.concat([second], e.returns) }, e.roles, e.net.opts));
  assert.strictEqual(two.status, 'invalid', failing(two).join('\n'));
});

test('anchor lookups are shared within a batch and bounded on request', async () => {
  const e = await election(30);
  e.net.chain.reads = 0;
  const r = await q.verify(e.result, Object.assign({ type: 'result', allSupplied: true, records: e.base.concat(e.returns) }, e.roles, e.net.opts));
  assert.strictEqual(r.status, 'valid', failing(r).join('\n'));
  assert.ok(e.net.chain.reads < 60, 'read the chain ' + e.net.chain.reads + ' times');
  const bounded = await q.verify(e.result, Object.assign({ type: 'result', allSupplied: true, records: e.base.concat(e.returns), maxAnchorLookups: 3 }, e.roles, e.net.opts));
  assert.strictEqual(bounded.status, 'indeterminate', failing(bounded).join('\n'));
  assert.ok(bounded.checks.some((c) => /maxAnchorLookups/.test(c.detail)));
});

test('separately anchored returns stay within a raised bound', async () => {
  const e = await election(6, { single: true });
  const low = await q.verify(e.result, Object.assign({ type: 'result', allSupplied: true, records: e.base.concat(e.returns), maxAnchorLookups: 5 }, e.roles, e.net.opts));
  assert.strictEqual(low.status, 'indeterminate', failing(low).join('\n'));
  const high = await q.verify(e.result, Object.assign({ type: 'result', allSupplied: true, records: e.base.concat(e.returns), maxAnchorLookups: 50 }, e.roles, e.net.opts));
  assert.strictEqual(high.status, 'valid', failing(high).join('\n'));
});
