// Copyright 2026 Quantova Inc
// SPDX-License-Identifier: Apache-2.0 OR MIT

'use strict';

const crypto = require('crypto');

const RETURNS_DOMAIN = Buffer.from('quantova/qballot/returns/1', 'ascii');
const PAIR = /^([^=,]{1,64})=(0|[1-9][0-9]{0,15})$/;

function parseTally(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  const out = new Map();
  let last = null;
  for (const pair of text.split(',')) {
    const m = PAIR.exec(pair);
    if (!m) return null;
    if (last !== null && m[1] <= last) return null;
    last = m[1];
    out.set(m[1], BigInt(m[2]));
  }
  return out;
}

function formatTally(map) {
  return [...map.keys()].sort().map((k) => k + '=' + map.get(k).toString()).join(',');
}

function sumTally(map) {
  let t = 0n;
  for (const v of map.values()) t += v;
  return t;
}

const stationKey = (s) => s.trim().replace(/\s+/g, ' ').toLowerCase();
const stationProblem = (s) => (s !== s.trim() || /\s{2,}/.test(s) ? 'a station name must have no leading, trailing or repeated spaces' : null);

function counted(electionRef, contest, pool, roles) {
  const officials = roles.official;
  return [...pool.values()].filter((r) => r.type === 'stationReturn' && r.statement.electionRef === electionRef && r.statement.contest === contest && officials && officials.has(r.signerId));
}

function summarise(returns, refOf) {
  const refs = returns.map(refOf).sort();
  if (new Set(refs).size !== refs.length) return null;
  const h = crypto.createHash('sha3-256').update(RETURNS_DOMAIN).update(Buffer.from([0]));
  for (const r of refs) h.update(Buffer.from(r, 'hex'));
  const total = new Map();
  for (const r of returns) {
    for (const [k, v] of parseTally(r.statement.tally)) total.set(k, (total.get(k) || 0n) + v);
  }
  return { returnsDigest: h.digest('hex'), returnsCount: String(refs.length), tally: formatTally(total) };
}

