# Offline harness — `carried-certificate-dump` **B2′** (parser sub `output_exchange`)

Runs the **real `output_exchange` body** — pre- and post-B2′, pulled byte-exact from the parser fork
`wI5RkNGW3EOJfBdo` via REST — against pinned `previous_conversation_state` / LLM-output fixtures, with
no n8n and no network. Coder-side. It has **no customer boundary in it**, so per LESSONS §63 rule (i)
every rendered-text assertion still has to be made in the real run on `save-session-vars.user_response`
/ the sendmsg payload.

B1's harness (`gate.*`, `probe.js`, `mutate.sh`, `byte-identity.js`) is untouched and still valid; the
B2′ files are all prefixed `oe-`.

```bash
node oe-probe.js oe.before.js   # the defect reproduces:  RED 8/11
node oe-probe.js                # post-fix:               GREEN 11/11
node oe-byte-identity.js        # non-interference, whole returned object
./oe-mutate.sh                  # §0 S9 fail-on-purpose, with EXACT expected red-sets
```

| file | what |
|---|---|
| `oe.before.js` | fork `output_exchange` @ `c9f6e280` (sha `710e577a1652…`) |
| `oe.after.js`  | fork `output_exchange` @ `95193323` (sha `a773fff4a7c8…`) — the bytes actually PUT |
| `oe-cases.js`  | 15 fixtures |
| `oe-run.js`    | mocks `$('When Executed by Another Workflow')` + `$json`, deep-clones per run |
| `oe-probe.js`  | assertions; prints the compared-population count |
| `oe-byte-identity.js` | before-vs-after on every fixture |
| `oe-mutate.sh` | §CD-FP-4a/4b/4c, 6, 7, 8, 9 + a negative control |

## The fixtures, and why each exists

The seeded prior state is **exec `11509876`'s verbatim** — including the B4 corruption
(`current_message: true` on every carried row, `dym_slot: "11400339"` on the carried product). That is
deliberate: a fixture with clean flags cannot discriminate §CD-FP-7, which is the single most important
mutation in this family.

| fixture | shape | pins |
|---|---|---|
| `CD-5` | `srtwc8317-rl1 cert`, no pick | §CD-5. The regression floor — **B2-as-designed also passes this**, so it is not evidence B2′ works |
| `CD-11a` | code reply, LLM emits **nothing** | `tryDymPick` bypass; forces the `_ceDymPickedKeys` path |
| `CD-11a2` | code reply, LLM restates the code | the same bypass via `_ceLlmKeys` |
| `CD-11b` | numbered reply | `dymNumberedMultiSelect` overwrites the executor's output wholesale — the strictest placement test |
| `CD-10b` | `SRTWT2214 cert` + non-matching carried cert | F-CARRY-NARROW, the customer-visible headline |
| `FP8-D` | `and MWC7601?` bare product | **the only discriminator for part 4's `product_scope` half** (see below), and it pins that `attachment_type` is RETAINED |
| `CD-2` / `CD-2b` | certificate-first query, clean and seeded | negative controls: a certificate the user just named is not carried, so nothing is dropped. Without these the suite would pass for a clear-everything implementation |
| `CD-7c` | `reuse` continuation over the five-cert state | dedupe **only** — nothing is contributed, so nothing is evicted, so the dedupe is the single variable. Asserts the uuid survives (only the 5th row carries it) |
| `CD-7c2` | dym pick over a state with a duplicated product | dedupe on the turn shape that *generates* the accumulation, plus eviction, in one |
| `NI-*` (5) | order / inventory / promotion / incoming / clean product_attachment | the byte-identity population |

## Was this harness blind? Partly — here is the disclosure

Two blind spots, both surfaced by *running* the mutations rather than by reading the code:

1. **The first `CD-7c` could not test the dedupe at all.** It used
   `certification with number PC000078` over the five-certificate state; part 1's axis entries evict all
   five prior certificates at the **executor**, so exactly one certificate ever reached the pass. It
   failed on a `uuid` assertion that had nothing to do with the dedupe. Replaced with the `reuse`-turn
   fixture above, plus `CD-7c2`.
2. **`CD-FP-4b` expected a red set and got none.** `AXIS_BY_DOMAIN` and `HINT_AXIS_DEFAULT` shadow one
   another for a `product_attachment` turn, so removing either alone is inert. Split into 4a / 4b / 4c
   and both non-instruments recorded as such, rather than quietly re-aimed at whatever went red.

## Findings for `tests/uac/CD.md`

- **§CD-FP-8's stated §CD-10b expectation is blind.** Removing part 4's `product_scope` half does **not**
  redden §CD-10b: that turn (`SRTWT2214 cert`) also contributes an `attachment_scope` entity, so the
  `attachment_scope` half alone still evicts. Measured red-set is `CD-11a CD-11a2 CD-11b CD-7c2 FP8-D`.
  The bare-product shape (`and MWC7601?`) is the discriminator — that is `FP8-D`.
- **§CD-FP-4 step (a) is a non-instrument**, and so is the mirror-image step. Only the both-maps
  mutation is a gate.
- **§CD-11's two-turn recipe is likely vacuous as written.** Turn 1 (`srtwc8317-rl1 cert`) under B2′
  already evicts the certificate, so turn 2 has nothing to carry and the case degenerates into §CD-5.
  Turn 2 must be `sim-inject`-seeded with the certificate still present **plus** a `dym_offer` /
  `dym_last_result_set`. `CD-11a/11a2/11b` here are built that way and can be lifted as the seed shape.

## Scope limits (do not over-read a green run here)

- No customer boundary, no renderer, no CRM. `entity-ids-transformer`, `disallowed-entity-gate` and the
  reply text are **not** exercised.
- `oe-byte-identity.js` deliberately does **not** claim plan §8.6's "every other domain byte-identical":
  part 5 (dedupe) is domain-independent. It asserts the defensible invariant instead and prints every
  changed fixture with its entity keys, so the blast radius is visible rather than summarised.
