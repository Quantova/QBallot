// Copyright 2026 Quantova Inc
// SPDX-License-Identifier: Apache-2.0 OR MIT

'use strict';

const crypto = require('crypto');

const RETURNS_DOMAIN = Buffer.from('quantova/qballot/returns/1', 'ascii');
const PAIR = /^([^=,]{1,64})=(0|[1-9][0-9]{0,15})$/;
const NAME = /^[^=,]{1,64}$/;
const CANDIDATES_MAX = 256;

function canonical(text) {
  try {
    return require('./format').canonicalIdentifier(text, 'a name', 64);
  } catch (e) {
    return null;
  }
}

function distinctNames(names) {
  const seen = new Set();
  for (const n of names) {
    const c = canonical(n);
    if (c === null || seen.has(c)) return false;
    seen.add(c);
  }
  return true;
}

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
  if (!distinctNames(out.keys())) return null;
  return out;
}

function candidateList(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  const list = text.split(',');
  if (list.length > CANDIDATES_MAX) return null;
  for (let i = 0; i < list.length; i += 1) {
    if (!NAME.test(list[i])) return null;
    if (i > 0 && list[i] <= list[i - 1]) return null;
  }
  return distinctNames(list) ? list : null;
}

function formatTally(map) {
  return [...map.keys()].sort().map((k) => k + '=' + map.get(k).toString()).join(',');
}

function sumTally(map) {
  let t = 0n;
  for (const v of map.values()) t += v;
  return t;
}

const ID = /^[a-z0-9]+(?:[-_.][a-z0-9]+)*$/;
const ID_MAX = 64;
const CONTESTS_MAX = 64;

function idProblem(value, what) {
  return typeof value === 'string' && value.length <= ID_MAX && ID.test(value) ? null : what + ' must be an identifier of lowercase letters and digits, joined by single hyphens, underscores or dots, at most ' + ID_MAX + ' characters';
}

function contestList(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  const list = text.split(',');
  if (list.length > CONTESTS_MAX) return null;
  for (let i = 0; i < list.length; i += 1) {
    if (idProblem(list[i], 'a contest')) return null;
    if (i > 0 && list[i] <= list[i - 1]) return null;
  }
  return distinctNames(list) ? list : null;
}

function listsOf(electionRef, contest, pool, ctx) {
  const memo = ctx.memo;
  let index = memo.get('qballot candidate lists');
  if (!index) {
    index = new Map();
    const trusted = ctx.roles.authority;
    for (const r of pool.values()) {
      if (r.type !== 'contest' || !trusted || !trusted.has(r.signerId)) continue;
      const key = r.statement.electionRef + ' ' + r.statement.contest;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(r);
    }
    memo.set('qballot candidate lists', index);
  }
  return index.get(electionRef + ' ' + contest) || [];
}

function candidateChecks(p, h) {
  const lists = listsOf(p.statement.electionRef, p.statement.contest, h.pool, h.ctx);
  const strict = h.ctx.opts.allSupplied === true;
  if (lists.length === 0) return [['candidates', false, 'the candidate list of this contest was not supplied, so the names in the tally are not shown to be candidates' + (strict ? ', although every record was declared supplied' : ''), !strict]];
  const distinct = new Set(lists.map((r) => h.F.refOf(r)));
  if (distinct.size > 1) return [['candidates', false, 'two different candidate lists were signed for this contest']];
  const names = new Set(candidateList(lists[0].statement.candidates) || []);
  const strays = [...(parseTally(p.statement.tally) || new Map()).keys()].filter((n) => !names.has(n));
  const ok = strays.length === 0;
  return [['candidates', ok, ok ? 'every name in the tally is a candidate of the signed candidate list' : strays.length + ' name in the tally is not on the signed candidate list of this contest, it may be a lookalike or a variant of a candidate']];
}

