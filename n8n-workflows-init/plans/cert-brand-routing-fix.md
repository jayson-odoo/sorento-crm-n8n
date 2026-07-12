# Change Plan — cert-brand routing fix (`deriveRouting` isCert widened)

Change-id: `cert-brand-routing-fix`
Status: PLAN (planner deliverable). No workflow edited; no execution run.
Promotion target: LIVE reformulator `XTODTw-dJcV0uRdC056hG` (`sub-semantic-parser`), node `output_exchange`,
function `deriveRouting`.
Build/test target: a **fresh reformulator copy rebased on the CURRENT live `XTODTw`** + this one-spot fix,
re-pointed from the TEST clone `txiPzSxy3Pclsz6v`. NEVER edit live `XTODTw`; NEVER edit the live spine
`9qVyfUxmRQqrpGRMDLRuz`; NEVER use a stale reformulator copy.
Scope tag: **`scope: parser`** — the fix lives inside the reformulator's `output_exchange`; the load-bearing
inputs (`attachment_type` raw, `intent_hint`, `user_goal`) are produced by the reformulator LLM. The
assertion target (`output.output.routing.suggested_team`) is the reformulator's own output. A
`deterministic` `mock_parser_output` injection at the clone's `parser-bypass-gate` **bypasses the
reformulator entirely**, so it CANNOT exercise `deriveRouting` — see §6. Every UAC case is bound by **§0**.

Source of truth: live n8n via `get_workflow_details XTODTw-dJcV0uRdC056hG` + `get_execution 7019613`
(both read read-only for this plan). Snippets below quoted verbatim from that pull.

---

## 0. Symptom (reproduced live, exec `7019613`)

User message: `"may i have SPAN cert for urinal flush valve srtwt03C or SRTUFV101"`.
Reformulator `output_exchange` output (verbatim, abridged):

```json
{ "intent_hint":"check_product_attachment", "domain_hint":"product_attachment",
  "user_goal":"trying to get the SPAN certificate for the urinal flush valve products",
  "entities":[ {"raw":"urinal flush valve","hint":"category"},
               {"raw":"srtwt03C","hint":"product"},
               {"raw":"SRTUFV101","hint":"product"},
               {"raw":"SPAN","hint":"attachment_type","current_message":true,"confident":true} ],
  "routing":{ "suggested_team":"marketing_product", "suggested_agent":"general_enquiries" } }
```

The user wants a **certificate** (SPAN is a Malaysian certification body). The correct team is
`purchasing_certification`. The reformulator emitted `routing.suggested_team = "marketing_product"` — WRONG.

### Root cause (confirmed, not theory)
`deriveRouting` **ignores the LLM's emitted `routing` and re-derives it mechanically** — `output_exchange`
lines 386–393 (verbatim):

```js
const derived = output.output.domain_hint ? deriveRouting(output.output) : { suggested_team:null, suggested_agent:null };
const suggested_team  = norm(derived.suggested_team)  ?? norm(priorRouting.suggested_team)  ?? 'customer_service';
const suggested_agent = norm(derived.suggested_agent) ?? norm(priorRouting.suggested_agent) ?? 'general_enquiries';
output.output.routing = { suggested_team, suggested_agent };
```

So whatever the LLM put in `routing` is discarded; `deriveRouting`'s mechanical map is final. Inside it, the
cert-vs-photo split for `domain_hint='product_attachment'` keys off `isCert` — `output_exchange` line 10
(verbatim):

```js
const isCert = attachTypes.some(t => /cert|ikram/.test(t));
```

where `attachTypes` = the lowercased `canonical_code || raw` of every `attachment_type` entity (lines 7–9).
For this turn `attachTypes = ["span"]`. `/cert|ikram/` does NOT match `"span"` → `isCert = false` →
the `product_attachment` branch (lines 27–29) returns `marketing_product`. Any certificate named by its
**issuing body / brand** — SPAN, SIRIM, BOMBA, MS####, Halal — slips the discriminator the same way.

---

## 1. Confirmed wiring (live, read-only — do NOT re-investigate)

Reformulator `XTODTw-dJcV0uRdC056hG`, name `sub-semantic-parser`, `active=true`. **7 nodes:**
`When Executed by Another Workflow` → `AI Agent` (LLM `OpenAI Chat Model`, the semantic parser) →
`output_exchange` (Code post-processor) is the spine; `test-reformulator-bypass` / `mock-reformulator-output`
is the test bypass; `Postgres Chat Memory` is orphaned scaffolding.

> **FLAG (must reconcile before promotion):** `versionId = 3896c4dd-9774-4e86-92da-788818aaf350` ≠
> `activeVersionId = eb01c67a-bfba-43f6-9bfb-87a5094e17d6`. An **unpublished draft already exists on live
> `XTODTw`.** `get_workflow_details` returns that DRAFT — the `deriveRouting` snippet above is from the
> draft. Exec `7019613` ran the *active* version and showed the same `/cert|ikram/` behaviour, so the bug
> is present in active too, but the draft may carry an unrelated pending delta. **Before promoting this
> fix:** (a) diff draft vs active `output_exchange` so you know exactly what `publish_workflow` would
> ship; (b) decide whether the pending draft delta is intended; (c) rebase the build copy on the version
> that will actually become live. Do NOT blindly publish — publishing ships the whole draft, not just this
> hunk. See [[publish-after-update-workflow]].