module.exports = Object.freeze({
  name: 'qballot',
  title: 'QBallot',
  kind: 1106,
  magic: 'QBAL',
  summary: 'post quantum election integrity without revealing any vote',
  roles: {
    authority: 'election authority key',
    official: 'presiding or returning officer key',
    witness: 'appointed witness key',
    count: 'counting centre key',
    tabulator: 'tabulation system key',
  },
  types: {
    election: {
      role: 'authority', id: 'electionId', signer: 'authorityKeyId', time: 'calledAt',
      fields: { name: ['text', 128, true], pollsOpen: ['time'], pollsClose: ['time'] },
      shape: (st) => (Date.parse(st.pollsClose) <= Date.parse(st.pollsOpen) ? 'the polls must close after they open' : null),
    },
    software: {
      role: 'authority', id: 'softwareId', signer: 'authorityKeyId', time: 'certifiedAt',
      fields: { name: ['text', 128, true], version: ['text', 64, true], buildDigest: ['digest', 0, false, 'build'] },
    },
    mandate: {
      role: 'authority', id: 'mandateId', signer: 'authorityKeyId', time: 'issuedAt',
      links: { election: { field: 'electionRef', type: 'election', sameRole: true } },
      fields: { officialKeyId: ['key'], office: ['text', 128, true], station: ['text', 128, true], validFrom: ['time'], validTo: ['time'] },
      shape: (st) => (Date.parse(st.validTo) <= Date.parse(st.validFrom) ? 'a mandate must end after it begins' : stationProblem(st.station)),
      signCheck: (st, links) => (Date.parse(st.validTo) < Date.parse(links.election.statement.pollsClose) || Date.parse(st.validFrom) > Date.parse(links.election.statement.pollsOpen) ? 'a mandate must cover the polling period of its election' : null),
      verifyCheck: (p, links) => {
        if (!links.election) return [];
        const e = links.election.statement;
        const ok = Date.parse(p.statement.validFrom) <= Date.parse(e.pollsOpen) && Date.parse(p.statement.validTo) >= Date.parse(e.pollsClose);
        return [['election period', ok, ok ? 'the mandate covers the polling period of its election' : 'the mandate does not cover the polling period of its election']];
      },
    },
    stationReturn: {
      role: 'official', id: 'returnId', signer: 'officialKeyId', time: 'signedAt',
      links: {
        mandate: { field: 'mandateRef', type: 'mandate', copy: [['station', 'station']], match: [['electionRef', 'electionRef']] },
        software: { field: 'softwareRef', type: 'software' },
        election: { field: 'electionRef', type: 'election' },
      },
      fields: { contest: ['text', 128, true], station: ['text', 128, true], ballotsIssued: ['amount'], ballotsCast: ['amount'], tally: ['text', 4000, true], resultsDigest: ['digest', 0, false, 'results'] },
      shape: (st) => {
        const t = parseTally(st.tally);
        if (!t) return 'the tally is a list of name=count pairs separated by commas, sorted by name, with no repeated name';
        if (BigInt(st.ballotsCast) > BigInt(st.ballotsIssued)) return 'more ballots cannot be cast than were issued';
        if (sumTally(t) > BigInt(st.ballotsCast)) return 'the tally cannot exceed the ballots cast';
        return null;
      },
      signCheck: (st, links) => {
        const m = links.mandate.statement;
        if (st.officialKeyId !== m.officialKeyId) return 'only the official named in the mandate can sign this return';
        if (Date.parse(st.signedAt) < Date.parse(m.validFrom) || Date.parse(st.signedAt) > Date.parse(m.validTo)) return 'the return must be signed within the period of the mandate';
        if (Date.parse(st.signedAt) < Date.parse(links.election.statement.pollsClose)) return 'a return can be signed only after the polls close';
        return null;
      },
      verifyCheck: (p, links) => {
        if (!links.mandate) return [];
        const m = links.mandate.statement;
        const who = p.signerId === m.officialKeyId;
        const when = Date.parse(p.statement.signedAt) >= Date.parse(m.validFrom) && Date.parse(p.statement.signedAt) <= Date.parse(m.validTo);
        const out = [
          ['mandate holder', who, who ? 'signed by the official named in the mandate' : 'signed by a key other than the official named in the mandate'],
          ['mandate period', when, when ? 'signed within the period of the mandate' : 'signed outside the period of the mandate'],
        ];
        if (links.election) {
          const after = Date.parse(p.statement.signedAt) >= Date.parse(links.election.statement.pollsClose);
          out.push(['polls closed', after, after ? 'signed after the polls closed' : 'signed before the polls closed']);
        }
        return out;
      },
    },
    witness: {
      role: 'witness', id: 'witnessId', signer: 'witnessKeyId', time: 'signedAt',
      links: { stationReturn: { field: 'returnRef', type: 'stationReturn' } },
      fields: {},
    },
    batch: {
      role: 'count', id: 'batchId', signer: 'countKeyId', time: 'sealedAt',
      links: { stationReturn: { field: 'returnRef', type: 'stationReturn' } },
      fields: { batchRoot: ['digest'], ballots: ['posamount'] },
      chain: { scope: 'returnRef', prev: 'prevBatchRef', total: 'ballotsTotal', amount: 'ballots', cap: ['stationReturn', 'ballotsCast'] },
    },
    entry: {
      role: 'tabulator', id: 'entryId', signer: 'tabulatorKeyId', time: 'recordedAt',
      links: { software: { field: 'softwareRef', type: 'software' } },
      fields: { action: ['text', 128, true], subjectRef: ['optref'], detailDigest: ['digest', 0, false, 'detail'] },
      chain: { scope: 'softwareRef', prev: 'prevEntryRef' },
    },
    result: {
      role: 'authority', id: 'resultId', signer: 'authorityKeyId', time: 'declaredAt',
      links: { election: { field: 'electionRef', type: 'election', sameRole: true } },
      fields: { contest: ['text', 128, true], tally: ['text', 4000, true], returnsDigest: ['digest'], returnsCount: ['posamount'] },
      shape: (st) => (parseTally(st.tally) ? null : 'the tally is a list of name=count pairs separated by commas, sorted by name, with no repeated name'),
      deriveFields: ['tally', 'returnsDigest', 'returnsCount'],
      deriveInputs: { returns: 'Envelope[]' },
      derive: (options, links, h) => {
        if (options.returns === undefined) return {};
        if (!Array.isArray(options.returns) || options.returns.length === 0 || options.returns.length > 100000) h.F.reject('returns is a list of the certified station return envelopes');
        const parsed = options.returns.map((e) => h.F.parse(e));
        if (parsed.some((r) => r.type !== 'stationReturn' || !h.signatureOk(r))) h.F.reject('returns may hold only validly signed station return envelopes');
        const electionRef = h.F.refOf(links.election);
        if (parsed.some((r) => r.statement.electionRef !== electionRef || r.statement.contest !== options.contest)) h.F.reject('every return must belong to the election and contest of the result');
        if (new Set(parsed.map((r) => r.statement.mandateRef)).size !== parsed.length || new Set(parsed.map((r) => stationKey(r.statement.station))).size !== parsed.length) h.F.reject('a station can be counted only once, two returns share a mandate or a station');
        const s = summarise(parsed, h.F.refOf);
        if (!s) h.F.reject('a return was given twice');
        return s;
      },
      gather: (p, pool, h) => counted(p.statement.electionRef, p.statement.contest, pool, h.ctx.roles).map((r) => ['counted return ' + r.statement.station, r]),
      verifyCheck: (p, links, h) => {
        const returns = counted(p.statement.electionRef, p.statement.contest, h.pool, h.ctx.roles);
        if (returns.length === 0) return [['returns', false, 'the certified returns of this contest were not supplied', true]];
        const out = [];
        const mandates = new Set(returns.map((r) => r.statement.mandateRef));
        const stations = new Set(returns.map((r) => stationKey(r.statement.station)));
        if (mandates.size !== returns.length || stations.size !== returns.length) out.push(['station once', false, 'two returns of this contest share a mandate or a station, so a station would be counted twice']);
        const declared = h.claimedMs(p);
        const selfAnchor = h.info.anchor;
        const late = returns.filter((r) => {
          if (h.claimedMs(r) > declared) return true;
          const a = h.anchorOf(r);
          return !!(a && selfAnchor && a.ms > selfAnchor.ms);
        });
        if (late.length) out.push(['return timing', false, late.length + ' counted return is dated or anchored after the result was declared']);
        const s = summarise(returns, h.F.refOf);
        const sameSet = s && s.returnsDigest === p.statement.returnsDigest && s.returnsCount === p.statement.returnsCount;
        out.push(['returns', sameSet, sameSet ? 'the ' + s.returnsCount + ' supplied returns of this contest are exactly the returns the result was declared from' : 'the supplied returns of this contest are not the set the result was declared from', !sameSet && h.ctx.opts.allSupplied !== true]);
        if (sameSet) {
          const same = s.tally === p.statement.tally;
          out.push(['tally', same, same ? 'the declared result equals the sum of the certified returns' : 'the declared result differs from the sum of the certified returns']);
        }
        if (h.ctx.opts.allSupplied !== true) out.push(['completeness', false, 'the verifier did not declare that every return held for this contest was supplied', true]);
        else out.push(['completeness', true, 'the verifier declared that every return held for this contest was supplied']);
        return out;
      },
    },
  },
  dts: 'export function summariseReturns(returns: Envelope[]): { tally: string; returnsDigest: string; returnsCount: string };',
  commands: {
    'summarise-returns': {
      usage: '<station return>...',
      flags: [],
      values: [],
      async run(positional, flags, h) {
        if (positional.length === 0) throw h.usageError('summarise-returns takes the certified station return envelopes');
        const envs = positional.map((f) => h.readJson(f, 'station return', true));
        process.stdout.write(h.asciiJson(h.qx.summariseReturns(envs)) + '\n');
        return 0;
      },
    },
  },
  extras: ({ F, C }) => ({
    summariseReturns(returns) {
      if (!Array.isArray(returns) || returns.length === 0) F.reject('returns is a list of return envelopes');
      const parsed = returns.map((e) => F.parse(e));
      if (parsed.some((r) => r.type !== 'stationReturn' || !C.signatureOk(r))) F.reject('returns may hold only validly signed station return envelopes');
      if (new Set(parsed.map((r) => r.statement.mandateRef)).size !== parsed.length || new Set(parsed.map((r) => stationKey(r.statement.station))).size !== parsed.length) F.reject('a station can be counted only once, two returns share a mandate or a station');
      const s = summarise(parsed, F.refOf);
      if (!s) F.reject('a return was given twice');
      return s;
    },
  }),
});
