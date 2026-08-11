# MANUAL EYEBALL SCRIPT — dym probe-before-offer + B1 + B2′

Run in the **chat console** (drives clone `2d1627c8` + parser fork `95193323`).
Zero customer egress: replies route to redis `chat:reply`, never WhatsApp.

**Codes below are real, verified from live/clone execution data 2026-08-07.** If a code stops
resolving the catalogue changed — that's data drift, not a bug in these changes.

**Legend** — ✅ expected · ⚠️ known-accepted · 🔴 would be a real bug

⚠️ **Type `hi` between sections** to clear carried state, EXCEPT in §F where carry is the point.

---

## §A — Core dym annotation, attachment domain

The change: did-you-mean candidates are probed against the real attachment data and labelled.

| # | type this | ✅ expect | 🔴 bug if |
|---|---|---|---|
| A1 | `srtwc8317-rl1 cert` | did-you-mean, 3 candidates, `SRTWC8317-RL - has certificate`, other two `- no certificate` | any candidate unlabelled; 26 certificates; a PDF attached |
| A2 | `srtwt22151 cert` | `SRTWT2214 - has certificate`, `SRTWT2216 - has certificate`, `SRTWT2215 - no certificate`. **Two carriers sorted ABOVE the closer name match** | resolver order preserved instead of has-first |
| A3 | `SRTWC1930 certificate` | 3 candidates, **all** `- no certificate`, `SRTWC193` **first** (nobody has it → resolver similarity order preserved) | alphabetical order (that was the F-RANK bug) |
| A4 | `ibwc76011 cert` | `IBWC7601` family, at least one `- has certificate` | all bare |

**Eyeball hardest here:** are the has/no labels *factually right*? Only you can check that.
A wrong `- has certificate` is worse than the bug we fixed.

---

## §B — Core dym annotation, inventory domain

| # | type this | ✅ expect | 🔴 bug if |
|---|---|---|---|
| B1 | `Have stock SRTUB2232-1600?` | `SRTBT2232-1600` / `SRTBT2231-1600`, each `- has stock details` or `- no stock details` | em-dash `—` instead of hyphen `-`; the word `stock` without `details` |
| B2 | `SRTWC19301 got stock?` | numbered list, has-first sorted | unlabelled |
| B3 | `check stock SRTWC8318-RL-BL1` | ⚠️ `- no stock details` even though a warehouse row exists at **0 on hand** — predicate is `qty_gt_zero`, label is your chosen simplification | — |

**B3 is the deliberate trade-off you approved.** Look at it in context and confirm you still want it.

---

## §C — All four renderer surfaces must AGREE

Same product family, four different code paths. This is the property the whole change promises.

| # | type this | surface | ✅ expect |
|---|---|---|---|
| C1 | `cert for SRTWC19` | **require-specific picker** | `Multiple matches found — please choose:` + **8** numbered candidates, each labelled. `SRTWC193/195/191-G2/192-300` should agree with §A |
| C2 | `srtwc8317-rl1 cert` | **D1 did-you-mean** | 3 candidates labelled |
| C3 | `cert for SRTWC8317-RL and srtwc83171` | **partial-resolution** | real cert data for the resolving one **plus** a labelled candidate list for the miss |
| C4 | `incoming for SRTWC19` | **incoming picker** (pre-existing) | ⚠️ keeps its em-dash `— no incoming` — untouched by design |

🔴 **If the same code gets `- has certificate` on one surface and `- no certificate` on another, stop and tell me.** That contradiction is the defect this whole change exists to remove.

---

## §D — Cross-company (KNOWN LEAK — expect wrong behaviour)

⚠️ These will look wrong. That is the **CRM-side leak**, not these changes. Included so you can
recognise it rather than re-report it.

| # | type this | ⚠️ expect (known-bad) |
|---|---|---|
| D1 | `technical drawing for m2399-bl` | Mocha products offered to a Sorento contact. `M210-BL` renders **bare** (our multi-uuid guard firing). `M2399 - no technical drawing` is a **false** label about a product you can't see |
| D2 | `m2399` | offers `M2399-BL - no Technical Specifications` — same leak |

**What our change does here:** the bare `M210-BL` line is the guard working — we refuse to label a
code that resolves to two companies. The false `- no technical drawing` on `M2399` is the leak
leaking through. Fix is `entity_resolver.py` raw-SQL scoping, CRM repo.

---

## §E — B1: the certificate dump must not return