The contract that guarantees the fix's inputs exist (`AI Agent.systemMessage`, verbatim refs):
- entity schema (line 211): `{ "raw","hint": …|attachment_type|…, "current_message", "confident" }`.
- `intent_hint` for attachments = `check_product_attachment` (lines 39/46/75–77).
- `user_goal` (lines 146/335): *"Always populate it… start with 'trying to'…"* — reliably present.
- attachment-type extraction (lines 148–156): cert/Ikram → attachment_type `"certificate"`; but a
  **brand-named** cert ("SPAN") is emitted with `raw:"SPAN"` (confirmed by exec 7019613), NOT normalized
  to `"certificate"`. This is why the mechanical discriminator must widen, not the prompt.

Both fix triggers fire on the exec-7019613 payload: (1) `attachTypes=["span"]` matches the widened brand
regex; (2) `intent_hint==='check_product_attachment'` AND `user_goal` contains `"certificate"`.

---

## 2. The fix (single spot inside `deriveRouting`)

**Before** — `output_exchange` line 10:
```js
  const isCert = attachTypes.some(t => /cert|ikram/.test(t));
```

**After** — replace that single line with:
```js
  // cert-vs-photo discriminator. Fire when EITHER an attachment_type raw names a cert body/word,
  // OR the semantic signal (attachment intent + a cert word in user_goal) says certificate.
  // Brand-named certs (SPAN/SIRIM/BOMBA/MS####/Halal) arrive as attachment_type raw, not "certificate".
  const isCert =
    attachTypes.some(t => /cert|ikram|span|sirim|bomba|ms\s?\d|halal/i.test(t))
    || (out.intent_hint === 'check_product_attachment'
        && /cert|certificate/i.test(String(out.user_goal || '')));
```

Notes on the implementation:
- `out` is `output.output` (passed at line 387); it carries `intent_hint`, `user_goal`, `entities`. No new
  data threading needed.
- Regexes use `/i` and NO `/g` flag → `.test()` is stateless-safe inside `.some()` (same shape as the
  original).
- `attachTypes` is already filtered to `hint==='attachment_type'` only (line 8), so the widened brand regex
  can NOT match a product code, brand entity, or any non-attachment entity — it sees only the document-kind
  tokens (`photo`, `image`, `technical drawing`, `3D model`, `certificate`, or a brand name).
- The semantic fallback (`#2`) keys off `intent_hint==='check_product_attachment'` — only set inside the
  attachment path — so it cannot fire outside `product_attachment`.

**Explicitly NOT changing:** the rest of `deriveRouting` (domain switch, brand/promotion clamp), the
`derived → routing` override block (386–393), the broaden/drop logic, the member-pick Δ3 block, the
`resource_attachment → product_attachment` remap, OR the `AI Agent` system prompt. One line replaced.

---

## 3. Regression analysis (why photo/drawing stay `marketing_product`)

- **Genuine photo/drawing UNCHANGED.** `"photo for X"` → `attachTypes=["photo"]` (no brand word, not
  cert/ikram) and `user_goal` ≈ "trying to get a photo/image of X" (no `cert|certificate`) → `isCert=false`
  → `marketing_product`. Same for `"technical drawing"`, `"3D model"`, `"image"`. The fallback `#2` needs
  BOTH the attachment intent AND a literal `cert`/`certificate` in `user_goal`; a photo request has neither
  the brand token nor the cert word. No over-firing.
- **Cert path UNCHANGED for already-working forms.** `"certificate for X"` / `"Ikram cert"` already matched
  `/cert|ikram/`; the widened regex is a strict superset → still `purchasing_certification`.
- **Inert outside `product_attachment`.** `isCert` is consumed ONLY in the `case 'product_attachment'`
  branch. For `incoming`/`order`/`promotion`/`master_products`/`inventory`/`forms`, `deriveRouting` never
  reads `isCert` → those routes are byte-identical. The semantic fallback's `intent_hint` guard makes it
  doubly inert there.
- **Blast radius = the cert-vs-photo split within `product_attachment` only.** It can only flip a route
  from `marketing_product` → `purchasing_certification`, and only when a cert is genuinely indicated. It can
  never flip the other direction (photo → cert) without a cert signal present.
- **Brand-regex token safety.** `span|sirim|bomba|ms\s?\d|halal` are checked only against attachment_type
  raws. `ms\s?\d` (Malaysian Standard "MS 1234"/"MS1234") needs a digit, so it won't match `"ms"` inside a
  prose word; the standard document-kind values (`photo`/`image`/`technical drawing`/`3D model`) contain
  none of these substrings.

---

## 4. Known parser-dependency (flag, do NOT silently pass)

