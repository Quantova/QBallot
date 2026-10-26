'use strict';

const crypto = require('crypto');
const test = require('node:test');
const assert = require('node:assert');
const q = require('..');
const F = require('../lib/format');
const native = require('../lib/native');
const { network, stamper, iso, failing } = require('./chain');
const { mulberry32, iterations } = require('./fuzz');

const CANDIDATES = ['alice', 'bob', 'carol', 'dave'];
const ALIKE = [['st-12-3', 'st_12_3', 'st.12.3'], ['st-1-05', 'st-1-5', 'st-1-005'], ['district-2-012', 'district-2-12'], ['zone.07.003', 'zone.7.3'], ['st-1', 'st-l', 'st-i', 'st_1', 'st.1'], ['st-0', 'st-o', 'st_0', 'st.o'], ['north-1a', 'north-la', 'north-1-a', 'north_1a']];

function rawSign(type, st, key) {
  const problem = F.statementProblem(type, st);
  if (problem) throw new Error(problem);
  const sig = native.sign(key, F.payload(type, st), crypto.randomBytes(32));
  return { format: F.FORMAT, type, algorithm: F.ALGORITHM, signer: { id: q.keyId(key), publicKey: Buffer.from(q.publicKey(key)).toString('base64') }, statement: st, signature: Buffer.from(sig).toString('base64') };
}

async function election(rng) {
  const int = (n) => Math.floor(rng() * n);
  const now = Math.floor(Date.now() / 1000);
  const net = network(now - 3 * 86400);
  const at = stamper(q, net);
  const auth = q.generateKey();
  const open = now - 2 * 86400;
  const close = open + 12 * 3600;
  const validTo = close + 6 * 3600;
  const el = await at(q.election({ key: auth, name: 'City ' + int(1e6), pollsOpen: iso(open), pollsClose: iso(close), calledAt: iso(open - 7200) }), open - 7100);
  const software = await at(q.software({ key: auth, name: 'tab', version: '1', build: Buffer.from('b'), certifiedAt: iso(open - 7100) }), open - 7000);
  const list = await at(q.contest({ key: auth, election: el, contest: 'mayor', candidates: CANDIDATES.join(','), publishedAt: iso(open - 7050) }), open - 7000);
  const officials = [];
  const station = async (name) => {
    const k = q.generateKey();
    officials.push(k);
    const m = await at(q.mandate({ key: auth, election: el, officialKeyId: q.keyId(k), office: 'po', station: name, contests: 'mayor', validFrom: iso(open - 3600), validTo: iso(validTo), issuedAt: iso(open - 3600) }), open - 3500);
    return { k, m, name };
  };
  const tallyOf = () => {
    const picked = CANDIDATES.filter(() => rng() < 0.8);
    const names = picked.length ? picked : ['alice'];
    const counts = names.map(() => int(500));
    return { text: names.map((n, i) => n + '=' + counts[i]).join(','), cast: counts.reduce((a, b) => a + b, 0) + int(20) };
  };
  const ret = async (s, signedAt, anchoredAt, tally) => {
    const t = tally || tallyOf();
    const env = q.stationReturn({ key: s.k, mandate: s.m, software, election: el, contest: 'mayor', ballotsIssued: String(t.cast + int(10)), ballotsCast: String(t.cast), tally: t.text, results: Buffer.from('r ' + s.name + ' ' + int(1e9)), signedAt: iso(signedAt) });
    return at(env, anchoredAt);
  };
  const roles = () => ({ authorityKeys: [q.keyId(auth)], officialKeys: officials.map((k) => q.keyId(k)) });
  const check = (env, type, records) => {
    net.chain.block(now);
    return q.verify(env, Object.assign({ type, at: iso(now), allSupplied: true, records }, roles(), net.opts));
  };
  return { int, net, at, auth, el, software, list, station, ret, check, open, close, validTo, now };
}

function sumOf(returns) {
  const total = new Map();
  for (const r of returns) {
    for (const pair of r.statement.tally.split(',')) {
      const [k, v] = pair.split('=');
      total.set(k, (total.get(k) || 0n) + BigInt(v));
    }
  }
  return [...total.keys()].sort().map((k) => k + '=' + total.get(k)).join(',');
}

const ROUNDS = iterations(30);

