# QBallot

QBallot is a post quantum election integrity layer. It seals the certified software, the mandates of officials, each station return, the signatures of witnesses, each batch of ballot records, every tabulation action and the declared result, so candidates, observers and courts can later prove that the declared result is the sum of the certified returns and that nothing was altered, inserted or backdated, without recording any ballot or any voter. Every record is signed with the Module Lattice Digital Signature Algorithm, parameter set 65, as standardised in FIPS 204, and can carry a Qstamp time proof recorded on the Quantova network under the QBallot record kind.

QBallot is part of QGov, the government branch of the Qstamp family.

## What QBallot is

Public confidence in an election depends on records that can be checked. A station return altered between the count and the national tabulation, a result submitted under the name of an official who never certified it, software that was never approved, an adjudication removed from the log, or a declared total that differs from the returns each depends on a record that its custodian can quietly change.

QBallot removes that possibility. The election authority seals each election with its polling period, the fingerprint of each certified software build and the mandate of each presiding or returning officer, naming the election, the station, the contests of that station and a period that covers the polls, and issuing every mandate before the polls open. The official signs the station return for each contest, with the ballots issued, the ballots cast and the tally, within the period of the mandate, and appointed witnesses add their own signatures. The counting centre seals batches of salted ballot fingerprints against the return as a series whose running total cannot exceed the ballots cast, the tabulation system writes every action to a hash chained series, and the authority declares each contest result from the exact set of certified returns of that election and contest.

QBallot is standalone. It runs on the systems of its users, holds keys locally and uses the Quantova network only as a neutral public ledger for time proofs.

## What it detects

1. A record altered, replaced, inserted or backdated after it was sealed.
2. A station return signed by a key other than the official named in its mandate, signed or anchored after its mandate ended, signed before its mandate began or before the polls closed, or under a mandate that does not cover the polls.
3. A return with more ballots cast than issued, a tally above the ballots cast, or a tally or result that names anyone who is not on the candidate list the authority signed for the contest, including a lookalike or a case variant of a candidate.
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

2. Register the election, software, candidates and officials. The authority calls election with the polling period, software for each certified build, contest for each contest with its sorted list of candidate names, and mandate for each official, naming the election, the station, the contests of that station and a period that covers the polls. Every candidate list and every mandate is issued and anchored before the polls open.

3. Seal station returns. When the poll closes the official calls station-return against the election, the mandate and the software with the contest, the ballots issued, the ballots cast, the tally and the fingerprint of the results document, and has the return anchored before the mandate ends. Witnesses call witness against the return.

4. Seal counting and tabulation. The counting centre calls batch with the root of each batch of salted ballot fingerprints, naming the previous batch of the return or declaring it the first. The tabulation system calls entry for every action, naming the previous entry or declaring it the first.

5. Declare the result. The authority calls result with the election, the contest and the certified returns of that contest, from which the tally, the number of returns and the fingerprint of the set of returns are derived.


Signing alone is not a gate. Two officials who each hold the same previous record can both sign the next record of a series, so batch and entry take a ledger, one folder or one store with an atomic compare and swap shared by every signer, which serialises the ballot batches of a station return and the entries of a tabulation log. With it a record is signed only when it follows the latest record of its series that the ledger holds, and a second first record or a record after a stale previous one is refused with the code QBALLOT_LEDGER. Without the ledger the integrating system must serialise each series itself.

6. Anchor promptly. A single service with a funded Quantova account anchors new records in batches under the QBallot record kind, and each record receives its own receipt.

7. Verify on demand. Auditors and courts verify any record against the lists of trusted keys and the records held, with the verify command, the library or the independent procedure below.

## What is published and what stays private

Ballots and voters are never recorded in QBallot. A station return records the ballots issued, the ballots cast and the tally of its station, and that tally is published with the return. A batch records only a root given by the counting centre and its number of ballots. QBallot does not compute that root, so the counting centre must fingerprint each ballot record with a fresh random salt before it builds the root, and only then can nothing sealed in a batch be traced back to a voter or used to confirm a guess about a ballot. A published station tally can still reveal how individual voters voted in a station with very few voters, or where every voter chose the same candidate, as the trust model below explains. Voter registers and identity data stay with the election authority.

When a record is anchored, only a 32 byte Qstamp commitment reaches the chain. It is derived from a salted fingerprint of the signed record and cannot be reversed into any field of the record.

## Cryptographic construction

1. Keys. Keys are 32 byte seeds from which ML-DSA-65 key pairs are derived by the key generation procedure of FIPS 204. A key identifier is the SHA3 hash with a 256 bit output of the ASCII label quantova/qballot/key/1, the byte 0x00 and the 1952 byte public key.

