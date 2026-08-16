# Ideation multi-modal — n8n build plan (STT + media_selection + is_new_idea)

Implements `sorento_crm/documentation/plans/ideation/PLAN-ideation-capture-n8n.md` (DC-1..DC-10,
UAC Group F) on the TEST clone `txiPzSxy3Pclsz6v` + parser fork `wI5RkNGW3EOJfBdo`.
Builds on `ideation-intake-plan.md` §Revision 5 (text ideate already green end-to-end).

Grounded against live `9qVyfUxmRQqrpGRMDLRuz` + clone via MCP/REST, 2026-07-20.

---

## 0. Corrections to the hand-off doc (verified, not assumed)

1. **Auth header.** The hand-off says `Authorization: Bearer {EXTERNAL_API_KEY}`. The code is
   `get_api_key(x_api_key = Header(None, alias="X-API-Key"))` — **`x-api-key` is correct**.
   `ideate-turn-http` already sends it. Do NOT switch to Bearer.
2. **"n8n does not need to write session_vars" is not achievable.** `compile-current-state →
   save-session-vars` fires on EVERY turn, whole-blob, unconditionally — it is not opt-in.
   **DECISION (user, 2026-07-20): n8n REMAINS the session_vars writer.**
   → Dependency on sorento: `handle_turn(..., session_vars=None)` must accept the caller's blob
   and SKIP `overwrite_for_contact`. Until that lands, n8n's PUT clobbers the endpoint's flat
   top-level `ideation` key — which now also carries `pending_media` / `seen_media_ids`, so the
   §3 media menu is **non-functional in live**. It will still pass on the clone (n8n writes
   n8n_test, so prod's copy survives) — do not read a green clone run as live-safe.
   n8n already sends `session_vars: { ideation: … }` flat; it activates on their deploy.
3. **Voice was NEVER working — on live either.** Confirmed by user. The chain is abandoned
   scaffolding, broken in three independent ways:
   - `if-message-is-audio` TRUE (`attachment.type == "audio"`) → **empty** on live AND clone.
   - `Code in JavaScript` returns `{data: <url>}` (a STRING) and has no inbound. Whisper needs
     **binary**.
   - `Transcribe a recording` has `binaryPropertyName: "{{ …attachment.url }}"` with **no `=`
     prefix** (the standing MISSING_EXPRESSION_PREFIX warning) → literal string; and it should be
     a binary property NAME anyway.
   - `transcribed-message` writes `output.message = $json.text`, a shape nothing downstream reads.
   → §2 is a **BUILD**, not a reuse. `ideation-intake-plan.md` §6 ("reuse existing transcription")
     is retired.

---

## 1. Message shape (grounded from exec 9240705, not inferred)

```
redis-pop-main-message-list .json
  └ message                       ← the queue item (A)
      ├ message                   ← (B)  == tf-message's OUTPUT
      │   ├ message               ← (D)
      │   │   └ message           ← (E) { text, type, attachment{type,url,description} }
      │   └ replyTo {}
      ├ contact {...}, messageId, replyTo, test_run_id, scope, mode
```
`tf-message` = `return $input.first().json.message.message` → emits **B**.
So downstream's `$('tf-message').first().json.message.message.text` resolves to **E.text**,
and `…json.message.message.attachment.type` to **E.attachment.type**.

**This is why the transcript must be patched BEFORE `tf-message`.** Every downstream node
resolves the turn text via `$('tf-message')` *by node name*; a new node inserted later is
invisible to them. Patching E upstream makes a voice turn indistinguishable from a text turn
with **zero downstream edits**.

---

## 2. STT build (DC-5) — ✅ BUILT + GREEN (2026-07-20, clone `3222c618`)

**Result — both lanes verified through the chat console:**

| case | result |
|---|---|
| `/voice whats the stock for SRTWC8354-SH-200` (mock lane) | ✅ confirmation send, THEN normal CRM stock answer — proves STT is generic, not ideation-coupled |
| `/voice I have an idea… alert us when stock runs low…` | ✅ confirmation, then `ideate` → real extraction (problem/solution/department from the transcript) |
| `/voiceurl …/Example.ogg` (real lane: fetch + Whisper) | ✅ transcribed "This is an example sound file in [Ogg] Vorbis format from Wikipedia, the free encyclopedia", then classified normally |

Two sends per voice turn, as specified. `format-out` in `zz-chat` maps the whole `chat:reply`
list and joins with `\n\n`, so both messages surface in the console.

**Record-from-browser console → `tools/voice-console/` (NOT an n8n webhook).**
Run `python3 tools/voice-console/serve.py` → open `http://localhost:8000/`. Record button →
`MediaRecorder` → the blob is POSTed as `files` **multipart**, exactly like the widget's
paperclip, so it lands on the identical spine lane (base64 → queue → decode → real Whisper).

⚠️ **`zz-voice` (`1ZhTGt0LjWuju3qG`) was the first attempt and CANNOT work — left DEACTIVATED.**
Two independent blockers, both verified with Playwright + curl (not assumed):
1. n8n returns `content-security-policy: sandbox …` **without `allow-same-origin`** on every
   generic webhook response. The document gets a null origin, `sessionStorage` throws
   `SecurityError` (killing the whole script before any handler binds — the "Record does
   nothing" bug), and `getUserMedia` is unavailable. A second CSP header cannot relax it:
   browsers **intersect** CSP headers. NOTE the chat route (`/webhook/{id}/chat`) is served
   WITHOUT this header — the sandbox applies only to generic webhook responses.
2. Hosting the page on any other origin also fails: the chat webhook honours the node's
   `allowedOrigins` on the **OPTIONS preflight** but its **POST** response always carries
   `Access-Control-Allow-Origin: <n8n base url>`. The browser therefore blocks the response
   no matter what `allowedOrigins` says.

→ `serve.py` sidesteps both: the page is served from localhost (a secure context, so the mic
works) and the server **proxies `POST /chat` to n8n server-side**, where CORS does not apply.
The page's request is same-origin, so no CORS is involved at all.
Gotcha baked into the proxy: Cloudflare fronts the n8n host and rejects the default
`Python-urllib/3.x` agent with `error code: 1010` — a browser `User-Agent` is required.

**Verified end-to-end in a real browser (Playwright):** mic stubbed with a synthetic 440 Hz
`MediaStreamDestination`, clicked Record → Stop → 330 KB webm → proxy → **real Whisper** →
`"Breeeeeeeeeeeeeeeeeeeeeed"` (correct for a pure tone) → confirmation + normal processing.
Everything downstream of `getUserMedia` is proven; only a genuine mic+permission needs a human.
Chromium records webm, Safari mp4; Whisper accepts both.
`zz-chat`'s `allowedOrigins` was narrowed from `*` to an explicit localhost + n8n-host list
during diagnosis and left that way (stricter than found; the proxy makes it moot).

**Test affordances added to `zz-chat` `build-item`** (the console is text-only and redis is NOT
reachable from outside the n8n host, so a voice turn cannot otherwise be injected):
- `/voice <transcript>` → mock lane: audio-shaped item + `mock_transcript`; skips fetch+Whisper.
  Deterministic, 0 Whisper cost.
- `/voiceurl <url>` → real lane: `fetch-audio` downloads, Whisper transcribes.
- anything else → ordinary text turn, unchanged.

### Per-contact voice access — ✅ BUILT (clone `d2b13410`, user request 2026-07-20)

Voice (and therefore Whisper spend) is gated per contact on a respond.io custom field
`is_allowed_voice`, so only named people can send voice notes.

```
redis-pop → if-audio-in ─TRUE→ if-voice-allowed ─TRUE→ if-audio-mock → … → whisper …
                               └FALSE→ send-voice-not-allowed  (dead-ends; NO Whisper spend)
```
Gate expression mirrors the existing `is-human-intervened` idiom exactly:
`contact.custom_fields.find(x => x.name == 'is_allowed_voice')?.value?.toBoolean() == true`

**Fail-closed:** a contact with the field absent or false gets refused, so voice is opt-in per
person rather than opt-out. The refusal fires BEFORE `fetch-audio`/`decode-audio-b64`, so a
disallowed contact costs zero Whisper tokens.

**Why reading it at `if-audio-in` (pre-`tf-message`) is correct, not a shortcut:**
`sorento-sub-respond-findcontact-respond` is NOT a sub-workflow call — it is a Code node whose
entire body is `return $('redis-pop-main-message-list').first().json.message.contact`. So
"findcontact" IS the queue item's contact; reading `custom_fields` off the queue item is the
SAME data the canonical `is-human-intervened` gate reads, just earlier in the chain.
(A scan of live executions showed contacts with no `custom_fields`, but those were **empty pops**
— `{"message": null}` — not real turns. Don't mistake an idle poll for a payload shape.)

**Verified (clone):** no field → refused, no Whisper; `is_allowed_voice=true` → transcribes on
BOTH the attachment lane and the `/voice` mock lane; typed CRM turns unaffected throughout.

**Test harness:** `zz-chat` fabricates its contact, so `build-item` now sets
`is_allowed_voice: 'true'` by default and accepts a **`/novoice`** prefix to flip it to false and
exercise the refusal path. Production reads the REAL respond.io field — the console default is
harness-only and must not be mistaken for the prod default (prod is fail-closed).

### ⚠️ Whisper language: PINNED to `en` (user-verified 2026-07-20)

`whisper-transcribe.options.language = "en"`. Left empty (auto-detect) it mis-identified
**Malaysian-accented English as Malay** and then decoded the whole clip through a Malay prior,
so English speech came back as Malay-ish text — which fed the parser and the ideation extractor
garbage. Whisper runs language-ID BEFORE transcription; pinning the language skips LID entirely.

**Diagnostic trap to avoid repeating:** a macOS `say` TTS clip transcribes perfectly under
auto-detect (unaccented studio audio gives LID an easy call), so TTS CANNOT reproduce this —
it masked the bug and led to a wrong conclusion that sorento's extractor was inventing Malay.
It was not: the draft is CONTACT-scoped, so Malay fields written by earlier accented voice turns
were simply being echoed back in the review summary. **Test accent-sensitive behaviour with a
real human voice, never TTS.**

⚠️ **Conflicts with the hand-off's DC-5 intent** ("multilingual — handles EN/Malay/Chinese
code-switching"). `en` is right while the testers speak English, but a genuine Malay or Chinese
voice note will now transcribe badly (Whisper forced to `en` transliterates or garbles rather
than failing loudly). **Decision needed before promote** — options: keep `en`; make it
per-contact configurable; or two-pass (auto-detect, re-run pinned if the parser can't classify).

### Design as built

`redis-pop-main-message-list → tf-message` is a single edge today. Insert:

```
redis-pop-main-message-list
  └→ if-audio-in            (E.attachment.type == 'audio')
        ├ TRUE  → fetch-audio       HTTP GET E.attachment.url, response format = file → binary `data`
        │       → whisper-transcribe  openAi audio/transcribe, binaryPropertyName = "data"  (literal)
        │       → patch-transcript    Code (below)
        │                              ↓
        └ FALSE ─────────────────────→ tf-message
```

`patch-transcript` (Code) — deep-clone the redis item, then:
- `E.text = <whisper transcript>`
- `E.type = 'text'` and **`E.attachment.type = 'text'`** — so the *existing* downstream
  `if-message-is-audio` gate takes its FALSE (normal) branch instead of the dead-empty TRUE one.
  No rewiring of that gate needed. Sorento's lookback fetches the audio from Respond itself
  (hand-off §2), so nothing is lost by neutralising the local attachment type.
- keep the original url as `E.attachment.source_url` + set `_transcribed = true`,
  `_transcript = <text>` for the confirmation reply and for debugging.

Then the transcript flows through `tf-message → findcontact → … → parser` exactly like typed text,
so `ideate` classification, CRM domains, and every existing branch work unchanged.

### 2b. "Here's what I heard" confirmation
Per user: reply with what was captured, THEN process normally. Emitted after
`sorento-sub-respond-findcontact-respond` (contact must be resolved to send). Reuses the existing
send sub — on the clone that routes to `chat:reply`, never WhatsApp.
⚠️ **`Transcribe a recording → sorento-sub-respond-sendmsg-respond-transcribed-message` must stay
orphaned** on the clone — it is a real egress node.
**OPEN (see §5 Q1):** separate message vs prefix on the single answer.

---

## 2c. Ideation access control — ✅ BUILT (clone `0c9a7434`, user request 2026-07-20)

Ideate turns are now gated by their **own** access agent so ideation can be granted/revoked
independently of every CRM domain.

`check-access-http` body — the `agent` field became:
```
domain_hint === 'ideate' ? 'ideation' : routing.suggested_agent
```
The gate itself is unchanged: `check-access → If5 → (TRUE) If2 → If-ideate`. Access is evaluated
BEFORE the ideate branch, so a denied contact never reaches the turn endpoint at all.

**Verified:**
| turn | agent sent | endpoint | If5 |
|---|---|---|---|
| "I have an idea, we should add a supplier scorecard" | `ideation` | `deny_unknown_agent` | FALSE → blocked |
| "whats the stock for SRTWC8354-SH-200" | from routing | `allow` | TRUE → normal |

⚠️ **`ideation` must be registered in the CRM or ALL ideate turns stay denied.** Probed live:
`POST /external/access-agent/check` with `agent=ideation` → `{"allowed":false,
"decision":"deny_unknown_agent"}`. Fail-closed, so this is safe — but ideation is OFF until the
CRM has the agent and grants it to contacts.

**FINAL placement — parser fork `wI5RkNGW3EOJfBdo` (`d2fea43e`), single source of truth.**
`deriveRouting` gained `case 'ideate': return { suggested_team: null, suggested_agent: 'ideation' }`.
Both consumers read the SAME field: `check-access-http` sends `routing.suggested_agent`, and the
no-access message is rendered from it — so the denial correctly reads "ideation". An earlier
spine-side ternary was REVERTED; fixing placement and fixing the denial text were the same fix,
and the spine version could only ever produce one or the other. Verified:
```
routing {suggested_team:"warehouse", suggested_agent:"ideation"}
access  {allowed:false, decision:"deny_unknown_agent"}
reply   "Sorry, you are not allowed to access ideation"
```
`suggested_team` stays `warehouse` (inherited via the `?? priorRouting` fallback) — **accepted by
the user**; ideate never escalates and access keys only on the agent.

**Denial visibility fix (`sorento-sub-respond-sendmsg-respond5` on the clone).** It now passes
`contact` = findcontact json, mirroring `respond2`. Root cause: **live's `respond5` omits
`contact` too** — harmless in prod because the real respond.io sub addresses by
`contact_identifer`, but `sub-sendmsg-CHAT` derives `chat:reply:{chat_id}` from `contact`, so on
the clone the denial had nowhere to go and read as "(no reply within 12s)". A clone-harness gap
inherited from live, not a regression. The test/prod split itself is at the SUB level
(`sorento-sub-respond-sendmsg-respond` on live ↔ `sub-sendmsg-CHAT` on the clone, plus `is_test`);
adding `contact` to live's `respond5` at promote time is optional and a no-op for the real sub.
Verified end-to-end on BOTH lanes (typed + voice): transcript, then the denial, then CRM
regression clean.

**Superseded placement note:** the textbook home is `deriveRouting` in the parser fork
(`domain → {team, agent}`), but that would (a) require re-sending a 43,465-char `jsCode` through
MCP — reproduction risk on a file not fully read — and (b) add a THIRD unpromoted change to fork
`wI5RkNGW3EOJfBdo`, coupling an access-control switch to a parser promote. The access gate is a
spine concern, so it promotes with the spine instead. A patched `deriveRouting` with
`case 'ideate': return { suggested_team: null, suggested_agent: 'ideation' }` is prepared at
`scratchpad/oe-patched.js` — fold it in when the fork is next opened for `is_new_idea`, then the
two agree (parser becomes canonical; the spine ternary becomes redundant, not wrong).

**Two pre-existing deny-path gaps surfaced (NOT caused by this change — the console had never
hit a denial before):**
1. `sorento-sub-respond-sendmsg-respond5` is called with `contact: null`, so `sub-sendmsg-CHAT`
   cannot derive `chat_id` and the denial never reaches the console (shows as
   "(no reply within 12s)"). The live spine sends via the real sub, so prod users DO get the
   message — this is a clone-testability gap.
2. The denial text reads "Sorry, you are not allowed to access **general_enquiries**" — built
   from `routing.suggested_agent` rather than the agent actually checked. Should say `ideation`.

## 3. `media_selection` (DC-7) — ⚙️ BUILT, NOT YET TESTABLE (clone `2c309663`)

Built into the `ideate-turn-http` body. Derived from the parser's EXISTING signals — no new
parser work was needed:
- `reference_positions.length > 0` → `media_selection = positions.join(',')`
- `select_all_expanded === true` → `'all'`
- otherwise **omit the field entirely**

Omitting is behaviourally identical to `'none'` (sorento treats absence as "menu dismissed" and
routes normally), so `'none'` needs no keyword matching — nothing here pattern-matches text,
which keeps the no-overfit rule intact.
Gated on `ideation.pending_media` being set; the body also now sends `submitter_name` (WS-A).

**Cannot be end-to-end tested yet:** producing a `pending_media` menu requires sorento's media
lookback (`feat/ideation-capture-parity`) deployed AND real media on the Respond conversation.
Verified only that a normal ideate turn still round-trips with the field correctly absent.

## 3-OLD. `media_selection` — original design notes

Gate: only when `session_vars.ideation.pending_media` is set. n8n reads its own persisted blob
(`get-session-vars` → nested `variables.ideation`), which since Rev-5 carries the endpoint's
returned pointer **wholesale** — so `pending_media` rides along automatically.

The parser **already emits `reference_positions`** (used by the existing numbered pickers), so
this is likely NOT new parser work — gate the existing field on `pending_media` and pass the raw
string. Verify `reference_positions` populates for `all` / `none` (may need a prompt tweak; those
are not positional).

- positions found → `media_selection: "<raw>"` on the `/turn` body
- none found → omit the field entirely, route the turn normally (hand-off §3 step 2 — a
  mid-selection CRM interrupt must never be swallowed)

## 4. `is_new_idea` (DC-10) — NOT BUILT. Failure mode already reproduced live.

While regression-testing §3, two unrelated ideas silently merged into ONE draft
(`5bc4f24f-e515-4eef-8d8d-aee9a23750f2`):
```
transcript: [ "...alert us when stock runs low so purchasing can reorder early",
              "...let us export the outstanding order list to Excel" ]
```
The second turn overwrote `proposed_solution` while keeping the first idea's problem statement.
This is precisely what DC-10 prevents — it is a real defect today, not a hypothetical.

Also confirmed: **drafts are CONTACT-scoped, not chat-session-scoped.** A brand-new console
`sessionId` still resumes the open draft for `437264483`, because the pointer lives on the
contact. Any test that assumes a fresh session starts a fresh idea is wrong.

### Design

Only when the turn classifies `ideate` AND `ideation.draft_id` is already set. Needs a **new
parser output field** on fork `wI5RkNGW3EOJfBdo`: semantic "is this a genuinely different idea
than the open draft about `<topic>`?" — extracted by meaning, no keyword matching (no-overfit
rule). Requires passing the open draft's topic into the parser as context.
Yes → `is_new_idea: true`. No/unsure → omit (default resume). **Never** expire on age.

---

## 5. Open questions

- **Q1 (blocking §2b):** confirmation as its OWN message then the answer as a second (matches the
  user's wording, but 2 sends/turn and the chat console may only surface the last), or prefixed
  onto the single answer ("I heard: …\n\n<answer>")?
- **Q2:** voice test path — the chat console is text-only, so a voice turn must be driven by
  injecting a queue item with `attachment.type='audio'` + a fetchable URL. Use a public sample, or
  a real Respond CDN url (may need auth)?

## 6. Acceptance (n8n side)

- Voice-only idea → transcribed → confirmation shown → classified `ideate` → captured, with idea
  `raw_text`/fields from the transcript.
- Voice-only **CRM** query (e.g. spoken stock check) → answers normally — proves STT is generic and
  not ideation-coupled.
- After the media menu, `1,3` reaches `/turn` as `media_selection`; "it saves 2 hours" does not.
- "actually, different idea …" on an open draft sends `is_new_idea:true`; "and also it should…"
  does not.
- `audio_attachment_ref` is never sent (already true).
- Non-voice, non-ideate turns byte-identical (regression).