test('the declared result equals the sum of the counted station returns and a missing, extra or retallied return breaks it', async (t) => {
  const rng = mulberry32(0xba110);
  const counts = { honest: 0, dropped: 0, extra: 0, orphan: 0, retallied: 0 };
  for (let round = 0; round < ROUNDS; round += 1) {
    const e = await election(rng);
    const n = 1 + e.int(6);
    const stations = [];
    for (let i = 0; i < n; i += 1) stations.push(await e.station('s' + round + '-' + i));
    const returns = [];
    for (const s of stations) returns.push(await e.ret(s, e.close + 100 + e.int(3000), e.close + 3200));
    const result = await e.at(q.result({ key: e.auth, election: e.el, contest: 'mayor', returns, declaredAt: iso(e.close + 4000) }), e.close + 4100);
    assert.strictEqual(result.statement.tally, sumOf(returns));
    const base = [e.el, e.software, e.list].concat(stations.map((s) => s.m));
    const honest = await e.check(result, 'result', base.concat(returns));
    assert.strictEqual(honest.status, 'valid', failing(honest).join('\n'));
    counts.honest += 1;
    if (n > 1) {
      const drop = e.int(n);
      const r = await e.check(result, 'result', base.concat(returns.filter((x, i) => i !== drop)));
      assert.notStrictEqual(r.status, 'valid', 'a result verified valid with a counted return missing');
      counts.dropped += 1;
    }
    const extraStation = await e.station('s' + round + '-extra');
    const extra = await e.ret(extraStation, e.close + 200, e.close + 3200);
    const rx = await e.check(result, 'result', base.concat([extraStation.m], returns, [extra]));
    assert.notStrictEqual(rx.status, 'valid', 'a result verified valid with an extra counted return');
    counts.extra += 1;
    const ro = await e.check(result, 'result', base.concat(returns, [extra]));
    assert.notStrictEqual(ro.status, 'valid', 'a result verified valid with an extra return that has no supplied mandate');
    counts.orphan += 1;
    const st = Object.assign({}, F.parse(result).statement);
    const names = st.tally.split(',');
    const which = e.int(names.length);
    const [k, v] = names[which].split('=');
    const shifted = BigInt(v) + BigInt(1 + e.int(50)) * (BigInt(v) > 0n && e.int(2) ? -1n : 1n);
    names[which] = k + '=' + (shifted < 0n ? 0n : shifted);
    st.tally = names.join(',');
    st.resultId = crypto.randomBytes(16).toString('hex');
    if (st.tally !== result.statement.tally) {
      const forged = await e.at(rawSign('result', st, e.auth), e.close + 4100);
      const rf = await e.check(forged, 'result', base.concat(returns));
      assert.strictEqual(rf.status, 'invalid', 'a result with tally ' + st.tally + ' verified ' + rf.status + ' against returns summing to ' + sumOf(returns));
      assert.ok(rf.checks.some((c) => c.name === 'tally' && !c.ok), failing(rf).join('\n'));
      counts.retallied += 1;
    }
  }
  t.diagnostic(JSON.stringify(Object.assign({ rounds: ROUNDS }, counts)));
});

test('stations named alike are one station, a result never counts two of them and each extra mandate for the station fails', async (t) => {
  const rng = mulberry32(0x57a7);
  let groups = 0;
  for (const group of ALIKE) {
    const e = await election(rng);
    const names = group.filter(() => rng() < 0.8);
    const use = names.length >= 2 ? names : group.slice(0, 2);
    const stations = [];
    for (const name of use) stations.push(await e.station(name));
    const returns = [];
    for (const s of stations) returns.push(await e.ret(s, e.close + 300, e.close + 3200));
    assert.throws(() => q.result({ key: e.auth, election: e.el, contest: 'mayor', returns, declaredAt: iso(e.close + 4000) }), /counted only once/, use.join(' '));
    const base = [e.el, e.software, e.list].concat(stations.map((s) => s.m));
    const rm = await e.check(stations[1].m, 'mandate', base);
    assert.notStrictEqual(rm.status, 'valid', 'a second mandate for ' + use[0] + ' named ' + use[1] + ' verified ' + rm.status);
    assert.ok(rm.checks.some((c) => c.name === 'station name' && !c.ok), failing(rm).join('\n'));
    const one = await e.at(q.result({ key: e.auth, election: e.el, contest: 'mayor', returns: [returns[0]], declaredAt: iso(e.close + 4000) }), e.close + 4100);
    const r = await e.check(one, 'result', [e.el, e.software, e.list, stations[0].m, returns[0]]);
    assert.strictEqual(r.status, 'valid', failing(r).join('\n'));
    groups += 1;
  }
  t.diagnostic('lookalike station groups ' + groups);
});

test('the mandate window of a station return is judged on its anchor time, not on the time it claims', async (t) => {
  const rng = mulberry32(0x3a7d);
  const e = await election(rng);
  const s = await e.station('st-window');
  const base = [e.el, e.software, e.list, s.m];
  const counts = { inside: 0, after: 0 };
  for (let i = 0; i < iterations(80); i += 1) {
    const signedAt = e.close + e.int(e.validTo - e.close);
    const anchoredAt = Math.max(signedAt, e.validTo - 7200) + e.int(4 * 3600);
    const env = await e.ret(s, signedAt, anchoredAt);
    const r = await e.check(env, 'stationReturn', base);
    const within = r.checks.find((c) => c.name === 'anchored within mandate');
    const shown = 'signed ' + iso(signedAt) + ' anchored ' + iso(anchoredAt) + ' mandate ends ' + iso(e.validTo) + '\n' + failing(r).join('\n');
    if (anchoredAt <= e.validTo) {
      assert.strictEqual(r.status, 'valid', shown);
      counts.inside += 1;
    } else {
      assert.strictEqual(r.status, 'invalid', shown);
      assert.ok(within && !within.ok && !within.indeterminate, shown);
      counts.after += 1;
    }
  }
  assert.ok(counts.inside > 0 && counts.after > 0, JSON.stringify(counts));
  t.diagnostic(JSON.stringify(counts));
});
