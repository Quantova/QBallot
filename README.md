# QBallot

QBallot is a post quantum election integrity layer. It seals the certified software, the mandates of officials, each station return, the signatures of witnesses, each batch of ballot records, every tabulation action and the declared result, so candidates, observers and courts can later prove that the declared result is the sum of the certified returns and that nothing was altered, inserted or backdated, while no vote and no voter is ever revealed. Every record is signed with the Module Lattice Digital Signature Algorithm, parameter set 65, as standardised in FIPS 204, and can carry a Qstamp time proof recorded on the Quantova network under the QBallot record kind.

QBallot is part of QGov, the government branch of the Qstamp family.

## What QBallot is

Public confidence in an election depends on records that can be checked. A station return altered between the count and the national tabulation, a result submitted under the name of an official who never certified it, software that was never approved, an adjudication removed from the log, or a declared total that differs from the returns each depends on a record that its custodian can quietly change.

QBallot removes that possibility. The election authority seals each election with its polling period, the fingerprint of each certified software build and the mandate of each presiding or returning officer, naming the election, the station and a period that covers the polls. The official signs the station return for each contest, with the ballots issued, the ballots cast and the tally, within the period of the mandate, and appointed witnesses add their own signatures. The counting centre seals batches of salted ballot fingerprints against the return as a series whose running total cannot exceed the ballots cast, the tabulation system writes every action to a hash chained series, and the authority declares each contest result from the exact set of certified returns of that election and contest.

QBallot is standalone. It runs on the systems of its users, holds keys locally and uses the Quantova network only as a neutral public ledger for time proofs.

## What it detects

1. A record altered, replaced, inserted or backdated after it was sealed.
2. A station return signed by a key other than the official named in its mandate, signed outside the period of the mandate or before the polls closed, or under a mandate that does not cover the polls.
3. A return with more ballots cast than issued, or a tally above the ballots cast.
4. Ballot batches that together exceed the ballots cast of their return.
5. A tabulation action removed, reordered or replaced, once the actions held are supplied.
6. A declared result that differs from the sum of the certified returns of its election and contest, that was declared from a different set of returns, that counts a station twice, that counts a return dated after the result, or that counts a return failing its own checks.
7. A record signed by a key that is not trusted for its role, or two linked records signed by the same key, except records of the election authority.

## Who uses it

1. Election authorities and electoral commissions.
2. Candidates, parties and accredited observers.
3. Courts and tribunals that decide electoral disputes.

## How an election authority integrates QBallot

1. Issue keys by role. The election authority, presiding and returning officers, appointed witnesses, counting centres and the tabulation system hold separate ML-DSA-65 keys, created in a witnessed ceremony. The verifier is given one list of trusted keys for each role, election authority key, presiding or returning officer key, appointed witness key, counting centre key and tabulation system key. A key may appear in only one list, and QBallot refuses to sign a record with the key that signed a record it relies on.

2. Register the election, software and officials. The authority calls election with the polling period, software for each certified build and mandate for each official, naming the election, the station and a period that covers the polls.

3. Seal station returns. When the poll closes the official calls station-return against the election, the mandate and the software with the contest, the ballots issued, the ballots cast, the tally and the fingerprint of the results document. Witnesses call witness against the return.

4. Seal counting and tabulation. The counting centre calls batch with the root of each batch of salted ballot fingerprints, naming the previous batch of the return or declaring it the first. The tabulation system calls entry for every action, naming the previous entry or declaring it the first.

5. Declare the result. The authority calls result with the election, the contest and the certified returns of that contest, from which the tally, the number of returns and the fingerprint of the set of returns are derived.

6. Anchor promptly. A single service with a funded Quantova account anchors new records in batches under the QBallot record kind, and each record receives its own receipt.

7. Verify on demand. Auditors and courts verify any record against the lists of trusted keys and the records held, with the verify command, the library or the independent procedure below.

## What is published and what stays private

Ballots are never recorded in QBallot. Ballot records are fingerprinted with fresh random salts before only the root of each batch is sealed, so nothing sealed can be traced back to a voter or used to confirm a guess about a ballot. Voter registers and identity data stay with the election authority.

When a record is anchored, only a 32 byte Qstamp commitment reaches the chain. It is derived from a salted fingerprint of the signed record and cannot be reversed into any field of the record.

## Cryptographic construction

1. Keys. Keys are 32 byte seeds from which ML-DSA-65 key pairs are derived by the key generation procedure of FIPS 204. A key identifier is the SHA3 hash with a 256 bit output of the ASCII label quantova/qballot/key/1, the byte 0x00 and the 1952 byte public key.

