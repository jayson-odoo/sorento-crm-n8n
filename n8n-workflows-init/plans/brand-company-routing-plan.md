# Plan — brand- **and company**-aware escalation routing (n8n half)

Change-id: `brand-company-routing` · Planner pass 2026-08-17 · **scope: `deterministic`** (parser fork rebase is a
build dependency, tested with ONE `parser`-tier case, see UAC §P) · Branch `fm/brand-routing-n8n`.

Authoritative design: `firstmate/data/brand-aware-escalation-routing/report.md` §5.2 (+ §2, §6) **plus three captain
additions** (below). CRM half = sorento-crm PR #197 (**merged + deployed 2026-08-17**). This plan is n8n-only.
**Nothing is promoted to live by this change** — build + verify on the clone, hand a promote checklist to the captain.

## 0. What the deployed CRM gives us (verified from PR #197 diff, 2026-08-17)

- `GET /api/v1/external/team-members` accepts `agent_code, team_code, tier, contact_id, …, company_id, brand_code`.
  `brand_code` narrows to members tagged with that brand **+ untagged** (same pool as `next-assignee`); `company_id`
  pins the routing company (one company per call — two companies ⇒ **two calls**). Response rows carry NO company/brand:
  `[{user_id,name,respond_user_id,email,sort_order}]` — we label them ourselves.
- `POST /api/v1/external/next-assignee` body accepts `brand_code`, `company_id` (+ legacy suffixed `team_code`, split by
  `split_legacy_team_set_code`); response echoes `team_set_code`, `brand_code`, `brand_matched`, `company_id`.
- `POST /sla-management/conversation-sla-tracking[/integration]` accepts optional `brand_code`, `company_id`.
- Migration 371 collapsed the legacy `marketing_promotion_<brand>` T1 rows into base `marketing_promotion` +
  `brand_code` (the `_sorento` row → `brand_code NULL` = all-brands). So the base key EXISTS and the legacy suffixed keys
  still resolve. The parser flip (§3.5) is therefore safe either way; it is the clean form, not a prerequisite.

## 1. Drift re-verified 2026-08-17 (report §2.5 + new)

