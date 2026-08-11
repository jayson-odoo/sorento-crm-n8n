# UAC index — read §0 + ONE file, not the 4,000-line monolith

`00-SAFETY-always-read.md` (§0) is mandatory for every case. Then open only the §-file for your change.

> 🔴 **DO NOT RE-RUN `scripts/split-uac.py`. `../UAC.md` IS STALE.**
> The script regenerates `tests/uac/*` **from** the monolith, and the monolith no longer contains
> what these files hold. Measured 2026-08-08: `§MC-` appears **0×** in `UAC.md` vs 48× here,
> `§CD-11` **0×** vs 15×, `§DP-19` **0×** vs 6×, `§CD-BLIND` **0×** vs 6×. Re-running it today would
> **destroy the entire §MC family and the B2′ / dym rev-4..6 work.**
> **The split files are now the source of truth**; the monolith is provenance for pre-split sections
> only. Add new families by writing `tests/uac/<FAMILY>.md` directly and adding a row below.
> Reconciling or retiring the monolith is filed in `plans/immortal-hint-class-plan.md` §10.

| file | sections | lines | what it covers |
|---|---|---|---|
| `00-SAFETY-always-read.md` | §0 | 160 | **mandatory safety gate, every case** |
| `1.md` | §1 ×1 | 14 | Happy path — full-access business query |
| `2.md` | §2 ×1 | 10 | No-access |
| `3.md` | §3 ×1 | 14 | Escalation / request-for-help |
| `4.md` | §4 ×1 | 9 | Not-supported-domain |
| `5.md` | §5 ×1 | 11 | Entity-not-found / clarification |
| `6.md` | §6 ×1 | 10 | Ask-for-access / partial-access |
| `7.md` | §7 ×1 | 14 | Audio / transcription path |
| `8.md` | §8 ×1 | 34 | Attachment / media-send path |
| `9.md` | §9 ×1 | 22 | Two distinct exact codes + missing attachment |
| `10.md` | §10 ×1 | 10 | Single exact + variant siblings — no false prompt |
| `11.md` | §11 ×1 | 37 | Exact-tier discriminator — ambiguity preserved vs exact passthrough |
| `12.md` | §12 ×1 | 60 | Not-found message structure — no literal leak |
| `13.md` | §13 ×1 | 140 | Vague-token clarify split |
| `14.md` | §14 ×1 | 131 | Cert-brand routing |
| `15.md` | §15 ×1 | 166 | CS member pick by name |
| `V0.md` | §V0 ×2 | 53 | Offline `build-suggest-offer` unit |
| `16.md` | §16 ×1 | 15 | E2E promotion did-you-mean — no UUID leak |
| `17.md` | §17 ×1 | 17 | Round-trip — numeric pick resolves the promotion by UUID |
| `18.md` | §18 ×1 | 9 | No-regression — product fuzzy did-you-mean unchanged |
| `19.md` | §19 ×1 | 29 | No-regression — happy promo |
| `20.md` | §20 ×1 | 91 | `output_exchange` clobber / casual-clear / team fix |
| `21.md` | §21 ×1 | 108 | Incoming axis-gate + partial not-found |
| `22.md` | §22 ×6 | 113 | S-CRED credential gate |
| `V0b.md` | §V0b ×1 | 8 | `domain_signal` LLM validation |
| `23.md` | §23 ×1 | 157 | Domain-continuity — real reformulator, multi-turn |
| `Q.md` | §Q ×1 | 116 | Query-forward sibling picker |
| `V.md` | §V ×1 | 40 | Offline units |
| `24.md` | §24 ×1 | 88 | Did-you-mean pick — real reformulator, multi-turn |
| `MT0.md` | §MT0 ×1 | 121 | Offline `build-suggest-offer` unit |
| `PS0.md` | §PS0 ×1 | 145 | Offline `compile-current-state` unit |
| `PD0.md` | §PD0 ×1 | 208 | Offline `compile-current-state` unit |
| `25.md` | §25 ×8 | 73 | S-CRED credential gate |
| `26.md` | §26 ×10 | 74 | Delete the `reply to:` concatenation — scope `parser`, **touches LIVE* |
| `DC.md` | §DC ×4 | 140 | Canaries owed by the live `tryDymPick` prior-domain deletion — scope ` |
| `27.md` | §27 ×15 | 440 | Preconditions |
| `ZS.md` | §ZS ×1 | 120 | Zero-stock completeness note |
| `ALL.md` | §ALL ×1 | 42 | Select-ALL over an active did-you-mean offer |
| `DC5.md` | §DC5 ×1 | 86 | Did-you-mean PICK stays in the offer's domain |
| `DS.md` | §DS ×1 | 142 | Domain-switch-word cases |
| `TL.md` | §TL ×16 | 296 | Structural gates |
| `XA.md` | §XA ×14 | 292 | ⚠️ SCOPE NARROWED 2026-08-04 |
| `DP.md` | §DP ×21 | 537 | dym-probe-before-offer; 4 renderers; §DP-19 rendered-text gate |
| `MC.md` | §MC ×15 | — | multi-company resolution — company grouping on 6 renderers. 🔴 Gated on CRM A-0 (resolver raw-SQL isolation leak). Plan: `plans/multi-company-resolution-plan.md` |
| `CD.md` | §CD ×12 | — | carried-certificate dump — B1 attachment-subject-gate (`deterministic`) + B2 certificate-axis-carry (`parser`). Plan: `plans/carried-certificate-dump-plan.md` |
| `PP.md` | §PP-0…9 ×43 | — | **promotion picker** — require a `promo_scope` on the bare ask, drop the access-level prompt, numbered list + file on pick. §PP-0b is the RED (stale carried access level); §PP-7c is the vacuous-fixture gate; §PP-8 guards the shared `last_result_set`. Plan: `plans/promotion-picker-plan.md` |
| `IH.md` | §IH ×16 + §IH-FP ×12 | — | **immortal-hint class** — C1 `immortal-hint-axis` (`parser`) + C2 `no-domain-name-hints` (`parser`) + C3 `multitoken-d1-annotate` (`deterministic`). Root cause is a CODE writer (`output_exchange` reference-positions `hint = domain_hint`), **not** the LLM. Plan: `plans/immortal-hint-class-plan.md` |
| `TA.md` | §TA ×15 | — | **tier-only access ask** — brand×tier split, numbered multi-select tier ask (fires only when >1 tier entitled + none stated), always-attach answers, compat mapper. §TA-7 is the non-persistence gate; §TA-11 the brand-gate fail-closed; §TA-14 the roster-collision guard. Plan: `plans/access-tier-ask-plan.md` |

---

Generated by `scripts/split-uac.py`. The monolith `../UAC.md` is kept for provenance only —
these files are the same bytes, regrouped. Re-run the script after adding sections to UAC.md.