2. Party commitments. Each party identifier is first made canonical. It is brought to Unicode normal form KC, every decimal digit of any script is replaced by the ASCII digit of the same value, combining marks of the Inherited script are removed, spaces, punctuation and invisible characters are removed, case is folded, and every character is replaced by its prototype in the confusable skeleton of Unicode Technical Standard 39, version 18.0.0, first in upper case and then in lower case, until the result no longer changes. An identifier that holds an unassigned character, or no letter or digit, is refused. A party is then named by the SHA3-256 hash of the ASCII label quantova/qballot/party/3, the byte 0x00, a 32 byte salt and the canonical identifier in UTF-8, so the same identifier written with other case, spacing, separators or lookalike letters gives the same commitment. The salt is random or reused from an earlier commitment, or, when the authority supplies its own 32 byte secret and the reference of the record that defines the series, it is the SHA3-256 hash of the ASCII label quantova/qballot/party-salt/3, the byte 0x00, the secret, the 32 byte reference and the canonical identifier, so the same party always receives the same commitment in that series. A commitment made under an earlier scheme is refused.

3. Statements. Each statement is a canonical binary encoding that begins with the ASCII bytes QBAL and the version byte 2, followed by the statement type and its fields in a fixed order. Every field is an unsigned 16 bit big endian length followed by its bytes. Identifiers, key identifiers, references and digests are encoded as raw bytes, an absent reference is an empty field, sequence numbers and sizes are unsigned 64 bit big endian integers, and text is UTF-8 in Unicode normal form C, so every statement has exactly one encoding. Amounts are whole numbers of minor units with no leading zeros, and a currency is three capital letters, which QBallot checks for form only, so the integrating system should use ISO 4217 codes. This release reads records of format version 2 only, so a record made by an earlier release in an older format verifies as invalid.

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
| contest | election authority key | election | none |
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
8. A record that depends on a series is valid only when the verifier declares that every record it holds for the series involved was supplied. Without that declaration the result is indeterminate, and with it a missing record makes the result invalid. The verifier gives in records every record it holds for each series involved, because a second record at the same position is found only among the records given, and allSupplied is a declaration that it did so.
9. A mandate covers the polling period of its election, names the contests of its station and is issued before the polls open, and when it is anchored it is anchored before the polls open. A candidate list names the candidates of one contest of the election, sorted, with no two names alike once made canonical as described for party identifiers, and is published before the polls open, and anchored before they open when anchors are required. A station return is signed by the official named in its mandate, for a contest the mandate names, within the period of the mandate and after the polls of its election have closed, and it is anchored no later than the end of its mandate. When anchors are required, a return with no proven anchor is indeterminate. A tally holds no two names alike once made canonical, and every name in the tally of a return or a result is a name on the one candidate list the authority signed for the election and contest. A missing candidate list makes the result indeterminate, or invalid when every record was declared supplied, and two different candidate lists for one contest make it invalid.
10. A declared result counts every return supplied for its election and contest that is signed by a trusted official under a mandate of the election that names the contest, and each counted return is verified in turn. No two counted returns share a mandate or a station, where station names are compared once made canonical as described for party identifiers, every counted return is dated and anchored no later than the result, the result was derived from exactly those returns and its tally equals their sum. A result is valid only when the verifier declares that every return held for the contest was supplied.
11. When documents are supplied, their fingerprints match the signed fingerprints, and when a party identity and salt are supplied, they match the commitment.
12. Each anchor is verified under the QBallot record kind with a SHA3 digest, and the stated time is not later than the anchor time, allowing five minutes. An anchor more than twenty four hours after the stated time, unless another limit is given, or later than a given verification time, does not prove the stated time and makes the result indeterminate. When different anchors of one record are supplied, anchors that do not commit to the record are set aside, the others are taken in order of anchor time, chain, height, transaction and position in the batch, and the earliest that verifies is used, so a later anchor added by anyone cannot displace an earlier one. An anchor that cannot be checked keeps the result indeterminate only when it could be earlier than the anchor that verifies. One that claims an earlier time at a height on the same chain no lower than the verified anchor is set aside, because an honest chain cannot hold it, and an unchecked anchor never removes the time proven by a verified one. Anchors are read at most four at a time. Each anchoring transaction is read once per verification, at most eight for each record supplied plus 32 unless maxAnchorLookups gives another bound, and a record whose anchor was not read within that bound is indeterminate. A verification that has not finished within deadlineMs, two minutes unless given, stops with the result indeterminate and a time limit check that says so. When keyStatus is given it is asked for the registry status of each signing key and must answer, within keyStatusTimeoutMs or ten seconds, with an object whose revoked is true or false and, when revoked is true, whose revokedAt is the time of the revocation in whole seconds since 1970, not before the genesis of the network. Any other answer, an error or no answer in time makes the result indeterminate. The time of verification is read from the chain unless it is given with at, and when it cannot be read verification stops with an error rather than use the local clock.

