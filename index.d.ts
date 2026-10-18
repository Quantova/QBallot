// Copyright 2026 Quantova Inc
// SPDX-License-Identifier: Apache-2.0 OR MIT

export type RecordType = 'election' | 'software' | 'contest' | 'mandate' | 'stationReturn' | 'witness' | 'batch' | 'entry' | 'result';
export type Role = 'authority' | 'official' | 'witness' | 'count' | 'tabulator';

export interface Envelope {
  format: 'qballot/2';
  type: RecordType;
  algorithm: 'ML-DSA-65';
  signer: { id: string; publicKey: string };
  statement: Record<string, unknown>;
  signature: string;
  anchor?: unknown;
}

export interface KeyDescription {
  format: 'qballot-key/1';
  algorithm: 'ML-DSA-65';
  id: string;
  publicKey: string;
}

export type KeyRef = string | Uint8Array | KeyDescription;

export interface ElectionOptions {
  key: Uint8Array;
  name: string;
  pollsOpen: string;
  pollsClose: string;
  calledAt?: string;
  note?: string;
}

export interface SoftwareOptions {
  key: Uint8Array;
  name: string;
  version: string;
  buildDigest?: string;
  build?: Uint8Array;
  certifiedAt?: string;
  note?: string;
}

export interface ContestOptions {
  key: Uint8Array;
  election: Envelope;
  contest: string;
  candidates: string;
  publishedAt?: string;
  note?: string;
}

export interface MandateOptions {
  key: Uint8Array;
  election: Envelope;
  officialKeyId: KeyRef;
  office: string;
  station: string;
  contests: string;
  validFrom: string;
  validTo: string;
  issuedAt?: string;
  note?: string;
}

export interface StationReturnOptions {
  key: Uint8Array;
  mandate: Envelope;
  software: Envelope;
  election: Envelope;
  contest: string;
  station?: string;
  ballotsIssued: string;
  ballotsCast: string;
  tally: string;
  resultsDigest?: string;
  results?: Uint8Array;
  signedAt?: string;
  note?: string;
}

export interface WitnessOptions {
  key: Uint8Array;
  stationReturn: Envelope;
  signedAt?: string;
  note?: string;
}

export interface BatchOptions {
  key: Uint8Array;
  stationReturn: Envelope;
  batchRoot: string;
  ballots: string;
  previous?: Envelope;
  first?: boolean;
  sealedAt?: string;
  note?: string;
}

export interface EntryOptions {
  key: Uint8Array;
  software: Envelope;
  action: string;
  subjectRef?: string;
  detailDigest?: string;
  detail?: Uint8Array;
  previous?: Envelope;
  first?: boolean;
  recordedAt?: string;
  note?: string;
}

export interface ResultOptions {
  key: Uint8Array;
  election: Envelope;
  contest: string;
  tally?: string;
  returnsDigest?: string;
  returnsCount?: string;
  returns?: Envelope[];
  declaredAt?: string;
  note?: string;
}

export type KeyStatus = { revoked: false } | { revoked: true; revokedAt: number };

export interface VerifyOptions {
  type: RecordType;
  authorityKeys?: KeyRef[];
  officialKeys?: KeyRef[];
  witnessKeys?: KeyRef[];
  countKeys?: KeyRef[];
  tabulatorKeys?: KeyRef[];
  records?: Envelope[];
  allSupplied?: boolean;
  party?: { field: string; identity: string; salt: Uint8Array };
  buildDigest?: string;
  build?: Uint8Array;
  resultsDigest?: string;
  results?: Uint8Array;
  detailDigest?: string;
  detail?: Uint8Array;
  requireAnchor?: boolean;
  at?: string;
  maxAnchorDelay?: number;
  maxAnchorLookups?: number;
  deadlineMs?: number;
  keyStatus?: (keyId: string) => KeyStatus | Promise<KeyStatus>;
  keyStatusTimeoutMs?: number;
  rpc?: string | string[];
  client?: unknown;
  clients?: Array<string | unknown>;
  trustSingleEndpoint?: boolean;
  trustCustomEndpoints?: boolean;
  allowLoopback?: boolean;
  endpointAllowList?: string[];
  expectedSender?: string | string[];
  contract?: string;
  trustCustomContract?: boolean;
}

export interface VerifyCheck {
  name: string;
  ok: boolean;
  detail: string;
  transport: boolean;
  indeterminate: boolean;
}

export interface VerifyResult {
  valid: boolean;
  status: 'valid' | 'invalid' | 'indeterminate';
  type: RecordType | null;
  checks: VerifyCheck[];
  endpoints: string[];
  officialEndpoints: boolean | null;
  notices: string[];
  facts: Record<string, unknown>;
  [field: string]: unknown;
}

export interface AnchorOptions {
  seed: Uint8Array;
  index: number;
  network?: 'testnet';
  rpc?: string | string[];
  client?: unknown;
  clients?: Array<string | unknown>;
  trustSingleEndpoint?: boolean;
  allowLoopback?: boolean;
  endpointAllowList?: string[];
  meter?: number;
  maxFee?: string | number;
  timeoutMs?: number;
  onPending?: (pending: unknown) => void | Promise<void>;
}

export function generateKey(): Uint8Array;
export function publicKey(key: Uint8Array): Uint8Array;
export function keyId(key: Uint8Array): string;
export function describeKey(key: Uint8Array): KeyDescription;
export function commitParty(identity: string, options?: { salt?: Uint8Array; secret?: Uint8Array; scope?: string }): { salt: Uint8Array; ref: string };
export function election(options: ElectionOptions): Envelope;
export function software(options: SoftwareOptions): Envelope;
export function contest(options: ContestOptions): Envelope;
export function mandate(options: MandateOptions): Envelope;
export function stationReturn(options: StationReturnOptions): Envelope;
export function witness(options: WitnessOptions): Envelope;
export function batch(options: BatchOptions): Envelope;
export function entry(options: EntryOptions): Envelope;
export function result(options: ResultOptions): Envelope;
export function create(type: RecordType, options: Record<string, unknown>): Envelope;
export function anchor(envelopes: Envelope | Envelope[], options: AnchorOptions): Promise<Envelope[]>;
export function complete(envelopes: Envelope | Envelope[], pending: unknown, options?: { rpc?: string | string[]; client?: unknown; clients?: Array<string | unknown>; trustSingleEndpoint?: boolean; allowLoopback?: boolean; endpointAllowList?: string[]; timeoutMs?: number }): Promise<Envelope[]>;
export function verify(envelope: unknown, options: VerifyOptions): Promise<VerifyResult>;
export function refOf(envelope: Envelope): string;
export function anchorDigest(envelope: Envelope): string;
export function summariseReturns(returns: Envelope[]): { tally: string; returnsDigest: string; returnsCount: string };
export const FORMAT: 'qballot/2';
export const ALGORITHM: 'ML-DSA-65';
export const KIND: 1106;
export const TYPES: readonly RecordType[];
export const ROLES: readonly Role[];