The **bare-brand-no-"cert"-word** form (e.g. `"SPAN for SRTUFV101"`) routes correctly via trigger `#1`
ONLY IF the reformulator LLM (a) sets `domain_hint='product_attachment'` AND (b) emits an `attachment_type`
entity `{raw:"SPAN"}`. That is parser behaviour, not `deriveRouting`'s — if the LLM instead reads
`"SPAN for SRTUFV101"` as `master_products` or leaves `domain_hint` null, `deriveRouting` never reaches the
`product_attachment` branch and the fix is inert for that phrasing. The fallback `#2` also can't help (no
`cert` word in `user_goal`). This is exactly why the case is `scope: parser` with a fallback assertion
(UAC §14c): if the parser does not produce the attachment shape, record the observed `domain_hint` +
entities, mark the case **inconclusive-by-parser**, and flag — do not pass or fail on a wrong premise. The
two forms that DO carry a cert word (§14a SPAN cert, §14b SIRIM/BOMBA cert) are the robust, parser-stable
acceptance cases.

---

## 5. Rebase + rollout

1. **Rebase build copy on CURRENT live.** Duplicate `XTODTw-dJcV0uRdC056hG` fresh (UI Duplicate — lossless;
   per LESSONS #3 the SDK has no raw-JSON import). Keep the orphaned `Postgres Chat Memory` +
   `test-reformulator-bypass`/`mock-reformulator-output` scaffolding intact. Reconcile against the draft vs
   active version flag in §1 first.
2. **Apply the one-line fix** (§2) to the copy's `output_exchange` via `update_workflow`, then
   `publish_workflow` the copy (drafts don't auto-run).
3. **Re-point the TEST clone** `txiPzSxy3Pclsz6v` at the rebased reformulator copy (the clone calls a
   reformulator copy; update that call's workflow id). Verify the clone still fails closed (§0 invariants:
   8 shared-sub calls `is_test=true`, 5 egress nodes orphaned).
4. Run UAC §14 (scope: parser) against the clone; tester asserts `output.output.routing.suggested_team` per
   case + §0 egress log.
5. **Promote (user-gated only):** apply the identical one-line diff to live `XTODTw` `output_exchange`,
   `publish_workflow XTODTw`. The reformulator is pure-parse / zero-egress, so the live edit itself triggers
   no customer action — but still publish after, and still reconcile the pre-existing draft (§1 flag) so you
   don't ship an unintended delta.

---

## 6. Verify-during-build + acceptance

The reformulator has no egress, but the clone runs the full guarded spine after it, and `suggested_team`
drives the (guarded, blocked) human-intervention assignment downstream — so §0 still binds every run.

- **V-R0 (cheapest, primary correctness gate):** offline-unit `deriveRouting` in Node (the pattern used by
  `output-exchange-axis-and-memberpick-fix.md` offline replay). Feed crafted `out` objects and assert
  `suggested_team`:
  - `out=exec-7019613 payload` → `purchasing_certification` (was `marketing_product`). **This is the bug.**
  - `{domain_hint:'product_attachment', entities:[{hint:'attachment_type',raw:'photo'}], intent_hint:'check_product_attachment', user_goal:'trying to get a photo of X'}` → `marketing_product` (UNCHANGED).
  - `{…attachment_type 'certificate'…}` → `purchasing_certification` (UNCHANGED).
  - `{domain_hint:'incoming', …}` → `purchasing` / `incoming_stock_enquiries` (UNCHANGED — isCert inert).
- **V-R1:** diff rebased-copy `output_exchange` vs live (draft AND active) → exactly the §2 hunk differs;
  document the pre-existing draft delta (§1 flag).
- **V-R2 (end-to-end, scope: parser):** UAC §14a–§14b against the clone → `routing.suggested_team ===
  'purchasing_certification'`.
- **V-R3:** UAC §14e (photo/drawing) → `routing.suggested_team === 'marketing_product'` (no over-fire).
- **V-R4:** UAC §14c — confirm the parser's actual shape for bare-brand-no-cert; record + flag per §4.
- **V-R5 (regression sweep):** sample real attachment/photo/cert traffic from `n8n_test` (or recent
  `XTODTw` executions) and re-derive routing offline with old vs new `deriveRouting`; assert the ONLY
  routing deltas are `marketing_product → purchasing_certification` on genuine cert turns — zero drift on
  photo/drawing/non-attachment turns.

**Acceptance:** V-R0 all pass + V-R2/V-R3 pass under §0 (zero egress) + V-R5 shows no unintended drift +
the §1 draft-vs-active reconciliation is documented. §14c may be `inconclusive-by-parser` (flagged) without
blocking, since §14a/§14b carry the robust acceptance.

---

## 7. §0 reminder

Zero-egress applies to all testing. No real WhatsApp/comment send; no assignment/SLA/PIC-comment write
(routing must NOT trigger a real human-intervention assignment); no CRM/contact write. CRM reads allowed.
The reformulator copy is pure-parse; the clone's guards (orphaned egress + `is_test=true` shared-sub calls)
must remain intact when re-pointed. If any guard is found leaking, halt and report — never work around it.
