# Domain single-source-of-truth (SSOT) + failover plan

**Status:** DESIGN — not built. Handoff doc.
**Date:** 2026-08-03
**Owner:** jayson

## Problem

On 2026-07-28 (Tue) the CRM host `fe-sorento.foundryx.my` went down. **Root cause = domain registration lapsed (unpaid renewal), NOT a server crash.** Recovery required manually re-pointing ~every n8n node to a different domain that also fronts the same CRM backend. Goal: change the CRM base in **one place** so all nodes swing over in one edit next time.

## Constraints

- **Free / community n8n** (self-hosted at `automate-sorento.foundryx.my`). No enterprise license.
- `$vars` (n8n Variables) — **enterprise only → unavailable.**
- `$env.CRM_BASE` in expressions — **blocked on this instance** (user confirmed tried, failed; community/free ships env access in expressions off via `N8N_BLOCK_ENV_ACCESS_IN_NODE`). **Do not use.**
- Safety rule (CLAUDE.md): never edit the live spine directly; build/test on the TEST clone `txiPzSxy3Pclsz6v`, promote only reviewed business-logic diffs, user-gated. No egress to real contacts during testing.

## Audit results (read-only, via n8n REST API, 2026-08-01)

Scope: **101 workflows** (72 non-archived + 29 archived; MCP hides archived — enumerated via REST). Counts = **distinct config locations** (workflow+node+param+value); raw hits ~2× because published workflows serialize draft+active copies.

| Host | Distinct config locations | Workflows (active/archived) | Notes |
|---|---|---|---|
| **`fe-sorento.foundryx.my`** | **67** | 20 (13 active / 7 archived) | CRM API — the outage host. ~60 = `httpRequest` url params |
| `72.62.195.19` (raw IP) | 11 | 3 (3 active) | failover stack calling n8n's own webhooks by IP — fragile |
| `automate-sorento.foundryx.my` | 4 | 4 (3 active/1 arch) | n8n self-refs (CORS, own webhooks) |
| `sorento.foundryx.my` / bare `fe-sorento` | 0 | — | none |

**Credential flag:** NO host string is embedded in any workflow-level credential — all hosts live in node **params** = templatable. Good.
**Out-of-band exception:** the Postgres/redis **credential objects** in the n8n cred store hold hosts directly (notably `n8n_test-db` cred `Dnnofg8Xb27VQOhI` → `72.62.195.19`). If SSOT must cover DB/redis endpoints, change those in the cred store, NOT via workflow templating.

### `fe-sorento.foundryx.my` — active workflows (retrofit priority)

| Workflow (id) | Nodes with the host | Param |
|---|---|---|
| **sorento-consume-main (9qVyfUxmRQqrpGRMDLRuz — LIVE SPINE)** | crm-n8n-auth, get-access-types, get-presigned-url | httpRequest url |
| sorento-consume-main TEST (txiPzSxy3Pclsz6v) | crm-n8n-auth ×6, get-access-types, get-presigned-url, resolve-entity-clarification, save-session-vars | httpRequest url |
| redis-consume-queue-mongo (Srs08P0Ha3Cv--YPx0-Yn) | insert-message | httpRequest url |
| respond-change-assignee-system (z2RrHQ6qO9sDbNh2nrn4n) | conversation-assignee-update, conversation-sla-event-tracking-create | httpRequest url |
| respond-close-convo (-WkzJMQZHmsFQm6A2abLJ) | conversation-sla-event-tracking-create, conversation-sla-tracking-update | httpRequest url |
| respond-create-update-contact-system (gVbpRvD19qrafdqMpORkE) | contact-create-update; Call 'sorento-sub-respond-findcontact-respond' (**backend_id = user-facing FE link**) | httpRequest url / executeWorkflow field |
| respond-send-user (eG3AA-TWo17-E1-DlHLnH) | save-session-vars, conversation-sla-event-tracking-create, conversation-sla-tracking-update | httpRequest url |
| schedule-sla-policy-checker (7lFff6i_udSxyUbCMdTuD) | get-due-escalations, conversation-sla-tracking-escalate1 | httpRequest url |
| schedule-working-day-detection (ss9S83XF7ZtmnaUyFtYZc) | get-is-working-holiday, conversation-sla-tracking-create | httpRequest url |
| sub-human-intervention (rrYXzE61gCNUck_zmXe-G) | get-working-days, get-round-robin-assignee, conversation-sla-tracking-create | httpRequest url |
| sub-human-intervention TEST (delta3) (vUfFUDjLAuMaeQE6) | same 3 | httpRequest url |
| system-healthcheck-ping (FfmDkEWdt3Bian82) | crm-n8n-auth + q-rows | httpRequest / webhook |
| system-upload-attachments (_NbFU3cCoEQwPSbvn14vV) | integration-log-update11 | httpRequest url |

