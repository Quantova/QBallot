'use strict';

const q = require('..');
const { network, stamper, iso } = require('./chain');

async function honest() {
  const now = Math.floor(Date.now() / 1000);
  const net = network(now - 3 * 86400);
  const at = stamper(q, net);
  const K = {};
  for (const r of q.ROLES) K[r] = q.generateKey();
  const official2 = q.generateKey();
  const open = now - 2 * 86400;
  const close = open + 12 * 3600;
  const election = await at(q.election({ key: K.authority, name: 'Mayor 2026', pollsOpen: iso(open), pollsClose: iso(close), calledAt: iso(open - 7200) }), open - 7100);
  const software = await at(q.software({ key: K.authority, name: 'tab', version: '1', build: Buffer.from('b'), certifiedAt: iso(open - 7100) }), open - 7000);
  const contest = await at(q.contest({ key: K.authority, election, contest: 'mayor', candidates: 'alice,bob', publishedAt: iso(open - 7050) }), open - 7000);
  const mandates = [];
  for (const [i, k] of [K.official, official2].entries()) mandates.push(await at(q.mandate({ key: K.authority, election, officialKeyId: q.keyId(k), office: 'po', station: 'st-' + i, contests: 'mayor', validFrom: iso(open - 3600), validTo: iso(close + 6 * 3600), issuedAt: iso(open - 3600) }), open - 3500));
  const returns = [];
  for (const [i, k] of [K.official, official2].entries()) returns.push(await at(q.stationReturn({ key: k, mandate: mandates[i], software, election, contest: 'mayor', ballotsIssued: '100', ballotsCast: '90', tally: 'alice=' + (50 - i) + ',bob=' + (40 + i), results: Buffer.from('r' + i), signedAt: iso(close + 600) }), close + 700));
  const witness = await at(q.witness({ key: K.witness, stationReturn: returns[0], signedAt: iso(close + 800) }), close + 900);
  const batch = await at(q.batch({ key: K.count, stationReturn: returns[0], batchRoot: 'ab'.repeat(32), ballots: '90', first: true, sealedAt: iso(close + 1000) }), close + 1100);
  const entry = await at(q.entry({ key: K.tabulator, software, action: 'tabulate mayor', detail: Buffer.from('log'), first: true, recordedAt: iso(close + 1200) }), close + 1300);
  const result = await at(q.result({ key: K.authority, election, contest: 'mayor', returns, declaredAt: iso(close + 3600) }), close + 3700);
  net.chain.block(now);
  const roles = Object.fromEntries(Object.entries(K).map(([r, k]) => [r + 'Keys', [q.keyId(k)]]));
  roles.officialKeys = [q.keyId(K.official), q.keyId(official2)];
  const all = { election, software, contest, mandate: mandates[0], stationReturn: returns[0], witness, batch, entry, result };
  return { q, net, now, K, roles, at, all, extra: [mandates[1], returns[1]] };
}

module.exports = { honest };