2. Party commitments. A party is named by the SHA3-256 hash of the ASCII label quantova/qballot/party/1, the byte 0x00, a random 32 byte salt and the identifier in Unicode normal form C.

3. Statements. Each statement is a canonical binary encoding that begins with the ASCII bytes QBAL and the version byte 1, followed by the statement type and its fields in a fixed order. Every field is an unsigned 16 bit big endian length followed by its bytes. Identifiers, key identifiers, references and digests are encoded as raw bytes, an absent reference is an empty field, sequence numbers and sizes are unsigned 64 bit big endian integers, and text is UTF-8 in Unicode normal form C, so every statement has exactly one encoding. Amounts are whole numbers of minor units with no leading zeros, and a currency is three capital letters, which QBallot checks for form only, so the integrating system should use ISO 4217 codes.

4. Signatures. Statements are signed with ML-DSA-65 in its hedged form under the FIPS 204 context string quantova/qballot/1, which separates QBallot signatures from every other SDK of the family and from every other use of the algorithm.

5. References. A record is referenced by the SHA3 hash of the label quantova/qballot/ref/1, the byte 0x00, the encoded statement and its signature. Each record names the records it relies on by these references, so it relies on one exact signed record that existed before it was signed.

6. Series. The ballot batches of one return form a series, and the tabulation actions recorded under one software build form a series. Every record of a series carries its position from one and the reference of the previous record of the series, which is empty only for the first, and a running total including itself.

7. Tallies. A tally is a list of name=count pairs separated by commas, sorted by name with no repeated name. The fingerprint of a set of returns is the SHA3-256 hash of the ASCII label quantova/qballot/returns/1, the byte 0x00 and the references of the returns sorted in ascending order.

8. Anchor. To anchor a record, QBallot stamps the SHA3 hash of the label quantova/qballot/anchor/1, the byte 0x00, the encoded statement and its signature as a Qstamp record of kind 1106.

## Record types

| Type | Signed by | Relies on | Series |
|---|---|---|---|
| election | election authority key | none | none |
| software | election authority key | none | none |
| mandate | election authority key | election | none |
| station return | presiding or returning officer key | mandate, software, election | none |
| witness | appointed witness key | station return | none |
| batch | counting centre key | station return | per return, running total capped by the ballots cast of the station return |
| entry | tabulation system key | software | per software |
| result | election authority key | election | none |

## Rules applied by verification

1. The expected record type is required, so a record of one type can never be presented as another, and options that do not apply to that type are refused.
2. The record is well formed and signed by the key it names, and that key is trusted for the role of its type. The lists of trusted keys must not share a key.
3. Every record the record relies on, and every earlier record of each series involved, is taken from the records supplied and verified in turn by the same rules.
4. Each linked record is exactly the one referenced, of the expected type, signed by a different key, and dated no later than the record that relies on it.
5. Copied and matched fields agree with the records they come from, and limits taken from linked records are respected.
6. Each record of a series continues the previous record in position, running total and currency, and any limit on the series is respected.
7. Any two different supplied records in the same position of a series involved make the result invalid.
8. A record that depends on a series is valid only when the verifier declares that every record it holds for the series involved was supplied. Without that declaration the result is indeterminate, and with it a missing record makes the result invalid.
9. A mandate covers the polling period of its election, and a station return is signed by the official named in its mandate, within the period of the mandate and after the polls of its election have closed.
10. A declared result counts every return supplied for its election and contest that is signed by a trusted official, and each counted return is verified in turn. No two counted returns share a mandate or a station, where station names are compared without regard to case or spacing, every counted return is dated and anchored no later than the result, the result was derived from exactly those returns and its tally equals their sum. A result is valid only when the verifier declares that every return held for the contest was supplied.
11. When documents are supplied, their fingerprints match the signed fingerprints, and when a party identity and salt are supplied, they match the commitment.
12. Each anchor is verified under the QBallot record kind with a SHA3 digest, and the stated time is not later than the anchor time, allowing five minutes. An anchor more than twenty four hours after the stated time, unless another limit is given, or later than a given verification time, does not prove the stated time and makes the result indeterminate.

A result is valid only when the trusted keys are given, every record relied on is supplied, the records held for each series are declared complete where a series is involved, and every record is anchored. When any of these is missing the result is indeterminate rather than valid. A record verified with anchoring not required proves only who signed it and what was signed, and its stated time is the claim of its signer.