### `fe-sorento.foundryx.my` — archived (retrofit only if revived)
- sorento-consume-main copy (oo7LnsedPyKB9bWM) — 10 urls incl. `memory/frames/*`, chat-history, resolve, presigned-url, contact-access-types
- sub-complaint-agent (NjhFJKSTRomIWwnbP-FMF); sub-project-lead-time-enquiries (A-rJR5oGPwl6Qi45nK147) + copy (tyt1SkQB6H1IUjik); sub-project-purchase-request (ft-5GAv1JzadXWT4h2kkd); sub-upload-attachment-entities (XXZ8Qw8es2Flkasy); main (Gztb99ogwpSHUf63TneIn)
- These carry both API urls AND user-facing FE deep-links in `.comment` fields.

### How the domain is used (drives retrofit)
1. **`httpRequest` node `url` param** — dominant (~60 fe-sorento + 11 IP + 2 automate). Clean SSOT swap.
2. **`chatTrigger` `allowedOrigins`** (zz-chat) — CORS, retrofit separately.
3. **Node string/HTML literals** — respondToWebhook HTML (zz-voice), redis messageData deep-link (archived copy). Per-node edit.
4. **User-facing deep-links** in `.comment` / executeWorkflow `backend_id` — the **CRM FRONT-END** host (`/user-management/…`, `/complaint-management/…`, `/procurement-management/…`). May differ from API host under a proper split — **bucket separately** (see Two-role split).
5. **Raw-IP self-refs (`72.62.195.19`)** — failover stack. Normalize to a self-host value; the raw IP is what made failover fragile.

## Mechanism decision

**Why DNS/proxy failover was RULED OUT:** the failure mode is *domain registration lapse*. Any CNAME/alias inside the same DNS zone dies with the zone — can't alias out of an expired domain. DNS failover would only work if the alias lived on a **separate, always-paid zone**, which isn't guaranteed here.

**CHOSEN: Redis-key SSOT.**
- Redis lives at raw IP `72.62.195.19` → **stayed up during the domain outage** (no domain dependency).
- Flip via one CLI command, faster than republishing a workflow.
- Free, no license, reaches sub-workflows (global store).
- Pre-seed both keys: `config:crm_base` (primary) + `config:crm_base_backup`. Outage → copy backup into primary.

Alternative if redis-per-workflow wiring is unwanted: **config sub-workflow** (`zz-config` = one Set node returning `{crm_base: "..."}`, called via Execute Workflow at top of each workflow; flip = edit Set node + republish). Same SSOT property, slightly heavier to flip.

### Two-role split (do this now to avoid a future re-hunt)
Keep **two** keys even though both are the same domain today:
- `config:crm_api_base` — the `/api/v1/...` calls
- `config:crm_fe_base` — user-facing deep-links (`.comment`, `backend_id`)

If API host and FE host ever diverge, it's a key swap, not another 67-node hunt.

## Retrofit approach

1. Read the two config values **once at the top of each workflow** (Redis node → Set/Code), then reference downstream: `={{ $('cfg').item.json.crm_api_base }}/api/v1/...`.
   - For sub-workflows: either each sub reads redis at its own top, OR the caller passes the base in via the executeWorkflow input. Prefer sub reads redis itself (fewer caller changes, subs already redis-heavy).
2. Replace `https://fe-sorento.foundryx.my` in every node url with the expression.
3. Normalize the 11 raw-IP `72.62.195.19` webhook refs → a `config:n8n_base` key (kill the fragile IP).
4. DB/redis creds holding the IP → fix in cred store separately (out of band).

### Ordering
- **Active-first**, spine last. Build + validate every change on the **TEST clone `txiPzSxy3Pclsz6v`** first.
- Promote reviewed diffs to live per CLAUDE.md (guards stripped, backup-first, user-gated). Never edit live spine `9qVyfUxmRQqrpGRMDLRuz` directly.
- Archived workflows: skip unless revived.

## Upstream fix (root cause — NOT optional)

SSOT is damage control; it does not stop the outage. The outage was a **billing/renewal miss**:
1. **Auto-renew + multi-year registration** on the CRM domain (and audit ALL foundryx.my-adjacent domains for expiry dates).
2. **Domain-expiry + reachability monitor** — extend existing `system-healthcheck-ping` (FfmDkEWdt3Bian82) to WHOIS/expiry-check + alert weeks before lapse. Cheapest real prevention.

## Next steps (for the tmux session)

1. Decide: redis-key (recommended) vs config sub-workflow.
2. Confirm the backup domain value to pre-seed into `config:crm_*_base_backup`.
3. Write per-node edit list from the audit (files in scratchpad below), active-first.
4. Build on TEST clone → tester (zero-egress gate) → reviewer → user-gated promote.
5. Separately: set domain auto-renew + build expiry monitor.

## Artifacts

Audit working files (may be cleared — re-run audit if gone):
`/private/tmp/claude-501/-Users-tehjayson-Documents-foundryx-sorento-crm-n8n/440cfa61-b87f-465d-aa5c-9ba6fa613d4e/scratchpad/` → `host_hits.json`, `config_only.json`, `final_rows.json`, `wf_index.txt`

Reference: `CLAUDE.md`, `docs/LESSONS.md`, `n8n-workflows-init/plans/failover-poller-plan.md` (existing failover work).