function beforeBound(h, bound, label, what, by) {
  const a = h.info.anchor;
  if (a) return [label, a.ms <= bound, a.ms <= bound ? what + ' was anchored before ' + by : what + ' was anchored after ' + by + ', so it is not proven to have been signed in time'];
  if (h.ctx.req) return [label, false, 'no anchor of ' + what + ' was proven, so it is not proven to have been signed before ' + by, true];
  return [label, true, 'not anchored, ' + what + ' is dated before ' + by + ' only by the claim of its signer'];
}

function outsideMandate(r, contest, pool, roles) {
  const m = pool.get(r.statement.mandateRef);
  if (!m || m.type !== 'mandate' || !roles.authority || !roles.authority.has(m.signerId)) return false;
  if (m.statement.electionRef !== r.statement.electionRef || m.statement.officialKeyId !== r.signerId || m.statement.station !== r.statement.station) return false;
  return !(contestList(m.statement.contests) || []).includes(contest);
}

function eligible(r, contest, pool, roles) {
  const m = pool.get(r.statement.mandateRef);
  if (!m || m.type !== 'mandate' || !roles.authority || !roles.authority.has(m.signerId)) return false;
  if (m.statement.electionRef !== r.statement.electionRef || m.statement.officialKeyId !== r.signerId || m.statement.station !== r.statement.station) return false;
  return (contestList(m.statement.contests) || []).includes(contest);
}

function counted(electionRef, contest, pool, roles) {
  const officials = roles.official;
  return [...pool.values()].filter((r) => r.type === 'stationReturn' && r.statement.electionRef === electionRef && r.statement.contest === contest && officials && officials.has(r.signerId) && eligible(r, contest, pool, roles));
}

