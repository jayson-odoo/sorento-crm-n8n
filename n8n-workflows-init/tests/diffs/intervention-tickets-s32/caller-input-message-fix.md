# F1 fix — `input_message` was never mapped to `sub-human-intervention`

Reviewer BLOCKER F1 (`../../reviews/intervention-tickets-s32-review.md`). Built in the main
session 2026-08-12 after the coder seat died on an API session limit; clone-only, spine untouched.

## The defect, verified directly

`Call 'sub-human-intervention'` on the live spine `9qVyfUxmRQqrpGRMDLRuz` maps 9 inputs; the
clone `txiPzSxy3Pclsz6v` maps 11. **Neither mapped `input_message`.**

The sharper form of the finding: the node's `workflowInputs.schema` ALREADY DECLARES
`input_message` (and `started_at`) — they are simply absent from `workflowInputs.value`. So this
is an unmapped field on a declared input, not a missing declaration. Two live executions confirm
the runtime effect: 12199710 and 12173314 both show `"input_message": null` on the sub's trigger.

Consequences:
- reworked create body sends `source_message_text: JSON.stringify(input_message || '')` → `""`
  on every real intervention, so the CRM worklist enquiry snippet would be blank forever;
- pre-existing: the sub's three sendmsg callers already read `input_message` and have been
  receiving null since they were written.

The V2 matrix could not have caught this — it pins the trigger directly with a fabricated
sentence. Nor could the peer's dev replay, which used the same hand-written sample. **The body
shape production would actually send had never been exercised anywhere.**

## Evidence gathered before choosing the expression

`tf-message` is a Code node returning `$input.first().json.message.message`; its OUTPUT object
carries keys `channel, contact, event_id, event_type, message, sender` — i.e. a respond.io event.
So `$('tf-message').first().json.message` is the event's message envelope and
`.message.message.text` is the customer's text. That is why the canonical spine form has the
double `.message.message`.

Inner shape across the 25 most recent spine executions carrying `tf-message`:

| type | keys | count |
|---|---|---|
| `text` | `('text','type')` | 25 |

e.g. exec 12216421 → `{"type":"text","text":"SRT401-WH STOCK LEVEL"}`. No attachment-shaped
message appeared in the retained window, so the attachment branch is carried on the canonical
form's authority, not on observation — noted rather than claimed.

## Why NOT the canonical expression verbatim

Four other spine callers use:

```
={{ $('tf-message').first().json.message.message.text || $('tf-message').item.json.message.message.attachment.description || $json.message }} {{ … replyTo … }}
```

Two problems for this node:
1. **`|| $json.message` is POSITION-DEPENDENT.** `$json` at the HI caller is whatever flows in
   from its own upstream branch, which is not the same node as the sendmsg callers'. Copying it
   here would silently bind to a different object. n8n did not capture `inputData` for this node
   in the retained executions, so I could not prove what `$json` is there — and an unprovable
   fallback is exactly the kind of thing that ships wrong.
2. `attachment.description` without optional chaining throws when `attachment` is absent, which
   is every message in the observed window.

## Expression applied (by-name reads only)

```
={{ $('tf-message').first().json.message.message.text
 || $('tf-message').first().json.message.message.attachment?.description
 || '[' + ($('tf-message').first().json.message.message.type || 'unknown') + ' message]' }}{{ $('tf-message').first().json.message.replyTo?.message
 ? ' reply to: ' + $('tf-message').first().json.message.replyTo.message.text : '' }}
```
(single line as stored; wrapped here for reading)

Every term is a `$('tf-message')` by-name read, so it resolves identically at any graph position.
Yields per message kind: **text** → the customer's words; **attachment with caption** → the
caption; **anything else (incl. voice)** → `[<type> message]`, a neutral non-empty label rather
than the `""` this fix exists to eliminate; **reply-to** → ` reply to: <quoted text>` suffix,
matching the canonical callers so the sendmsg log stays consistent across the spine.

## ⚠️ SECOND EDIT REQUIRED — `schema[input_message].removed` (delta review, D1)

The first pass added the key to `value` and stopped there, because the schema already declared
`input_message`. It declared it as **`removed: true`**. A `value` key whose schema entry says
`removed: true` exists NOWHERE else in the instance — all seven working precedents are
`removed: false` or carry no schema entry — so it is unproven that n8n transmits it. If it does
not, the flip reproduces the original defect under a document claiming it was fixed.

Corrected by mirroring the canonical working caller
(`sorento-sub-respond-sendmsg-respond2`: `removed: false` AND present in value):
clone `a01871ab` → **`6cd67cbf-9b68-426d-b742-55b0ac83f039`**, one node changed, 148 → 148.

Both spine and clone had `removed: true`, so **the promote hunk is two edits, not one**.
Still unproven by execution anywhere — closing that is what flip Step 0 exists for.

Also observed and deliberately untouched: `turn_id` is present in `value` with NO schema entry at
all and demonstrably works live (the obs-latency-contract work). So "absent schema entry" is a
proven-good shape and "`removed: true`" is the only questionable one.

## Applied to the CLONE only

| | |
|---|---|
| target | `txiPzSxy3Pclsz6v` (clone) — spine NOT touched |
| versionId before → after | `be62b3a8-3d4f-41ff-a52d-5061bc9f25cd` → **`a01871ab-a36b-484d-849c-a935fd160944`** (`== activeVersionId`) |
| nodes changed | exactly one: `Call 'sub-human-intervention'` (param-sha diff over all 148 nodes) |
| node count | 148 → 148 |
| schema | untouched — `input_message` was already declared |
| settings | `binaryMode` / `timeSavedMode` stripped from the PUT body (reviewer F2; public schema rejects them) |
| live spine | `469e7259-6cfb-4505-bef4-f37a36bf454f`, `updatedAt 2026-08-11` — unchanged before and after |

## PROMOTE HUNK for the spine (flip Step 2c)

On `9qVyfUxmRQqrpGRMDLRuz`, node `Call 'sub-human-intervention'`: add the key `input_message` to
`parameters.workflowInputs.value` with the expression above. Nothing else. No schema edit
(already declared). Strip `settings.binaryMode` and `settings.timeSavedMode` from the PUT body.
Rollback = the spine's prior versionId, captured at flip Step 1.

## Second unmapped field — `started_at` (NOT fixed here, flagged)

`started_at` is likewise declared in the caller's schema and absent from its value, so the sub's
sendmsg calls receive null. That plausibly breaks latency measurement on the escalation path
(cf. the obs-latency-contract work, which fixed `turn_id` on this path but evidently not this).
Deliberately out of scope for S3.2 — it is a separate observability change with its own
verification, and smuggling it into a flip window is how unrelated regressions arrive.