A result is valid only when the trusted keys are given, every record relied on is supplied, the records held for each series are declared complete where a series is involved, and every record carries a proven anchor. When any of these is missing the result is indeterminate rather than valid, except that a record which moves value is invalid when a record it relies on is not supplied. A record verified with anchoring not required proves only which key signed it and what was signed, and its stated time is the claim of its signer.

## Trust model of this release

This release anchors on the live Quantova network Q-test-net-01. The signing module is compiled from the Quantova Q-Crypto library, which follows FIPS 204 and FIPS 202 and has been tested against the NIST vectors. It has not been validated under FIPS 140-3. An anchor time is accepted only when Qstamp proves the anchor, either by a finality certificate checked against a pinned validator roster or by official endpoints of the network run by two different operators. An anchor confirmed by endpoints of one operator, or by endpoints chosen by the verifier, is unproven. An unproven anchor is treated as not anchored and makes the result indeterminate, never valid, whatever options are set. While the network has one official endpoint and no pinned roster every anchor is unproven, which is the honest result. Verification names the endpoints it consulted and says whether they are the official endpoints of the network.

A sealed record proves which key signed it, what was signed and when it was anchored. Each check is made from the records a verifier is given, so two records in the same position of a series are detected only when both are supplied, and auditors should obtain every record held for the series they examine. A party commitment is the same in every record that uses the same salt, so records about one party can be linked by anyone who sees them, and anyone who obtains the salt can test guesses of the identifier, so salts must be protected like the identifiers themselves. Verifiers must keep the keys of retired officials in the trusted lists for as long as records they signed are verified. A sealed record does not replace certified voting equipment, paper ballots or the procedures of the electoral commission, does not establish that a ballot reflects the intent of the voter, and does not by itself prevent coercion or vote buying. QBallot records counts per station, never ballots or voters. Ballot secrecy, the eligibility of voters and the rule that each voter votes once are duties of the voting procedure and the register of voters, which QBallot neither provides nor checks. A station return discloses the tally of its station, so in a station with very few voters, or where every voter chose the same candidate, the published tally can reveal how individual voters voted, and the authority should merge or withhold the returns of such stations under its own law before they are published. Each station return should be verified on its own, with its mandate and software, before it is counted towards a result. This release has no correction procedure for a station return. If a second return is signed for a station of a contest, a result counting that contest cannot be verified as valid while both are held, so the authority must resolve the conflict under its own law. Stations and contests are identifiers of lowercase letters and digits joined by single hyphens, underscores or dots, and they are compared exactly, so stations such as 12-3 and 1-23 are different stations. QBallot has no register of stations, so the authority must issue one mandate for each real station and list in it the contests that station takes part in. No anchor proves that a record was not made before the time it states, so a rule that a record comes after a moment, such as a return signed after the polls closed or after its mandate began, rests on the stated time of a trusted signer.

## Threat model

QBallot protects every record from the election to the result, the keys of each role, the series ledger shared by the signers, and the receipts of anchors.

It trusts the role key lists that the verifier gives, the key registry it consults through keyStatus, the network values pinned in the Qstamp release it depends on, and the storage that holds keys and the ledger. It does not trust the gateway or any endpoint, the holders of records, or any record not signed by a trusted key for its role.

A forged or altered record fails its signature or the reference that a later record names, and two linked records signed by one key are refused, except records of the election authority. A station return must be signed by the official its mandate names within its period, and a tally naming anyone outside the signed candidate list is refused. Signatures use the context string quantova/qballot/1 and anchors use record kind 1106, so a record signed or anchored for another SDK never verifies here, and every anchor is checked against the genesis and contract pinned in the Qstamp release. A hostile gateway cannot make an unproven anchor count, the local clock is never used as the time of verification, and an anchor more than 24 hours after the stated time does not prove that time. Ballot batches are capped by the ballots cast of their return, and a result must equal the sum of the certified returns it counts. The ledger refuses a second record at a position it holds, two different records at one position are invalid once both are supplied, and a ledger folder that every user can write, or that lies under a folder another user can change, is refused. A record anchored after the revocation time that keyStatus reports for its key is invalid. Input is parsed strictly within fixed size and time limits.