| # | type this | ✅ expect | 🔴 bug if |
|---|---|---|---|
| E1 | `srtwc8317-rl1 cert` | did-you-mean only | **26 products' certificates + a PDF** = B1 failed |
| E2 | `certification with number PC000078` | ✅ **still lists** the products that certificate covers, with PDF — B1 must NOT fire here | dead-ends |
| E3 | `SRTWT2214 cert` | that product's real cert — `PC 000373`, `Validity: Valid` | "No certificate for SRTWT2214" |
| E4 | `srtwc8317-rl1 and SRTWC19 cert` | ⚠️ the **picker**, not a dead-end (missed raw + second ambiguous token) — safe, pinned in §CD-9 | a dump |

E2 is the important negative — B1 must stay inert when the certificate *is* the subject.

---

## §F — B2′: carried state (DO NOT type `hi` — carry is the point)

Run each block **in order, no reset**. This is where your real sessions differ from the harness.

**F-block 1 — the original bug**
```
cert for srtwc8317-rl
srtwc8317-rl1 cert
SRTWT2214 cert
```
✅ turn 3 returns `PC 000373` Valid.
🔴 "No certificate for SRTWT2214" = B2′ failed (that was the false negative).

**F-block 2 — code pick (the path that defeated the original B2)**
```
srtwc8317-rl1 cert
SRTWC8317-RL
mwc7625 cert
```
✅ turn 2 returns SRTWC8317-RL's own certificates (`01616FC`, `BPAI/0526-2025`).
🔴 any `PC 000078` appearing = eviction bypassed.

**F-block 3 — numbered pick**
```
srtwc8317-rl1 cert
1
```
✅ same as above via the numbered path.
🔴 `PC 000078` = `dymNumberedMultiSelect` bypass.

**F-block 4 — depth (nobody has tested past 3 turns)**
```
cert for srtwc8317-rl
srtwt2214 cert
mwc7625 cert
srtwc193 cert
ibwc7601 cert
stock for SRTWC193
cert for SRTWT2216
```
The original dump appeared only after a certificate had been carried **five times**.
🔴 any turn answering about a product you didn't name.

---

## §G — REGRESSION: these must be unchanged

| # | type this | ✅ expect |
|---|---|---|
| G1 | `PS9999999 delivered?` | order-domain did-you-mean with **no** `- has`/`- no` anywhere |
| G2 | `promotion for SRTWC8317-RL` | promotion domain, unannotated |
| G3 | `list product for kitchen sink` | master_products, unannotated |
| G4 | `what is SRTWC8317-RL price` | normal answer |
| G5 | `hi` | casual reply, no lookup |
| G6 | `incoming for SRTWC8317-RL` | incoming domain, `— has/no incoming` with **em-dash** (pre-existing, deliberately untouched) |

🔴 **Any `- has X` / `- no X` suffix in G1–G5 is a bug** — only `product_attachment` and `inventory`
are enabled.

---

## §H — Edge cases nobody has driven

| # | type this | ✅ expect |
|---|---|---|
| H1 | `cert` (bare, no product) | asks which product — no dump |
| H2 | `cert for ZZZZ9999NOTREAL` | no candidates → escalate offer, no crash |
| H3 | `cert for srtwc8317-rl1 and srtwt22151 and mwc76251` | **multi-token** — each missed token gets its own labelled block |
| H4 | `SRTWC8317-RL cert` then `and MWC7601?` | bare follow-up: must NOT reuse the previous certificate |
| H5 | `no` after any offer | declines cleanly, no re-prompt |
| H6 | `yes` after any offer | escalates, offers the CS roster |
| H7 | reply `2` to a **merged** dym+roster message | ⚠️ known: digit is claimed by the roster → silent escalation. Pre-existing, filed, not from these changes |
| H8 | voice note asking for a certificate | transcript → same parser path |
| H9 | quote-reply an old message, then ask for a cert | quoted-turn state is a separate continuity path, untested |

---

## What to send me if something looks wrong

1. The **exact text** you typed
2. The **exact reply**
3. Roughly when (for the execution id)

Both real bugs this cycle came from exactly that.

## Known-accepted, don't re-report

- em-dash on `— has/no incoming` (pre-existing surface, untouched)
- `- no stock details` at 0-on-hand (your call, §B3)
- bare line on cross-company codes (guard working, §D)
- Mocha products offered to Sorento (CRM leak, §D)
- digit-on-merged-offer escalation (§H7)
- `sub-sendmsg-CHAT` is stale vs live — odd quick-reply buttons are the harness, not these changes