| item | state today | consequence |
|---|---|---|
| live spine `9qVyfUxmRQqrpGRMDLRuz` | 125 nodes, updated **2026-08-17T11:35Z**, versionId==active `d6f6b90c…`. Has promo-picker/tier-probe nodes the clone lacks; **`disallowed-entity-gate` carries a `#9/#16` block** (`resolved_company`, `resolved_companies`, `company_team` for promotion) that the clone lacks; `escalate-catalog` reads `company_team` for the offer text | build our routing axes **inside that #9 block** (rebase clone deg → live deg first; clone deg is a strict ancestor: only 4 em-dash wording lines differ) |
| clone `txiPzSxy3Pclsz6v` | 148 nodes, updated 2026-08-17T06:37Z. `compile-current-state` carries PR #20 (spec N-1a…, unpromoted); live ccs carries promo-picker S4 + `query_brands` persist. Neither is an ancestor of the other | our ccs edit is ONE additive hunk anchored on the shared tail `if (_dymLastResultSet) …\nreturn output;` — same hunk applies to live at promote |
| clone sub wiring | parser fork **`wI5RkNGW3EOJfBdo`** (not CLAUDE.md's `CpxE8…`), HI fork `vUfFUDjLAuMaeQE6`, get-results `t4QvrtrPnTwRU6br`, sendmsg `aQUmwMVplmNcyUVc`, save-msg `tWm5DYLxfypmVC1T` | edit the forks the clone calls |
| parser fork `output_exchange` | 70,842 chars (2026-08-09) vs live 90,812 (2026-08-11); fork is a strict ancestor except 5 lines live rewrote (S3 access carry etc.) | rebase fork `output_exchange` + `AI Agent.systemMessage` to live bodies BEFORE the §3.5 edit (Lesson 25 byte-exact) |
| HI fork `vUfFUDjLAuMaeQE6` | 16 nodes; `chat?` branch → `chat-escalation-push`; `test-guard` → `test-guard-record`; tracking URL `…/integration` | edit fork; live `rrYXzE61…` differs only by chat?/guard + tracking URL |
| `get-cs-members` (spine, id `get-cs-members-node` on clone / `ff5f651e…` on live) | URL = `team-members?agent_code&team_code&tier=1&contact_id` — **no brand, no company**; identical clone↔live | captain addition (1) |
| PR #21 (mc-label) | promoted to live today (spine 11:35Z); clone has it too | no action |

## 2. Journey (captain's framing)

Order enquiry → CS. Turn 1: `resolve-entity` returns one product row per company that carries the code (Sorento copy
brand MOCHA / Mocha copy brand null). Not found → `escalate-catalog` → `cs-offer-gate` (CS/order_enquiries) →
`get-cs-members` → `build-cs-member-offer` numbered list → `compile-current-state` persists `last_result_set` +
`selection_context='member_offer'`. Turn 2: number/name/'yes' → parser `escalation.{is_escalation_confirmation,
preferred_assignee_id}` → `If2` → `divert-suggest-yes[1]` → `Call 'sub-human-intervention'` → `next-assignee`.

Requirements: (R1) roster call carries `brand_code`+`company_id` from the same computed state the assignment uses;
(R2) COMPANY is primary — the enquired product's company reaches every roster + assignment call; (R3) product in >1
company ⇒ roster **per company**, union offered, every member labelled with its company, reply **explains why**;
single-company path byte-identical in shape.

## 3. Change set (clone + forks; every node named)

### 3.1 `disallowed-entity-gate` (spine Code) — routing axes computed once, after resolve
1. Rebase: `setNodeParameter jsCode` = **live** body (sha the live body first; record in diff doc).
2. Append inside the `#9` block (after `out.resolved_companies = _brands;`):
   ```
   // ── brand-company-routing: routing axes for roster + assignment ──
   // company = the enquired ITEM's company (primary axis); brand = its brand row (secondary, narrows the pool)
   const _compat = new Set(compatible_entities.map(e => e.uuid));
   let _rows = flat.filter(m => m && m.uuid && _compat.has(m.uuid) && m.entity_type === 'product');
   if (!_rows.length) _rows = flat.filter(m => m && m.uuid && _compat.has(m.uuid) && m.company_id);
   const _bc = m => { const b = m && m.display && m.display.brand; const c = b && (typeof b === 'object' ? b.brand_code : b); return c ? String(c).trim().toLowerCase() : null; };
   const _byCo = new Map();
   for (const m of _rows) { if (!m.company_id) continue; const g = _byCo.get(m.company_id) || { company_id: m.company_id, company_name: m.company_name || null, brands: new Set(), codes: new Set() }; const b = _bc(m); if (b) g.brands.add(b); if (m.canonical_code) g.codes.add(m.canonical_code); _byCo.set(m.company_id, g); }
   const _allBrands = [...new Set(_rows.map(_bc).filter(Boolean))];
   const _qb = (Array.isArray(parser.query_brands) && parser.query_brands.length) ? String(parser.query_brands[0]).toLowerCase() : null;
   const _acc = (parser.access_levels || []).map(a => String(a).toLowerCase());
   const _accBrand = _acc.some(a => a.includes('mocha')) ? 'mocha' : _acc.some(a => a.includes('cabana')) ? 'cabana' : _acc.some(a => a.includes('sorento')) ? 'sorento' : null;
   out.routing_brand = _allBrands.length === 1 ? _allBrands[0] : (_qb || _accBrand || null);
   out.routing_brand_source = _allBrands.length === 1 ? 'resolved' : (_qb ? 'stated' : (_accBrand ? 'access_level' : null));
   out.routing_companies = [..._byCo.values()].map(g => ({ company_id: g.company_id, company_name: g.company_name, brand_code: g.brands.size === 1 ? [...g.brands][0] : (out.routing_brand || null), codes: [...g.codes] })).sort((a, b) => String(a.company_name).localeCompare(String(b.company_name)));
   out.routing_company = out.routing_companies.length === 1 ? out.routing_companies[0].company_id : null;
   ```
   Precedence per report §7 assumptions: resolved brand > stated brand > access-level brand > null; multi-brand ⇒ not
   first-wins (D3). Company: exactly one ⇒ it, else null (`routing_companies` keeps them all — R3).

### 3.2 NEW Code node `cs-roster-plan` (spine) — one item per company to query
Insert on edge `cs-offer-gate[0] → get-cs-members`: `cs-offer-gate[0] → cs-roster-plan → get-cs-members`.
```
const g = (() => { try { const n = $('disallowed-entity-gate'); return n.isExecuted ? n.first().json : {}; } catch (e) { return {}; } })();
const cos = Array.isArray(g.routing_companies) && g.routing_companies.length ? g.routing_companies : [{ company_id: null, company_name: null, brand_code: g.routing_brand || null, codes: [] }];
return cos.map((c, i) => ({ json: { plan_idx: i, company_id: c.company_id || null, company_name: c.company_name || null, brand_code: c.brand_code || null, codes: c.codes || [], multi_company: cos.length > 1, companies: cos.map(x => x.company_name).filter(Boolean) } }));
```
Fallback item (no resolve this turn) keeps today's single call, unchanged params except a null-guarded brand.

### 3.3 `get-cs-members` (spine httpRequest) — carry the axes, one call per plan item
- URL: append `{{ $json.brand_code ? '&brand_code=' + encodeURIComponent($json.brand_code) : '' }}{{ $json.company_id ? '&company_id=' + encodeURIComponent($json.company_id) : '' }}` to the existing URL expression (agent/team/tier/contact_id unchanged).
- `options.response.response.fullResponse = true` → exactly ONE output item per input item (`{body,headers,statusCode}`), so company i ↔ roster i by index (no reliance on pairedItem).
- node settings `onError: continueRegularOutput` → a 404 ("no team in company X") on one company yields an error item, not a dead turn; bcmo treats it as an empty roster for that company. (Reviewer: this also turns today's single-company hard-error into a graceful plain offer — intended.)
- Do NOT touch credentials (`httpHeaderAuth`, unchanged).

### 3.4 `build-cs-member-offer` (spine Code) — merge, label, explain
- Inputs: `plan = $('cs-roster-plan').all().map(i=>i.json)`; `resp = $('get-cs-members').all().map(i=>i.json)`; roster_i = `Array.isArray(resp[i]?.body) ? resp[i].body : (Array.isArray(resp[i]) ? resp[i] : [])` (tolerate old shapes; an `error` item ⇒ []).
- Members: filter `user_id && respond_user_id`; stamp `company_id, company_name, brand_code` from plan[i]; **dedupe by `user_id`** across companies (keep first, `companies:[…]` label lists all).
- `members.length === 0` ⇒ existing fallback (unchanged: `member_offer=false`, `cs_last_result_set=[]`).
- **Single company (plan.length===1)** ⇒ text **byte-identical to today** (`${cat.response}\n\nPlease choose who to route to (reply with the number):\n1. Name…\n\nIf you have no preference…`).
- **Multi company (plan.length>1)** ⇒
  ```
  ${cat.response}

  Note: ${codes.join(', ')} is carried by more than one company (${A} and ${B}), so I am listing the customer-service team members from both — that is why there are more names than usual. Please choose who to route to (reply with the number):
  ${A}:
  1. Name (A)
  2. Name (A)
  ${B}:
  3. Name (B)
  [ ${C}: no customer-service members are configured — omitted. ]   ← only when a company returned nothing
  If you have no preference, just reply 'yes' and we'll assign automatically.
  ```
  Continuous numbering across groups; each line ends with ` (${company_name})`. `codes` = union of plan `codes` (fallback: `cat`'s subject if empty).
- `cs_last_result_set` rows: `{idx,label,uuid,respond_user_id, company_id, company_name, brand_code}` (new keys **null on the single-company fallback item** so replay norm treats them inert). `out.routing_companies = plan` (debug/evidence).

### 3.5 `compile-current-state` (spine Code) — persist the axes (Lesson 40)
Insert immediately BEFORE the final `return output;` (after the `dym_last_result_set` line — anchor identical on clone + live):
```
// brand-company-routing: routing axes for the escalation turn (report §5.2; null-inert for replay norm)
{
  const _g = (() => { try { const n = $('disallowed-entity-gate'); return n.isExecuted ? n.first().json : null; } catch (e) { return null; } })();
  const _prev = (() => { try { const s = $('get-session-vars').first().json; return (s && s.session_vars && s.session_vars.variables) || (s && s.variables) || {}; } catch (e) { return {}; } })();
  const _sameTeam = _prev && _prev.routing && qf.routing && _prev.routing.suggested_team === qf.routing.suggested_team;
  const _fresh = _g && Array.isArray(_g.routing_companies) && _g.routing_companies.length > 0;
  output.variables.routing_brand        = _fresh ? (_g.routing_brand ?? null)        : (_sameTeam ? (_prev.routing_brand ?? null) : null);
  output.variables.routing_brand_source = _fresh ? (_g.routing_brand_source ?? null) : (_sameTeam ? (_prev.routing_brand_source ?? null) : null);
  output.variables.routing_company      = _fresh ? (_g.routing_company ?? null)      : (_sameTeam ? (_prev.routing_company ?? null) : null);
  output.variables.routing_companies    = _fresh ? _g.routing_companies              : (_sameTeam && Array.isArray(_prev.routing_companies) ? _prev.routing_companies : null);
}
```
Carry-forward only under the same-team guard (clarify → offer → yes chains keep the axes; a domain switch drops them).

### 3.6 NEW Code node `escalation-context` (spine) — what the escalation turn sends
Insert on edge `divert-suggest-yes[1] → Call 'sub-human-intervention'` (keep `divert-suggest-yes[1] → tag-out-of-scope`).
```
const o = $('Call \'sub-query-reformulator\'').first().json.output || {};
const prev = (() => { try { const s = $('get-session-vars').first().json; return (s && s.session_vars && s.session_vars.variables) || (s && s.variables) || {}; } catch (e) { return {}; } })();
const team = (o.routing || {}).suggested_team || null;
const sameTeam = !!(prev.routing && team && prev.routing.suggested_team === team);
const picked = (o.escalation || {}).preferred_assignee_id || null;
const row = picked ? (Array.isArray(prev.last_result_set) ? prev.last_result_set : []).find(r => r && r.uuid === picked) : null;
const qb = (Array.isArray(o.query_brands) && o.query_brands.length) ? String(o.query_brands[0]).toLowerCase() : null;
let brand_code = null, company_id = null, company_name = null, source = 'none';
if (row && row.company_id) { company_id = row.company_id; company_name = row.company_name || null; brand_code = ('brand_code' in row) ? (row.brand_code || null) : ((sameTeam ? prev.routing_brand : null) || null); source = 'picked_member'; }
else if (sameTeam) { const cos = Array.isArray(prev.routing_companies) ? prev.routing_companies : []; company_id = prev.routing_company || null; brand_code = qb || prev.routing_brand || null; const c = cos.find(x => x && x.company_id === company_id); company_name = c ? (c.company_name || null) : null; source = company_id ? 'prior_state' : (cos.length > 1 ? 'multi_company_unpicked' : 'prior_state_no_company'); }
else if (qb) { brand_code = qb; source = 'stated_brand'; }
return [{ json: { ...$input.first().json, brand_code, company_id, company_name, routing_source: source, team } }];
```
Bare "yes" on a multi-company offer ⇒ `company_id=null` (CRM resolves via contact/default — assumption A2 below).
**Pool identity rule (rev-2, from UAC B3):** for a picked member the brand sent MUST be exactly the `brand_code` the roster row was fetched with (null stays null) — never a fallback to `routing_brand`, else the pick can land outside the pool `next-assignee` narrows to. Fallback only when the row predates this change (no `brand_code` key).

### 3.7 `Call 'sub-human-intervention'` (spine executeWorkflow) — two new inputs
`workflowInputs.value.brand_code = {{ $('escalation-context').first().json.brand_code || '' }}`,
`company_id = {{ $('escalation-context').first().json.company_id || '' }}`; add both to `schema` (type string, removed:false).

### 3.8 HI fork `vUfFUDjLAuMaeQE6` (publish after edit — Lesson 37)
- Trigger `workflowInputs.values` += `{name:'brand_code'}, {name:'company_id'}`.
- `get-round-robin-assignee` jsonBody += `"brand_code": {{ JSON.stringify($('When Executed by Another Workflow').first().json.brand_code || null) }}, "company_id": {{ JSON.stringify(...company_id || null) }}`.
- `conversation-sla-tracking-create` jsonBody: `"team_set_code": {{ JSON.stringify($('get-round-robin-assignee').item.json.team_set_code ?? ($('When Executed by Another Workflow').first().json.team ?? '')) }}`, += `"brand_code": {{ JSON.stringify($('get-round-robin-assignee').item.json.brand_code ?? (…json.brand_code || null)) }}`, `"company_id": {{ JSON.stringify($('get-round-robin-assignee').item.json.company_id ?? (…json.company_id || null)) }}`.
- `test-guard-record` payload += `"brand_code": …, "company_id": …` (egress log proves the inputs).
- `chat-escalation-push` messageData += `brand_code, company_id` (chat console evidence).

### 3.9 Parser fork `wI5RkNGW3EOJfBdo` (report §5.2.1; publish after edit)
1. Rebase `output_exchange.jsCode` and `AI Agent` systemMessage to the **live** `XTODTw` bodies (sha both; the fork's own diffs are already in live).
2. `deriveRouting` promotion case → `suggested_team: 'marketing_promotion'`; after `output.output.routing = {…}` normalise `/^marketing_promotion_(sorento|cabana|mocha)$/ → 'marketing_promotion'` (LLM legacy memory); systemMessage lines 364–365 + enum 478 → `marketing_promotion` (keep the brand hint sentence pointing at `query_brands`).
3. Leave the fork's `test-reformulator-bypass` guard intact.
> Live `disallowed-entity-gate` #9 still builds `company_team = marketing_promotion_<brand>` for the OFFER TEXT only — cosmetic, untouched (out of scope; note in diff doc).

### 3.10 Replay `norm()` (`aROEBlQyyoQaB7a1` › `Diff`) — Lesson 40
Register `routing_brand, routing_brand_source, routing_company, routing_companies` (and `cs_last_result_set[].company_id/company_name/brand_code`) as **ignore-when-null-both-sides / retain-when-non-null**. Coder edits the orchestrator Code node; document the exact rule line in the diff doc.

## 4. Assumptions (no captain decision needed; flag in report)
- A1 precedence resolved-brand > stated > access-level > null; multi-brand ⇒ null brand (D3), companies kept.
- A2 bare "yes" after a multi-company offer ⇒ `company_id=null` → CRM `resolve_routing_company` (contact's company / default). Not silently picking a company.
- A3 a member present in both companies' rosters is listed once, labelled with both companies, and assigned in the first-listed company.
- A4 the parser flip (§3.9) is built as specified; it is safe because migration 371 created the base `marketing_promotion` rows. If the tester's roster probe shows base `marketing_promotion` missing for `general_enquiries` in Sorento, STOP the parser flip and report.

## 5. Acceptance criteria (clone; see `tests/brand-company-routing-UAC.md`)
AC1 single-company product (order enquiry, not found) ⇒ `get-cs-members` called ONCE with `company_id=<that company>` (+`brand_code` when the row has one); reply text byte-identical shape to today; `cs_last_result_set[].company_id` = that company.
AC2 two-company product (MWC-SC08B) ⇒ `cs-roster-plan` emits 2 items (Mocha, Sorento), `get-cs-members` runs 2× (one per company, Sorento call carries `brand_code=mocha`), reply lists both groups labelled `(Mocha)`/`(Sorento)` and contains the explanation sentence naming both companies.
AC3 turn-2 pick of a labelled member ⇒ `escalation-context.company_id` = that member's company, `brand_code` per row; HI fork `test-guard-record` payload shows the same `brand_code`/`company_id`; **no** real next-assignee call (guard) — zero egress.
AC4 turn-2 bare "yes" single-company ⇒ `company_id` = the company from prior state; multi-company ⇒ null + `routing_source='multi_company_unpicked'`.
AC5 domain switch guard: offer on CS team, then a stock question (routing warehouse), then "yes" ⇒ escalation-context brand/company null.
AC6 same-pool proof: read-only `team-members?agent_code=order_enquiries&team_code=customer_service&tier=1&contact_id=437264483&company_id=<X>[&brand_code=…]` returns exactly the ids offered for company X (probe via an n8n helper using the header cred; **never call next-assignee**).
AC7 §0 S1–S6 zero-egress on every run. AC8 replay `norm()` rule present; a sample replay of ≥3 non-CS golden turns shows no new diffs.
AC9 (parser tier, one real run) promotion enquiry ⇒ `routing.suggested_team === 'marketing_promotion'`; live parser untouched.

## 6. Promote mapping (captain-gated; NOT executed here)
Order: parser fork → live `XTODTw` (`output_exchange`, systemMessage; sha-gated) → HI fork → live `rrYXzE61…` (5 params; keep live's tracking URL) → spine `9qVyfUxmRQqrpGRMDLRuz`: deg block (append to live #9), `cs-roster-plan` + `escalation-context` (net-new nodes + 2 rewires), `get-cs-members` (URL, fullResponse, onError), `build-cs-member-offer` (whole body, byte-exact), `compile-current-state` hunk (before `return output;`), `Call 'sub-human-intervention'` (+2 inputs), replay norm. Backup-first, sha-verify draft before publish + active after, auto-revert (Lessons 24/25).
