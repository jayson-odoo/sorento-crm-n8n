# Media intake — voice + image through the CRM media endpoint (clone-built, promote HELD)

Status: **built + verified on the TEST clone `txiPzSxy3Pclsz6v` (2026-08-19). NOT promoted.**
Evidence: `tests/runs/media-intake-rollup-20260819.json` (+ one `media-intake-UAC-MI-*-20260819.json` per case).
UAC: `tests/media-intake-UAC.md`. Node diff: `tests/diffs/media-intake.md`. Bodies: `tests/diffs/media-intake/`.
Build/driver scripts: `tests/media-intake/{build-clone.py,make-cases.py,run-case.py}`. Units: `tests/unit/media-intake.test.js`.

## 1. What this does

A WhatsApp **voice note** or **image** arriving on the chat flow is detected right after the queue pop, sent ONCE to
the CRM media endpoint (`POST /api/v1/external/media/process`, sorento-crm PR #158 — gate, burst, quota, ledger,
then transcription / image recognition), and the CRM's `result.rendered_text` is folded back into the queue item
**upstream of `tf-message`** — so the ~15 downstream readers of `$('tf-message')` see a typed turn. The bot then
answers exactly as it would for the same words typed (same parser, same CRM reads, same renderer). Every refusal,
clarification, failure and timeout produces a CRM-rendered customer reply through the existing send sub and never
wedges the turn or leaks an internal error.

The CRM contract is the authority (read, not guessed): `app/schemas/external/media.py` (request/response),
`app/services/media_access_service.py` (decision order + notices), `app/services/media_extract/service.py`
(result bodies), `app/tasks/media_tasks.py` (`GET /media/jobs/{id}` body), `app/services/media_extract/wording.py`
(every customer string). Mounted under `/api/v1/external/media`, `X-API-Key` via `get_external_api_user` → the
existing n8n header cred `crm-n8n-auth` (`mNsZWyU82NYV58k2`) — probed 2026-08-19: 404/422, i.e. route live, key
authenticates, key holds `integration.chatbot_media.process` (see rollup `crm_endpoint_zero_write_probe`).

## 2. The lane (node names are the promotion anchors)

```
redis-pop-main-message-list
  └─ detect-media (Code)            classify: _media.modality voice|image|null, media_url, mime, caption, bytes,
                                     duration_ms (+duration_source), message_id, respond_io_id. Item passthrough.
      └─ if-media-in (If)           _media.modality truthy?
           TRUE ─ media-egress-gate (If, CLONE-ONLY)  test_run_id && scope!=='chat-ui'
                    TRUE  ─ media-extract-mock (Code, CLONE-ONLY)   message.mock_media_response | default
                    FALSE ─ media-extract-http (HTTP POST …/media/process, crm-n8n-auth, timeout 40 s,
                                                retryOnFail maxTries 2 wait 1 s, onError continueRegularOutput)
                  └─ media-extract (NoOp join) ─ media-route (Code) ─ if-media-poll
                        poll ─ wait-media-poll (Wait $json.poll_wait_s) ─ media-poll-gate (CLONE-ONLY If)
                                  TRUE ─ media-poll-mock (Code, CLONE-ONLY)   message.mock_media_poll[$runIndex]
                                  FALSE ─ media-poll-http (HTTP GET …/media/jobs/{{ $json.job_id }}, 15 s, continueRegularOutput)
                               └─ media-poll-merge (Code) ─► media-route   (loop; max 2 polls)
                        else ─ if-media-ok
                                  continue ─ patch-transcript (Code, rewritten; NAME kept) ─ tf-message ─ (existing spine)
                                  else ─ if-media-reply
                                            reply  ─ send-media-reply (sendmsg sub; clone: guarded fork, is_test=true)
                                            silent ─ (nothing)
           FALSE ─ if-audio-b64 (existing, CLONE-ONLY zz-chat console lane) ─ … whisper-transcribe ─ console-whisper-adapter ─ if-media-ok
                   └─ FALSE ─ tf-message                                       (LIVE: if-media-in FALSE → tf-message directly)

sorento-sub-respond-findcontact-respond ─ if-transcribed-confirm (If, CHANGED) ─ send-transcript-confirm (CHANGED)
   gate: $('patch-transcript').isExecuted && …_media.confirmation_text ; message = that confirmation text
```

