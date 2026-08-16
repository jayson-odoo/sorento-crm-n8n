# Failover poller — proactive respond.io pull when the webhook is down (plan)

**Status:** design locked via grill session 2026-07-13. Not built yet.
**Why:** respond.io's inbound webhook (respond → our n8n producer `sorento-main`) is down; respond is
fixing it. Meanwhile we proactively **poll** respond.io for incoming messages from AI-allowed contacts
and drive the existing chatbot spine ourselves. Manual on/off. Real customer replies in `live` mode —
this is genuine prod failover, **not** a zero-egress test tool (a test mode exists for build/rehearsal).

> HARD RULE still applies to **test mode**: test never reaches a real contact (drives the clone, zero
> egress). `live` mode intentionally sends real WhatsApp — that is its job.

---

## 0. Decisions (all user-gated, locked)

1. **Two runtime modes**, one `failover_state.mode` flag:
   - `test` → poll scoped to **dev contact `437264483` only**, inject into the **clone** (`main-message-list-test` → clone spine `txiPzSxy3Pclsz6v`), **zero egress**, verify in egress log / chat rendezvous.
   - `live` → poll the full `is_allowed_ai=true` set, inject into the **live** spine (`main-message-list` → `9qVyfUxmRQqrpGRMDLRuz`), **real replies**.
2. **Manual on/off.** No auto webhook-down detection. Controlled by the `failover_state` row via the webpage.
3. **Dedup ledger in Postgres `n8n_test` DB** (isolated). **Claim-before-inject** (atomic `INSERT … ON CONFLICT DO NOTHING RETURNING`; only the winner injects; on inject failure, delete the claim to retry). Never double-reply; worst case is one lost message on an n8n crash mid-inject (acceptable for a bot).
4. **Contact allow-list = respond.io custom field `is_allowed_ai` (string `"true"`)**, read from `custom_fields[]`. **Field missing / `null` / not `"true"` → not allowed (default-deny).** The spine's own `contact_agent_access` check stays the real per-domain gate (its no-access reply is normal UX).
5. **Message identity & ordering = `messageId`** (numeric). respond.io `messageId` **is a timestamp**: `unix_seconds = messageId // 1_000_000` (last 6 digits = microseconds). Verified: `1783908698634447` → 2026-07-13 10:11:38 MYT. No top-level message timestamp field exists, so `messageId` is the ordering key, the per-contact watermark, and the ledger PK.
6. **Cadence = 15s full-sweep.** ~100 allowed contacts, no API activity-signal to gate on (respond `/contact/list` has no queryable last-interaction), so each sweep must `list_messages` all allowed contacts. ~100 calls ≈ ~10s under rate limit; 15s gives headroom. Allowed set **cached**, refreshed every few minutes.
7. **Injection via producer copies (fidelity, Q8 option A).** Poller POSTs a producer webhook that RPUSHes the right list. `sorento-main` (the real respond-facing producer) is **disabled during live failover** so respond can't double-feed; a separate `sorento-main-INJECT` copy carries our live injection.
8. **Text-only v1.** Only `message.type==='text'` injected. Media (`attachment`/`location`) → ledger `skipped_media`, logged, never injected.
9. **Seed + human label before go-live.** A one-shot backfill loads `pending` rows from a cutoff; user labels `answered`/`needs_answer` on the webpage; only `needs_answer` is injected (paced), then the poller runs autonomously for anything newer than the seed watermark.
10. **Promotion = mode flip only.** All failover pieces are **new** workflows; they never edit the live spine or subs. `test → live` + confirm is the whole promote. No live-workflow backup/edit/promote.

---

## 1. respond.io API (v2) — grounded from the official SDK (`@respond-io/typescript-sdk` 1.4.0)