function onceEach(returns) {
  return new Set(returns.map((r) => r.statement.mandateRef)).size === returns.length && new Set(returns.map((r) => r.statement.station)).size === returns.length;
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
  version: 2,
  recordsMax: 250000,
  roleKeysMax: 100000,
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
    contest: {
      role: 'authority', id: 'contestId', signer: 'authorityKeyId', time: 'publishedAt',
      links: { election: { field: 'electionRef', type: 'election', sameRole: true } },
      fields: { contest: ['text', 64, true], candidates: ['text', 4000, true] },
      shape: (st) => idProblem(st.contest, 'the contest') || (candidateList(st.candidates) ? null : 'candidates is a list of 1 to ' + CANDIDATES_MAX + ' names separated by commas, sorted, with no two names alike in case, spacing or lookalike characters'),
      signCheck: (st, links) => (Date.parse(st.publishedAt) > Date.parse(links.election.statement.pollsOpen) ? 'the candidate list must be published before the polls open' : null),
      verifyCheck: (p, links, h) => {
        if (!links.election) return [];
        const opens = Date.parse(links.election.statement.pollsOpen);
        const early = h.claimedMs(p) <= opens;
        return [
          ['published before polls', early, early ? 'the candidate list was published before the polls opened' : 'the candidate list was published after the polls opened'],
          beforeBound(h, opens, 'anchored before polls', 'the candidate list', 'the polls opened'),
        ];
      },
    },
    mandate: {
      role: 'authority', id: 'mandateId', signer: 'authorityKeyId', time: 'issuedAt',
      links: { election: { field: 'electionRef', type: 'election', sameRole: true } },
      fields: { officialKeyId: ['key'], office: ['text', 128, true], station: ['text', 64, true], contests: ['text', 4160, true], validFrom: ['time'], validTo: ['time'] },
      shape: (st) => {
        if (Date.parse(st.validTo) <= Date.parse(st.validFrom)) return 'a mandate must end after it begins';
        if (!contestList(st.contests)) return 'contests is a list of 1 to ' + CONTESTS_MAX + ' contest identifiers separated by commas, sorted, with no repeat';
        return idProblem(st.station, 'the station');
      },
      signCheck: (st, links) => {
        const e = links.election.statement;
        if (Date.parse(st.validTo) < Date.parse(e.pollsClose) || Date.parse(st.validFrom) > Date.parse(e.pollsOpen)) return 'a mandate must cover the polling period of its election';
        if (Date.parse(st.issuedAt) > Date.parse(e.pollsOpen)) return 'a mandate must be issued before the polls open';
        return null;
      },
      verifyCheck: (p, links, h) => {
        if (!links.election) return [];
        const e = links.election.statement;
        const opens = Date.parse(e.pollsOpen);
        const ok = Date.parse(p.statement.validFrom) <= opens && Date.parse(p.statement.validTo) >= Date.parse(e.pollsClose);
        const early = Date.parse(p.statement.issuedAt) <= opens;
        const out = [
          ['election period', ok, ok ? 'the mandate covers the polling period of its election' : 'the mandate does not cover the polling period of its election'],
          ['issued before polls', early, early ? 'the mandate was issued before the polls opened' : 'the mandate was issued after the polls opened, so its station was not open to scrutiny before the election'],
        ];
        const a = h.info.anchor;
        if (a) out.push(['anchored before polls', a.ms <= opens, a.ms <= opens ? 'the mandate was anchored before the polls opened' : 'the mandate was anchored after the polls opened, so it is not proven to have been issued before the election']);
        else if (h.ctx.req) out.push(['anchored before polls', false, 'no anchor of the mandate was proven, so it is not proven to have been issued before the polls opened', true]);
        return out;
      },
    },
    stationReturn: {
      role: 'official', id: 'returnId', signer: 'officialKeyId', time: 'signedAt',
      links: {
        mandate: { field: 'mandateRef', type: 'mandate', copy: [['station', 'station']], match: [['electionRef', 'electionRef']] },
        software: { field: 'softwareRef', type: 'software' },
        election: { field: 'electionRef', type: 'election' },
      },
      fields: { contest: ['text', 64, true], station: ['text', 64, true], ballotsIssued: ['amount'], ballotsCast: ['amount'], tally: ['text', 4000, true], resultsDigest: ['digest', 0, false, 'results'] },
      shape: (st) => {
        const id = idProblem(st.contest, 'the contest') || idProblem(st.station, 'the station');
        if (id) return id;
        const t = parseTally(st.tally);
        if (!t) return 'the tally is a list of name=count pairs separated by commas, sorted by name, with no repeated name';
        if (BigInt(st.ballotsCast) > BigInt(st.ballotsIssued)) return 'more ballots cannot be cast than were issued';
        if (sumTally(t) > BigInt(st.ballotsCast)) return 'the tally cannot exceed the ballots cast';
        return null;
      },
      signCheck: (st, links) => {
        const m = links.mandate.statement;
        if (st.officialKeyId !== m.officialKeyId) return 'only the official named in the mandate can sign this return';
        if (!(contestList(m.contests) || []).includes(st.contest)) return 'the mandate does not name the contest ' + st.contest + ' for this station';
        if (Date.parse(st.signedAt) < Date.parse(m.validFrom) || Date.parse(st.signedAt) > Date.parse(m.validTo)) return 'the return must be signed within the period of the mandate';
        if (Date.parse(st.signedAt) < Date.parse(links.election.statement.pollsClose)) return 'a return can be signed only after the polls close';
        return null;
      },
      gather: (p, pool, h) => listsOf(p.statement.electionRef, p.statement.contest, pool, h.ctx).map((r) => ['candidate list', r]),
      verifyCheck: (p, links, h) => {
        if (!links.mandate) return candidateChecks(p, h);
        const m = links.mandate.statement;
        const who = p.signerId === m.officialKeyId;
        const when = Date.parse(p.statement.signedAt) >= Date.parse(m.validFrom) && Date.parse(p.statement.signedAt) <= Date.parse(m.validTo);
        const inContest = (contestList(m.contests) || []).includes(p.statement.contest);
        const out = [
          ['mandate holder', who, who ? 'signed by the official named in the mandate' : 'signed by a key other than the official named in the mandate'],
          ['mandate period', when, when ? 'signed within the period of the mandate' : 'signed outside the period of the mandate'],
          beforeBound(h, Date.parse(m.validTo), 'anchored within mandate', 'the return', 'its mandate ended'),
          ['contest', inContest, inContest ? 'the mandate names this contest for the station' : 'the mandate does not name this contest for the station'],
        ].concat(candidateChecks(p, h));
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
      fields: { contest: ['text', 64, true], tally: ['text', 4000, true], returnsDigest: ['digest'], returnsCount: ['posamount'] },
      shape: (st) => idProblem(st.contest, 'the contest') || (parseTally(st.tally) ? null : 'the tally is a list of name=count pairs separated by commas, sorted by name, with no repeated name'),
      deriveFields: ['tally', 'returnsDigest', 'returnsCount'],
      deriveInputs: { returns: 'Envelope[]' },
      derive: (options, links, h) => {
        if (options.returns === undefined) return {};
        if (!Array.isArray(options.returns) || options.returns.length === 0 || options.returns.length > 100000) h.F.reject('returns is a list of the certified station return envelopes');
        const parsed = options.returns.map((e) => h.F.parse(e));
        if (parsed.some((r) => r.type !== 'stationReturn' || !h.signatureOk(r))) h.F.reject('returns may hold only validly signed station return envelopes');
        const electionRef = h.F.refOf(links.election);
        if (parsed.some((r) => r.statement.electionRef !== electionRef || r.statement.contest !== options.contest)) h.F.reject('every return must belong to the election and contest of the result');
        if (!onceEach(parsed)) h.F.reject('a station can be counted only once, two returns share a mandate or a station');
        const s = summarise(parsed, h.F.refOf);
        if (!s) h.F.reject('a return was given twice');
        return s;
      },
      gather: (p, pool, h) => listsOf(p.statement.electionRef, p.statement.contest, pool, h.ctx).map((r) => ['candidate list', r]).concat(counted(p.statement.electionRef, p.statement.contest, pool, h.ctx.roles).map((r) => ['counted return ' + r.statement.station, r])),
      verifyCheck: (p, links, h) => {
        const returns = counted(p.statement.electionRef, p.statement.contest, h.pool, h.ctx.roles);
        const out = [];
        const officials = h.ctx.roles.official;
        const orphans = [...h.pool.values()].filter((r) => r.type === 'stationReturn' && r.statement.electionRef === p.statement.electionRef && r.statement.contest === p.statement.contest && officials && officials.has(r.signerId) && !eligible(r, p.statement.contest, h.pool, h.ctx.roles));
        const outside = orphans.filter((r) => outsideMandate(r, p.statement.contest, h.pool, h.ctx.roles));
        const unknown = orphans.length - outside.length;
        if (outside.length) {
          out.push(['returns outside a mandate', true, outside.length + ' return of this contest signed by a trusted official is not covered by the mandate of its station, so it is rightly left out', false, outside.length + ' return of this contest was signed by a trusted official outside the mandate of its station and was not counted']);
        }
        if (unknown) {
          out.push(['uncounted returns', false, unknown + ' return of this contest signed by a trusted official has no supplied mandate of the authority for its station, so the result cannot be shown to include or rightly exclude it', h.ctx.opts.allSupplied !== true]);
        }
        if (returns.length === 0) {
          out.push(['returns', false, 'the certified returns of this contest were not supplied', h.ctx.opts.allSupplied !== true]);
          return out;
        }
        if (!onceEach(returns)) out.push(['station once', false, 'two returns of this contest share a mandate or a station, so a station would be counted twice']);
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
        out.push(...candidateChecks(p, h));
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
      if (!onceEach(parsed)) F.reject('a station can be counted only once, two returns share a mandate or a station');
      const s = summarise(parsed, F.refOf);
      if (!s) F.reject('a return was given twice');
      return s;
    },
  }),
});