`media-route` action table (one place, unit-tested 35/35, `tests/unit/media-intake.test.js`):

| CRM response | action | customer sees |
|---|---|---|
| no `decision` (HTTP error object: timeout / 5xx / connection) | reply | CRM fallback (§4) |
| `denied_gate` / `denied_duration` / `denied_quota` / `denied_burst` (notice present) | reply | the notice text verbatim (`not_enabled` / `too_long` / `quota_exhausted` / `burst`) |
| `denied_burst`, notices `[]` (CRM suppressed the pacing message for the rest of the window) | **silent** | nothing (by contract, one pacing message per window) |
| `accepted/completed`, `rendered_text` set | **continue** | confirmation (`confirmation_message`) + appended `warn_80`/`degraded` notices, THEN the normal answer |
| `accepted/completed`, `rendered_text` null (`needs_clarification`: captionless image / empty transcript) | reply | `clarification_message` (+ appended notices) — turn ends |
| `accepted/pending` | poll (6 s, ≤2) → then as above, else | fallback after 2 polls |
| `accepted/failed` with `job_id` | 1 immediate poll of `GET /media/jobs/{id}` (the worker's `too_long`/`unreadable` notice lives on the ledger row, NOT on the sync response) → notice verbatim, else fallback (+ appendix notices). The internal `error` string is never sent. |
| `accepted/failed`, no job (`not_queued`) | reply | fallback |

Notices are `append:true` → appended (`\n\n`) to the confirmation that precedes the answer, never returned instead
of it (AC S6-01/S6-03). Refusal kinds (`not_enabled`,`too_long`,`burst`,`quota_exhausted`,`unreadable`) are the
reply; `warn_80`/`degraded` are appendices.

## 3. Decisions made (and why)

- **Detection = attachment type/mime, not the old `if-audio-in` string match.** `audio|voice|ptt|audio/*` → voice;
  `image|photo|sticker|image/*` → image; `file`/`video`/no-url → NOT media (fall through exactly as today). Verified
  live item shapes (execs 12924778 image, 13034704 pdf): `E.attachment = {type,url,fileName,mimeType,mime,ext,size}`.
- **`duration_ms` is ALWAYS sent for voice** (captain). Respond.io carries NO duration for WhatsApp voice notes, so:
  channel duration if present (ms, or seconds when small) → else a **size-derived lower bound** (bytes×8 / 32 kbps;
  WhatsApp Opus is ~16–24 kbps, so this under-states) → else `0`. Under-stating is the safe direction: the CRM uses
  the hint only to refuse EARLY; the worker measures the real audio and is the authority, so an under-estimate can
  never cause a false refusal. `context.duration_source` (`attachment` | `estimated_from_size_32kbps` | `unknown`) is
  echoed back by the CRM so the ledger shows which it was.
- **Synchronous wire, bounded.** HTTP timeout 40 s (> the CRM's 30 s `media_sync_wait_seconds`), `retryOnFail` (free
  — idempotency key = message_id+modality+ordinal), `onError: continueRegularOutput` (a timeout becomes a customer
  reply, never a dead turn; NOT `continueErrorOutput`-unwired, the documented incident). Worst case inside the 120 s
  dispatcher lock: 40+1+40 + 2×6 s polls + ~18 s spine ≈ 105 s. PLAN §1.2 recommended 60 s/stopWorkflow; 40 s +
  graceful degrade was chosen so the lock budget closes with the retry AND the turn always answers.
- **`pending` is handled, not feared:** ≤2 polls of `GET /media/jobs/{job_id}` 6 s apart, then the fallback. No
  callback/resume construction (PLAN §1.3: resume does not exist in this repo).
- **The CRM gate is the ONLY media gate.** The legacy `if-voice-allowed` (respond.io custom field `is_allowed_voice`)
  + `send-voice-not-allowed` copy are removed from the path; the CRM `not_enabled` notice ("I cannot listen to voice
  notes on this number yet…") was written to mirror/replace that live sentence (PLAN §6). **Promotion implication:**
  the CRM gate fails CLOSED (no `contact_media_limit` row ⇒ `denied_gate`), so contacts who today have
  `is_allowed_voice=true` on respond.io will be refused after promotion until an operator enables voice on their CRM
  contact page (or a one-off migration writes the rows). See §6 — this is an explicit captain decision item.
- **Confirmation copy comes from the CRM** (`confirmation_message`: `Here is what I heard: "…"` / `I read X from
  that photo. Is that right?`), replacing the live `🎤 Here is what I heard:\n\n"…"`. AC S6-01: n8n formats nothing.
- **Fallback copy for transport/timeout/provider failure and pending-exhausted = the CRM's own strings, byte-exact**
  (`wording.voice_unclear()` for voice, `wording.nothing_read()` for image) — reused, not invented. See §6.
- **Harness: fail-closed mock of the CRM call under `test_run_id`** (same pattern as `ideate-egress-gate`). The real
  endpoint WRITES prod (`contact_media_usage` ledger + job rows) and spends provider money, so the clone never calls
  it from the harness; `mock_media_response` / `mock_media_poll` in the redis item script every shape. The real nodes
  are byte-identical to what promotes and were reachability-probed with zero writes (404/422).
- **zz-chat console voice stays working** (clone-only): `audio_b64 → decode → whisper-transcribe → console-whisper-adapter`
  re-shapes Whisper's `{text}` into the `media-route` item so ONE `patch-transcript` serves both. Not promoted.
- Legacy `Transcribe a recording` / `transcribed-message` / `sorento-sub-respond-sendmsg-respond-transcribed-message`
  (the dead `if-message-is-audio` TRUE arm) are untouched; `patch-transcript` still flips `E.attachment.type='text'`
  so that gate keeps taking its FALSE branch.

## 4. Customer copy inventory (all CRM-rendered; n8n sends verbatim)

| situation | string (source) |
|---|---|
| gate off, voice | `I cannot listen to voice notes on this number yet. Type your message instead and I will help straight away.` (`not_enabled`) |
| gate off, image | `I cannot read photos on this number yet. Type the codes instead and I will look them up straight away.` |
| clip too long | `That voice note is longer than {N} seconds. Please send a shorter one and I will listen to it.` (`too_long`) |
| burst | `That is a lot at once - give me a moment to catch up, then send the rest.` (once per window; then silent) |
| quota, no degraded model | `You have used all {L} of this month's {photo reads|voice notes}, so I have not {read|listened to} this one. The allowance resets on {date}. …` |
| 80 % warning (appended) | `You have {R} of {L} {noun} left this month. The allowance resets on {date}.` |
| degraded (appended) | `I am {reading|listening to} this one with a simpler model and may get it wrong, so typing … is exact. …` |
| voice confirmation (before the answer) | `Here is what I heard: "{transcript}"` (or the language-unsure variant) |
| image confirmation (before the answer) | `I read {codes} from that photo. Is that right?` / conflict questions |
| captionless image / unclear intent | `I read {codes} from that photo. What would you like me to do with it?` (turn ends) |
| **fallback** — timeout / HTTP error / provider failure / pending exhausted, voice | `I could not make out that voice note. Please send it again or type your message and I will help straight away.` (`wording.voice_unclear`, reused) |
| **fallback** — same, image | `I could not read anything from that photo. Type the codes and I will look them up straight away.` (`wording.nothing_read`, reused) |

## 5. Verified (2026-08-19, clone `2f36a7f4`, 17 executions, all `success`, zero egress)

See `tests/media-intake-UAC.md` §results and the rollup. Highlights: MI-01/09/15 voice → `tf-message.text ==
"any order for MUB6201"` → reformulator (mock, and REAL fork on MI-15) → real CRM orders read → the orders answer
(would_send); MI-02/12 image+caption → `check stock for these: MUB6201` → stock answer, with `warn_80` / `degraded`
appended to the confirmation; MI-03/04/05/06/07a/08/10/11/11b each produced exactly the intended CRM copy via
`send-media-reply` (guarded fork, guard-path only); MI-07b silent; MI-13/14 text/pdf turns byte-identical to today.
Prod ingest list `sorento-respond-message` LLEN 0→0 on every run; no orphaned egress node, no HI sub, no real
media HTTP node executed.

## 6. Promotion plan (captain-gated — NOT executed)

Target: live spine `9qVyfUxmRQqrpGRMDLRuz` (127 nodes, `3058796a` at 2026-08-19 02:53Z — re-read first; it moves).
Mechanism: one REST `PUT` assembled from a FRESH GET + `tests/diffs/media-intake/*` (byte-exact, `jq --rawfile` /
`build-clone.py`-style), `{name,nodes,connections,settings:{executionOrder}}`; PUT auto-activates on this instance;
sha-verify after; backup JSON before (`tests/backups/media-intake/LIVE-<ver>-PRE.json`).

Order:
0. **Decide** (captain): (a) CRM gate replaces the respond.io `is_allowed_voice` gate → migrate/enable
   `contact_media_limit` rows for every contact that has `is_allowed_voice=true` today BEFORE flipping (else they
   are refused with `not_enabled`); (b) confirm the two fallback strings in §4; (c) confirm the `🎤` confirmation
   becomes the CRM text.
1. CRM side preflight: `zz-media-probe` (`tF02D1bUGYBADVkN`, webhook, inactive) → expect 404 + 422 (done 2026-08-19).
   Operator: enable image/voice for the pilot contact(s) on the CRM contact page; set `media_sync_wait_seconds`
   (30) / `max_clip_seconds` as desired.
2. Live spine hunk (guards stripped = the clone-only nodes are simply NOT added):
   - REMOVE `if-audio-in`, `if-voice-allowed`, `fetch-audio`, `whisper-transcribe`, `send-voice-not-allowed`.
   - ADD `detect-media`, `if-media-in`, `media-extract-http`, `media-extract` (NoOp), `media-route`, `if-media-poll`,
     `wait-media-poll`, `media-poll-http`, `media-poll-merge`, `if-media-ok`, `if-media-reply`, `send-media-reply`
     (→ live sendmsg `aoydkG1dbItXR5jXFEQsP`, **no `is_test`/`test_run_id` inputs**).
   - WIRE `redis-pop → detect-media → if-media-in`; `if-media-in[0] → media-extract-http`; `if-media-in[1] → tf-message`;
     `media-extract-http → media-extract → media-route → if-media-poll`; poll loop `wait-media-poll → media-poll-http →
     media-poll-merge → media-route`; `if-media-ok[0] → patch-transcript`; `if-media-ok[1] → if-media-reply[0] → send-media-reply`.
   - REPLACE `patch-transcript.jsCode`, `if-transcribed-confirm` leftValue, `send-transcript-confirm.message` (files in
     `tests/diffs/media-intake/`).
   - Not added on live: `media-egress-gate`, `media-extract-mock`, `media-poll-gate`, `media-poll-mock`,
     `console-whisper-adapter`, and the `if-audio-b64` console lane (live has none).
3. Pilot: ONE real voice note + ONE real image from the captain's own number (`437264483`, "Jayson") with media access
   enabled on the CRM; watch the live exec: `detect-media._media`, `media-extract-http` response (`decision`,
   `status`, `tier`, `quota`), `media-route.action`, `tf-message.text`, the confirmation + answer. Also ONE refusal
   (e.g. temporarily disable voice on the contact → `not_enabled`).
4. Regression watch: next N real text turns byte-normal (`if-media-in` FALSE → `tf-message`).

Rollback: `PUT` the PRE backup JSON back (one call; restores the Whisper lane), or `publish_workflow` the prior
`versionId`. No CRM change is needed to roll back (the CRM endpoint is inert when not called). Replay-harness note
(LESSONS #40): `detect-media` adds `_media` at the item root on EVERY turn — register it in the replay `norm()` as
ignored-when-`modality:null`.

## 7. Known residuals / out of scope

- Respond.io carries no voice duration → the hint is an estimate (see §3); the worker's measured cap is the enforcement.
- `rendered_text` for images appends only ENTITY raws; attributes (batch numbers…) reach the customer via the
  confirmation only (CRM contract, PLAN §4.5).
- A refusal/fallback reply is sent before the `is-human-intervened` check (same as today's `send-voice-not-allowed`).
- Multi-media messages (`media_ordinal` > 0) are not split; respond.io delivers one attachment per message today.
- Documents (pdf) and video keep today's behaviour (no extraction).