- **List contacts:** `POST https://api.respond.io/v2/contact/list`
  body `{ search?, timezone, filter: { $and?: FilterCondition[], $or?: FilterCondition[] } }`,
  query `limit` (≤100), `cursorId` (numeric; `pagination.next` gives the next URL).
  `FilterCondition = { category:'contactField'|'contactTag'|'lifecycle', field, operator, value }`.
  Operators incl. `isEqualTo`, `exists`, `isTimestampAfter`, … .
  Allowed-set filter: `{ category:'contactField', field:'is_allowed_ai', operator:'isEqualTo', value:'true' }`.
  ⚠️ Build-time: confirm the custom-field server-side filter actually narrows; else fetch all (≤100, ~1–2 pages) and filter `custom_fields[].name==='is_allowed_ai' && value==='true'` client-side.
  Contact item (verified live): `{ id (number = respond_io_id), firstName, lastName, phone, custom_fields:[{name,value}], status:'open'|'closed', assignee, lifecycle, created_at, … }`.
- **List messages:** `sdkClient.messaging.list(identifier, { limit≤100 default 20, cursorId })`
  (endpoint slug `m4ay6be8n8ckc-list-messages`; **confirm the exact HTTP path/verb at build** — SDK abstracts it, likely `GET /v2/contact/{identifier}/message?limit=&cursorId=`). Newest-first, cursor = numeric messageId.
  Message item: `{ messageId (number), channelMessageId, contactId, channelId, traffic:'incoming'|'outgoing', message: {type:'text', text} | {type:'attachment', attachment:{type,url}} | …, status?:[{value,timestamp}], sender? }`.
  **No top-level timestamp** → use `messageId` (see §0.5).
- **Identifier format:** `id:{n}` | `phone:+{n}` | `email:{e}`.
- **Rate limit:** confirm from response headers at build (respond returns `RateLimitInfo`; SDK surfaces it on `APIError`). Design assumes ~10 req/s workspace-wide; poller must handle 429 with backoff + carry state to next sweep.

---

## 2. Data model (Postgres `n8n_test` @ 72.62.195.19, cred `Dnnofg8Xb27VQOhI`)

```sql
-- dedup + label ledger
CREATE TABLE failover_ledger (
  message_id    bigint       NOT NULL,          -- respond.io messageId (also encodes ts)
  contact_id    bigint       NOT NULL,          -- respond_io_id
  mode          text         NOT NULL,          -- 'test' | 'live'
  text          text,                            -- incoming message text (for the label UI)
  status        text         NOT NULL,          -- pending|answered|needs_answer|injected|skipped_media
  injected_at   timestamptz,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (mode, message_id)                 -- claim key; test/live isolated in one table
);

-- per-contact high-watermark (max messageId already handled)
CREATE TABLE failover_watermark (
  mode        text   NOT NULL,
  contact_id  bigint NOT NULL,
  watermark   bigint NOT NULL,                   -- max messageId injected/seeded for this contact
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mode, contact_id)
);

-- single control row per mode (on/off, mode, cutoff)
CREATE TABLE failover_state (
  mode               text PRIMARY KEY,           -- 'test' | 'live'
  enabled            boolean NOT NULL DEFAULT false,
  cutoff_message_id  bigint,                      -- seed floor = cutoff_ts_unix * 1_000_000
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- view for the label webpage (decodes messageId -> MYT)
CREATE VIEW v_failover_pending AS
SELECT mode, contact_id, message_id, text,
       to_timestamp(message_id / 1000000) AT TIME ZONE 'Asia/Kuala_Lumpur' AS arrived_myt,
       status
FROM failover_ledger WHERE status='pending' ORDER BY contact_id, message_id;
```

Reset for a test rerun: `DELETE FROM failover_ledger WHERE mode='test'; DELETE FROM failover_watermark WHERE mode='test';`.

---

## 3. Workflows (all NEW — nothing edits the live spine/subs)

### 3a. `sorento-main-INJECT` (new, copy of producer) — LIVE injection intake
Copy of `sorento-main` (`NwMOBEQ1NW7LVky5`); webhook trigger on a **new path**; RPUSHes the **live** `main-message-list`. Exists so we can disable the real respond-facing `sorento-main` during failover without blocking our injection.

### 3b. `sorento-main-TEST` (new, copy of producer) — TEST injection intake
Same as INJECT but RPUSHes `main-message-list-test` (→ clone spine). (Reuse an existing test producer if one already RPUSHes the test list; verify at build.)