Left to the integrator are the protection of keys, keeping the ledger folder writable only by the signers and backed up whole, since a folder rolled back or missing a file lets a position be signed again, and supplying every record held for each series. The counting centre must salt each ballot record before it builds a batch root, and ballot secrecy, voter eligibility, one vote per voter and two returns for one station are left to the electoral procedure.

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
qballot contest --key authority.key --election election.json --contest district-9 --candidates "Candidate A,Candidate B" --out contest.json
qballot mandate --key authority.key --election election.json --official-key-id official.pub.json --office "Presiding officer" --station station-1 --contests district-9 --valid-from <polls open> --valid-to <mandate end> --out mandate.json
qballot station-return --key official.key --election election.json --mandate mandate.json --software software.json --contest district-9 --ballots-issued 1000 --ballots-cast 900 --tally "Candidate A=500,Candidate B=390" --results results.pdf --out return.json
qballot anchor election.json software.json contest.json mandate.json --seed-file account.key --trust-single-endpoint
mkdir ledger
qballot batch --key count.key --station-return return.json --batch-root <batch root> --ballots 900 --first --ledger ledger --out batch.json
qballot entry --key tabulator.key --software software.json --action "tabulate district-9" --detail count.log --first --ledger ledger --out entry.json
qballot anchor return.json batch.json entry.json --seed-file account.key --trust-single-endpoint

qballot verify return.json --type station-return --authority authority.pub.json --official official.pub.json --witness witness.pub.json --count count.pub.json --tabulator tabulator.pub.json --record election.json --record software.json --record contest.json --record mandate.json --results results.pdf --trust-single-endpoint
```

The file account.key holds the 32 byte seed of a funded Quantova account, as 64 hexadecimal characters, which pays for anchoring. It is separate from the signing keys of officials.

The network has one official endpoint today, so the anchor and verify commands above are given --trust-single-endpoint to rely on it. Without that flag they stop, because chain data is accepted only when endpoints of two different operators agree. With it a verification reports INDETERMINATE and exits with status 2, because an anchor confirmed by one operator is unproven. Once the Qstamp release lists official endpoints of two different operators the flag is no longer needed.

Every command that signs a record of a series takes --ledger with the folder shared by every signer of the series, as in the example above. The ledger folder records every position already signed, so keep it on storage that only the signing service can write to, never edit or delete a file in it, and back it up as a whole, because a folder that is rolled back or loses a file lets a position be signed a second time. Without --ledger it signs nothing and exits with status 64, unless --no-ledger declares that the integrating system serialises the series itself.

If anchoring is interrupted after its transaction may have been sent, a pending stamp is kept beside each envelope and the envelopes are not anchored again. Finish with qballot complete, giving the same envelopes in the same order and the pending stamp.

The command exits with status 0 when the result is valid, 1 when it is invalid, refused or the evidence is malformed, 2 when it cannot be decided, and 64 for usage errors. Key and salt files must be readable only by their owner and are never followed through symbolic links.

## Independent verification procedure

1. Decode each public key and signature from base64 and confirm their lengths are 1952 and 3309 bytes.
2. Compute each key identifier from the label quantova/qballot/key/1, the byte 0x00 and the public key, and compare it with the signer identifier and the signing party named in the statement.
3. Encode each statement as described above and verify its signature with ML-DSA-65 under the context string quantova/qballot/1, following FIPS 204.
4. Compute the reference of each linked record and of each earlier record of each series, confirm each is the one named, and apply the rules of verification listed above.
5. Compute the anchor value of each record and verify its receipt by the procedure published with Qstamp under record kind 1106.

## Network

The live Quantova network is named Q-test-net-01. Its genesis hash and the official Qstamp contract that records anchors are pinned in the Qstamp release this SDK depends on. The public endpoint is https://q-test-net-01.quantova.org. By default verification consults the official endpoints of the network. Endpoints chosen by the verifier are given with the rpc or clients option, or with --rpc once for each on the command line, and verification consults them only with trustCustomEndpoints, or --trust-custom-endpoints. An endpoint on a loopback address is refused unless allowLoopback, or --allow-loopback, is set, and an endpoint on a private network address unless it is named in endpointAllowList, or with --allow-endpoint. The option expectedSender, or --expect-sender, names the Quantova accounts entitled to anchor records, and an anchor signed by any other account is invalid. Anchoring accepts chain data only when at least two endpoints run by different operators agree, and the option trustSingleEndpoint, or --trust-single-endpoint, relies on one endpoint for anchoring and for the time of the chain.

## Licence

QBallot is created and owned by Quantova Inc. It is licensed under the Apache License 2.0 or the MIT licence, at your option. The full texts are in the files LICENSE-APACHE and LICENSE-MIT, and the notice is in NOTICE.