## Trust model of this release

This release targets the Quantova test network. Anchors on that network carry no evidential weight. The signing module is compiled from the Quantova Q-Crypto library, which follows FIPS 204 and FIPS 202 and has been tested against the NIST vectors, but has not yet been independently audited or validated under FIPS 140-3.

A sealed record proves who signed it, what was signed and when it was anchored. Each check is made from the records a verifier is given, so two records in the same position of a series are detected only when both are supplied, and auditors should obtain every record held for the series they examine. A party commitment is the same in every record that uses the same salt, so records about one party can be linked by anyone who sees them, and anyone who obtains the salt can test guesses of the identifier, so salts must be protected like the identifiers themselves. Verifiers must keep the keys of retired officials in the trusted lists for as long as records they signed are verified. A sealed record does not replace certified voting equipment, paper ballots or the procedures of the electoral commission, does not establish that a ballot reflects the intent of the voter, and does not by itself prevent coercion or vote buying. Each station return should be verified on its own, with its mandate and software, before it is counted towards a result. This release has no correction procedure for a station return. If a second return is signed for a station of a contest, a result counting that contest cannot be verified as valid while both are held, so the authority must resolve the conflict under its own law. Stations are identified by the name in their mandate, which must have no leading, trailing or repeated spaces, and QBallot has no register of stations, so the authority must issue one mandate for each real station.

## Installation

```
npm install @quantovainc/qballot
```

QBallot requires Node 20 or later.

## Command line use

```
qballot keygen authority.key
qballot keygen official.key
qballot keygen witness.key
qballot keygen count.key
qballot keygen tabulator.key
qballot key authority.key > authority.pub.json
qballot key official.key > official.pub.json
qballot key witness.key > witness.pub.json
qballot key count.key > count.pub.json
qballot key tabulator.key > tabulator.pub.json

qballot election --key authority.key --name "General election" --polls-open <polls open> --polls-close <polls close> --out election.json
qballot software --key authority.key --name "Count system" --version 4.2.1 --build build.tar --out software.json
qballot mandate --key authority.key --election election.json --official-key-id official.pub.json --office "Presiding officer" --station "Station 1" --valid-from <polls open> --valid-to <mandate end> --out mandate.json
qballot station-return --key official.key --election election.json --mandate mandate.json --software software.json --contest "District 9" --ballots-issued 1000 --ballots-cast 900 --tally "Candidate A=500,Candidate B=390" --results results.pdf --out return.json
qballot anchor election.json software.json mandate.json return.json --seed-file account.key

qballot verify return.json --type station-return --authority authority.pub.json --official official.pub.json --witness witness.pub.json --count count.pub.json --tabulator tabulator.pub.json --record election.json --record software.json --record mandate.json --results results.pdf
```

The file account.key holds the 32 byte seed of a funded Quantova account, as 64 hexadecimal characters, which pays for anchoring. It is separate from the signing keys of officials.

If anchoring is interrupted after its transaction may have been sent, a pending stamp is kept beside each envelope and the envelopes are not anchored again. Finish with qballot complete, giving the same envelopes in the same order and the pending stamp.

The command exits with status 0 when the result is valid, 1 when it is invalid, refused or the evidence is malformed, 2 when it cannot be decided, and 64 for usage errors. Key and salt files must be readable only by their owner and are never followed through symbolic links.

## Independent verification procedure

1. Decode each public key and signature from base64 and confirm their lengths are 1952 and 3309 bytes.
2. Compute each key identifier from the label quantova/qballot/key/1, the byte 0x00 and the public key, and compare it with the signer identifier and the signing party named in the statement.
3. Encode each statement as described above and verify its signature with ML-DSA-65 under the context string quantova/qballot/1, following FIPS 204.
4. Compute the reference of each linked record and of each earlier record of each series, confirm each is the one named, and apply the rules of verification listed above.
5. Compute the anchor value of each record and verify its receipt by the procedure published with Qstamp under record kind 1106.

## Network

The Quantova test network is named Q-test-net-1 with genesis hash ca91e093bb8de33e90db52d7c89876597d14760703793ea7211929e73e613062. Anchors are recorded by the official Qstamp contract on that network. The public endpoint is https://rpc-testnet.quantova.org.

## Licence

QBallot is created and owned by Quantova Inc. It is licensed under the Apache License 2.0 or the MIT licence, at your option. The full texts are in the files LICENSE-APACHE and LICENSE-MIT, and the notice is in NOTICE.