### 3c. `failover-seed` (new, manual trigger) — one-shot backfill
For each allowed contact (mode-scoped): page `list_messages` newest→back, take `traffic==='incoming' && messageId >= failover_state.cutoff_message_id`, stop paging once `messageId < cutoff`. `INSERT` each as `failover_ledger(status='pending', text, …)` (text messages) or `status='skipped_media'` (non-text). Does **not** inject. Idempotent (ON CONFLICT DO NOTHING) so re-runnable.

### 3d. `failover-poller` (new, Schedule Trigger 15s) — the loop
1. Read `failover_state` for the active mode. `enabled=false` → exit immediately.
2. Allowed set: cached; refresh via `POST /contact/list` (filtered) every N min. In `test`, hard-scope to `437264483`.
3. For each allowed contact: `list_messages(id, limit=~20)` → keep `traffic==='incoming' && message.type==='text' && messageId > watermark[contact]`, ascending.
4. **Claim-before-inject** per message: `INSERT INTO failover_ledger(mode,message_id,…,status='injected') ON CONFLICT DO NOTHING RETURNING message_id`. If no row returned → someone else has it, skip. If claimed → build the respond.io-shaped body (see §4) → POST the mode's producer webhook (`sorento-main-INJECT` live / `sorento-main-TEST` test). On POST failure → `DELETE` the claim (retry next sweep).
5. Advance `watermark[contact] = max(seen messageId)`.
6. **Backlog pacing (go-live):** drain `needs_answer` gradually — cap injects/contact/sweep (e.g. 1–2) so a burst of old messages doesn't fire N simultaneous replies. Non-text and `answered` never inject.
7. 429/backoff: on rate-limit, stop the sweep early, resume next tick (watermarks make it resumable).

### 3e. `failover-console` (new, webhook-served HTML) — one page, label + control
- Lists `v_failover_pending` (contact, text, arrived_myt) with **Answered / Needs-answer** buttons per row → writes `failover_ledger.status`.
- Controls: **Set cutoff** (datetime → `cutoff_message_id = unix*1e6`), **Seed** (fire `failover-seed`), **Go-live**, **Stop**.
- **Go-live** → set watermark per contact = max seeded messageId; `failover_state{enabled=true, mode=live}`; **call n8n REST API `PATCH` to deactivate `sorento-main` (`NwMOBEQ1NW7LVky5`)** (kills respond-facing intake); poller begins draining `needs_answer` (paced) then live-polls newer.
- **Stop** → `failover_state.enabled=false`; **reactivate `sorento-main`**; optionally deactivate `sorento-main-INJECT`.
- (Model the page on the existing `zz-chat` hosted webpage; auth = same scheme as chat console.)

---

## 4. respond.io message → producer body (reconstruct the webhook shape)

The producer wraps a respond.io webhook body and RPUSHes `queueItem.message = <body>`. Rebuild it from
the poll data (contact object from `/contact/list` + message from `list_messages`) so the spine sees an
input identical to a real webhook:

