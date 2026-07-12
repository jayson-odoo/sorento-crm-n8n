# Suggest-on-Miss — Gate A UAC cases (real §9 data)

Target: clone `txiPzSxy3Pclsz6v`, `mode:"uac"` (real resolver + real get-results vs prod,
egress blocked → logged to `test:egress:{test_run_id}`). Contact `437264483` (dev test).
Loop per case: `zz-canary-seed` (push item) → `zz-canary-run` → `get_execution(includeData)`
→ read `resolve-entity` / `Call 'sub-get-results'` / send node + egress key.

**Two case flavors:**
- **Render** (pin `mock_reformulator_output`) — isolates D1/D2 resolve→render→quick_reply.
- **Catch** (NO pin, real parser fork `CpxE8LroLzCkrAQN`, 2 turns) — isolates D4/D5 domain-retention.

Assertions reference fields the coder wires; adjust names after diff review.

---

## RENDER cases

### M1 — dash→exact (CRM §3a). `[37925]`
- text: `Can check stock balance srtkt71-ss` · pin: domain `inventory`, intent `check_stock`, entity `{raw:"srtkt71-ss",hint:"product"}`
- **resolve-entity (intermediate):** `srtkt71-ss` resolves EXACT (dash-insensitive) → `canonical_code` `SRTKT71SS`, `unresolved_tokens:[]`. ← proves 3a.
- **expected send:** normal stock answer (or M3-style alternatives if 0 stock) — NOT "could not find". No did-you-mean.
- egress: `would_send` only.

### M2a — fuzzy did-you-mean. `[38031]`
- text: `cwc605-rl have stock?` · pin: `inventory`, `check_stock`, entity `{raw:"cwc605-rl",hint:"product"}`
- **resolve-entity:** `cwc605-rl` in `unresolved_tokens` (or `ambiguous`), `matches[]` contains `CWCX605-RL` (match_tier `trgm`/`prefix`).
- **expected send:** "Couldn't find cwc605-rl. Did you mean **CWCX605-RL**?" + escalate option; `quick_reply` = `CWCX605-RL,...,Yes, escalate,No, it's okay`; `last_result_set` indexed w/ candidate codes; `selection_context='suggest_offer'`.

### M2b — fuzzy cert. `[38506]`
- text: `I need the certificate of WC 8609` · pin: `product_attachment`, `check_product_attachment`, entities `[{raw:"WC 8609",hint:"product"},{raw:"certificate",hint:"attachment_type"}]`
- **resolve-entity:** `WC 8609` → `matches[]` includes `MWCY8609`.
- **expected send:** did-you-mean `MWCY8609` + escalate purchasing_certification; quick_reply set.

### M3a — sibling data-miss (entity axis). `[38239]`
- text: `srtwt2206 stock available?` · pin: `inventory`, `check_stock`, entity `{raw:"srtwt2206",hint:"product"}`
- **resolve-entity:** exact (real product). **get-results:** `data:[]`, `empty:true`, `relaxed_axis:"entity"`, `alternatives:[{value:...,is_variant:...}]` (or absent if none in range).
- **expected send:** "No stock for SRTWT2206. Try {alt.value} …" + escalate warehouse; quick_reply = alt codes + Yes/No; last_result_set persisted. If `alternatives` absent → "No similar with stock. Escalate?" (no invented suggestion).

### M3b — sibling data-miss. `[38533]`
- text: `SRTJC3305 got stock?` · pin `inventory`/`check_stock`/`SRTJC3305`. Same asserts as M3a.

### M4 — date-relax (date axis). `[38521]`
- text: `Living Portal got delivery today?` · pin: `order`, `check_order`, entity `{raw:"Living Portal",hint:"customer"}`, `date_filter_start/end = 2026-07-04`
- **get-results:** `empty:true`, `relaxed_axis:"date"`, `alternatives:[{value:"YYYY-MM-DD",display:"… (DO …)",order_number:"…"}]` (subject to live data).
- **expected send:** "No delivery on 2026-07-04. Living Portal has delivery on {alt.value} (DO {order_number})" + escalate CS; quick_reply = dates + Yes/No.

### M5 — attachment sibling (entity axis). `[38183]`
- text: `Pls share SRTWT2207 image with description` · pin: `product_attachment`, `check_product_attachment`, entities `[{raw:"SRTWT2207",hint:"product"},{raw:"image",hint:"attachment_type"}]`
- **get-results:** empty → `alternatives` incl `SRTWT2207-NL` (bound variant).
- **expected send:** suggest `SRTWT2207-NL` + escalate marketing_product.

---

## REGRESSION cases (must be byte-identical — new keys absent)

### R1 — stock WITH data. `[unann]`
- text: `Want check stock for srtwb1610` · pin `inventory`/`check_stock`/`srtwb1610`
- **get-results:** rows ≥1, **NO** `alternatives`/`relaxed_axis` keys.
- **expected send:** normal stock reply. **NO** `quick_reply`, NO `selection_context`. Byte-identical to pre-change.

### R2 — master price WITH data. `[38097-adjacent working]`
- text: `Can send list price for SRTWT7301 ?` · pin `master_products`/`check_product`/`SRTWT7301`, requested_attributes `["price"]`
- normal price reply; no suggestion keys.

### R3 — casual (NO suggestion). `[unann]`
- text: `Hai` · real parser (no pin) → `casual`
- **expected:** casual/greeting reply; NO resolve-entity miss branch, NO alternatives, NO escalate injected.

### R4 — R2-exact-stays-exact (collision guard). 
- Re-assert resolve-entity for `srtwb1610`,`cwc7601-rl`,`srtmcb6083`,`cwc7606-sh` → each ONE canonical_code, `ambiguous:false`. (dash-normalize must not newly-collide a working code.)

---

## CATCH cases (real parser, 2-turn, D4/D5)

### C1 — tap/position pick keeps domain. (builds on M2a)
- Turn 1 (real parser): `cwc605-rl have stock?` → offer w/ `CWCX605-RL`, persist last_result_set + suggest_offer.
- Turn 2: `1` (or `CWCX605-RL`) → **assert** reformulator keeps domain `inventory` (bare code/position, no decisive term), resolves `CWCX605-RL`, get-results runs, stock answered. No domain flip.

### C2 — plain-yes = escalate. (builds on M3a)
- Turn 1: `srtwt2206 stock available?` → offer.
- Turn 2: `yes` → **assert** escalation path fires (human-intervention guarded, `would_write` logged, NOT a candidate pick). `No, it's okay` variant → decline, no escalate.

---

## Safety gate (every case)
- `test:egress:{test_run_id}` shows `would_send`/`would_write` only — ZERO real send/assign/CRM-write.
- CRM **reads** (resolve, get-results) real = allowed.
- Assert none of the 7 orphaned egress nodes executed.