```jsonc
{
  "message": { "message": { "text": "<incoming text>", "type": "text" }, "replyTo": {} },
  "contact": { "id": "<respond_io_id>", "phone": "...", "firstName": "...", "lastName": "...",
               "custom_fields": [ ... /* from /contact/list */ ], "assignee": { "id": null } },
  "messageId": "<respond messageId>",
  "replyTo": null
}
```
- Deep text path the spine reads: `message.message.message.text` (LESSONS.md).
- Include `replyTo`/`reply_to_message_id` if the incoming is a quote-reply (respond gives `replyToMessageId`).
- Carry `messageId` so any future CRM persistence can finally store incoming `message_id` (today it's NULL).

⚠️ Build-time: verify the live producer is a pure "wrap + RPUSH" (chat-console notes say thin). If it does extra normalization, our reconstructed body must match its expected input exactly.

---

## 5. Safety invariants

- **Single live intake into `main-message-list`:** normal = `sorento-main` ON / INJECT off / poller off; failover = `sorento-main` OFF / INJECT fed / poller ON. Never both → no double-processing by construction.
- **test = zero egress:** clone target, `is_test`-guarded subs, orphaned egress nodes; replies only in egress log / chat rendezvous.
- **Claim-before-inject:** atomic ledger claim gates every inject; overlapping 15s sweeps can't double-send.
- **Default-deny** on the allow-list; text-only; media parked.
- **Manual flip-back:** on webhook restore → **Stop** (poller off, `sorento-main` back on). respond.io doesn't replay missed webhooks, so no overlap with the already-handled ledger.

---

## 6. Build phases

**Phase 0 — verify live facts (read-only):** producer internals (pure RPUSH?), live spine still single-list pop, exact `list_messages` HTTP path/verb + rate-limit headers, `is_allowed_ai` server-side filter behavior, a test producer for `main-message-list-test` (reuse vs create), n8n REST activate/deactivate on `sorento-main`.
**Phase 1 — schema:** create the 3 tables + view in `n8n_test`.
**Phase 2 — test lane:** `sorento-main-TEST`, `failover-seed`, `failover-poller` (mode=test, scoped to `437264483`), `failover-console`. Rehearse: WhatsApp yourself → poller picks up → clone reply in egress log; zero real egress; rerun after reset; prove claim-before-inject (no double), watermark advance, cutoff/seed/label/pace, media-skip.
**Phase 3 — promote:** create `sorento-main-INJECT`; wire Go-live's deactivate-`sorento-main` + Stop's reactivate; flip `failover_state.mode=live`; one controlled live round-trip on a known contact; confirm no double-send, respond intake off during failover, clean flip-back.

---

## 6e. Seed + labelling console BUILT & PASSED via browser (2026-07-13)

- **`failover-seed` (`fQCuEFElDbieTa3r`)** — POST `{cutoff_iso}`: sets `failover_state.cutoff`, fetches dev-contact incoming `messageId>=cutoff*`, inserts ledger `pending`(text)/`skipped_media`(non-text), ON CONFLICT DO NOTHING (never clobbers labels). Verified cutoff 2026-07-12→7 pending.
- **`fc-status` (`YDub0Jouk2V3gDAW`)** — rows(decoded MYT)+counts+enabled+qlen+egress. **`fc-action` (`aJ9PohAnlZzZmNP6`)** — Switch label/golive/stop; golive seeds `test:q`+tokens (run_id `fo-golive`), marks injected, enables.
- **`failover-console` (`MSwEWywFpuGXpYBn`)** — SERVER-RENDERED HTML (forms, not fetch) at `/webhook/failover-console`. Proxies to the above endpoints server-side. Auto-refreshes (meta-refresh → `?action=tick`) while draining.
- **CORS/CSP gotcha (important):** n8n force-sandboxes webhook HTML (`CSP: sandbox` w/o `allow-same-origin`) → page origin `null`; and n8n returns a FIXED `Access-Control-Allow-Origin`=instance host for every origin (ignores webhook `allowedOrigins:*`). So a `fetch()`-based SPA served from an n8n webhook can NEVER pass CORS. Fix = server-rendered `<form>` POST navigations (sandbox allows forms), proxying to other webhooks server-side (n8n→n8n, no browser CORS). Also n8n `multipleMethods:true` didn't register GET — use TWO webhook nodes (GET + POST, same path) → shared handler reading `$json`.
- **Browser-verified full flow (Playwright):** Seed(cutoff 07-12→7 pending) → label 2 needs_answer/answered → Go-live(inject 2) → auto-drain → **7 guarded replies, 0 real egress**; ETA question resolved to a real product reply, all `would_*`.

## 6d. Poller + e2e BUILT & PASSED (2026-07-13)

- **`failover-poller` (`TAnAt7ROwMXDhiCL`)** — TEST mode, webhook `failover-poll-tick`. Reads `failover_state`; if enabled, dev-contact `list-messages` → filter `incoming&&text&&messageId>watermark` → **claim** (`INSERT … ON CONFLICT DO NOTHING RETURNING`, base64 text = comma-safe) → **capture** to redis list `failover:test:injected` → **advance-watermark** on a PARALLEL branch off filter (so it advances even when claim fully dedups). A `claimed?` Filter drops the postgres `{success:true}` summary emitted on 0-row RETURNING. Verified: S1 15 claimed, S2 watermark-filter 0-new, S3 claim-dedup keeps 15 + watermark re-advances.
- **`zz-failover-e2e` (`IGzKGoCTihGRCBbU`)** — `action=seed` clears + seeds `test:q:437264483` from the poller sink (dedup by messageId, override `test_run_id`) + `ready-contacts-test` tokens; `action=read` returns `llen test:q` + `test:egress`.
- **e2e result:** 15 concurrent dev-contact messages drained through the real clone via the dispatcher (`zz-dispatch-test` fired 3× parallel/round). Per-contact lock serialized → each processed exactly once (guards: sendmsg=15, save-session-vars=15, save-message-redis=15, +2 attachment). **NON-`would_` real-egress entries = 0** → zero WhatsApp/CRM/log egress. Real reformulator produced genuine replies.
- **CLONE ITEM SHAPE (current concurrency clone) — critical:** the queue item MUST be `{ message:{ message:{ message:{ text, type:'text', attachment:{type:'text',description:''} }, replyTo:{} } }, contact:{ id, phone, firstName, lastName, custom_fields:[{name:'is_human_intervened',value:'false'},{name:'is_allowed_stock',value:'true'}], assignee:{id:null} }, messageId, replyTo:null, scope:'', mode:'uac', test_run_id }`. Note `message.message.message.text` (3-level) and **`mode:'uac'`** (real reads + egress blocked). The old canary 2-level shape is stale. Live injection (single-list `main-message-list`) uses the same item minus test fields.

## 6c. Phase-0 respond API probe — LIVE-VERIFIED (2026-07-13, wf `zz-failover-probe` `3xGqQRVm1SOd6Gjy`)

All respond-side unknowns resolved by a real read-only call:
- **Credential:** respond API uses **`respondIoApi` cred `sorento-api` (id `OiS59QkzpKfKSdaa`)** via `authentication:'predefinedCredentialType', nodeCredentialType:'respondIoApi'`. The `respond-io` httpHeaderAuth cred (`zTAhJ6e0DCI12aoZ`) is the WRONG one — unauthenticated → CloudFront WAF `403 Request blocked` (not a JSON 401). Copy the config from live sub `sorento-sub-respond-sendmsg-respond`'s `HTTP Request` node.
- **List contacts:** `POST /v2/contact/list?limit=100`, body **MUST include `search` (empty ok)** and the checkbox filter value **MUST be boolean `true`** (string `"true"` → 400): `{"search":"","timezone":"Asia/Kuala_Lumpur","filter":{"$and":[{"category":"contactField","field":"is_allowed_ai","operator":"isEqualTo","value":true}]}}`. → **76 allowed contacts, single page** (`pagination.next:null`), filter exact (`any_not_true:0`). Contact still stores the value as string `"true"` in `custom_fields[]` — filter wants boolean, display is string.
- **List messages:** `GET /v2/contact/id:{id}/message/list?limit=20[&cursorId=]` → `{ items:[…], pagination }`, **newest-first**. Item: `{ messageId, channelMessageId, contactId, channelId, traffic:'incoming'|'outgoing', message:{type:'text',text}|{type:'attachment',…}, sender:{source:'contact'|'ai_agent'|'workflow'|…}, replyTo, status:[] }`. Incoming signal = `traffic==='incoming'` (and `sender.source==='contact'`).
- **messageId is a timestamp**: incoming = `unix_seconds × 1_000_000` (trailing 6 zeros); outgoing carry microseconds. `1783918786000000` → 2026-07-13 12:59:46 MYT. Watermark/dedup/order all on this integer.
- **Rate limit headers:** `x-ratelimit-limit: 20`, `x-ratelimit-remaining`. 76 contacts/sweep ≈ 4s at 20/s → 15s cadence has wide headroom (could go tighter later).
- **n8n build gotcha (IMPORTANT):** `create_workflow_from_code` DROPS the `credentials` binding, and `update_workflow`'s `setNodeCredential` validator falsely rejects httpRequest creds. Attach creds via the **n8n public REST API PUT `/workflows/{id}`** (writes the active version directly). Do NOT follow with MCP `publish_workflow` — it re-pins the old cred-less version. REST PUT alone leaves `active:true` with creds live.

## 6b. Phase-0 verification results (done 2026-07-13, read-only against live n8n)

- **Producer `sorento-main` (`NwMOBEQ1NW7LVky5`) is NOT a pure RPUSH.** Flow: `Webhook (0b2cc5ea)` → `.body` → `consolidate` → `findcontact` sub **`D62_NHUOrugeULSFwfjEJ`** (re-resolves contact from respond by `contact.id`) → **`If1` gate `is_human_intervened==false`** → `concat_queue_body` → **`Redis1` INCR rate-limit (key=contact id, ttl=1s)** → `If ≤30` → **`Redis2` RPUSH `main-message-list`** (else → throttle-reply via sendmsg sub `aoydkG1dbItXR5jXFEQsP`). Injected body must carry `.contact.id`.
- **Two inbound triggers on the producer:** native `Respond.io Trigger` (`respondioTrigger`, webhookId `a1da9407…` — the one that's DOWN) + generic `Webhook` (`0b2cc5ea…` — what we POST). Deactivating the workflow kills both → confirms the need for a separate **`sorento-main-INJECT`** copy for live injection.
- **`is_allowed_ai` is NOT gated by the producer** (only `is_human_intervened`). Poller owns the `is_allowed_ai` filter.
- **Live intake is single-list `main-message-list`** (R3 confirmed). Live spine auto-pops it (~1s schedule).
- **respond API cred:** `respond-io` `httpHeaderAuth` **id `zTAhJ6e0DCI12aoZ`** — HTTP Request nodes call respond v2 with it; no `.env` token.
- **TEST injection: reuse `zz-sim-drive` (`wWAEz1CHmyTRHAPC`)** — it already seeds `main-message-list-test` + runs the clone (`waitForSubWorkflow`) + reads `test:egress:{id}`. **The clone `txiPzSxy3Pclsz6v` has triggerCount 0 → must be explicitly invoked after seeding** (unlike the live spine). So test = RPUSH test list + run clone; live = RPUSH `main-message-list` only.
- **INJECT copy build notes:** (a) `sorento-main-TEST` path unneeded — use `zz-sim-drive`; (b) `sorento-main-INJECT` = copy of `sorento-main` (keeps findcontact/`is_human_intervened`/rate-limit fidelity) with its own generic Webhook path; (c) beware the producer's **rate-limit throttle-reply is a live egress** — R2 pacing must stay under `≤30`/window; the test path must guard/neutralize that sendmsg.
- **Still respond-side, verify at build (needs a live respond call via HTTP node):** exact `list_messages` HTTP path/verb + newest-first + cursor walk; `is_allowed_ai` server-side filter vs client fallback; rate-limit headers.

## 6f. Known gaps to close for LIVE (not needed for dev-contact test)

- **Seed pagination — DONE (2026-07-13):** `failover-seed` `list-messages` now uses n8n httpRequest built-in cursor pagination (`responseContainsNextURL`, nextURL=`$response.body.pagination.next`, complete when next null, maxRequests 60, interval 150ms); `filter-seed` aggregates `.items` across all pages then filters incoming ≥ cutoff. Verified: dev contact cutoff 2026-05-01 → **454 seeded** (was 15 with single page — the contact has hundreds of older incoming). API caps message/list at 50/page.
- **Poller pagination (STILL A GAP for live):** `failover-poller` still fetches newest `limit=20` single page. Under a burst of >20 new incoming between 15s sweeps it would grab only the newest 20, advance the watermark past the older-but-unprocessed ones → **those are lost**. For live, paginate `list-messages` back until `messageId <= watermark` (or raise limit generously + accept the bound). Low risk at 15s cadence but must fix before high-volume live.
- **Cutoff tz:** server-rendered form posts tz-less `datetime-local`; `failover-seed` compute-cutoff appends `+08:00` (MYT) before `new Date()`, and the console decodes stored `cutoff_message_id` +8h for display — round-trip verified. Any new caller must send MYT or an explicit offset.

## 7. Open build-time confirmations
- Exact `list_messages` path/verb + whether it returns strictly newest-first and how `cursorId` walks.
- respond.io rate limit (headers) → finalize 15s (or adjust) and 429 backoff.
- `is_allowed_ai` server-side filter vs client-side fallback.
- Producer body contract (pure RPUSH vs normalization).
- Webpage auth + hosting parity with `zz-chat`.
- Whether to also persist incoming `messageId` into CRM `chat_histories` (separate optional fix; not required for failover dedup).
