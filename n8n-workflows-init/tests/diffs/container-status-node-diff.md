# Container-status bundle — NODE DIFF (promote gate)

Generated 2026-08-09 from `export/` at: clone `a3269e1f`, parser FORK `3f52b411`, CS-BUILD `4070c23c`,
live spine `d7a819fc`, live parser `659b7576`, get-results `61b65e5f`, get-results TEST `da0644da`.

**Purpose (LESSONS §64 rule ii):** re-hash the SOURCE node at the start of every test pass and at
promote time. If a `source_sha` below no longer matches, the build moved under you — stop.

| target workflow | node | live sha256/16 | source sha256/16 | source bytes |
|---|---|---|---|---|
| `9qVyfUxmRQqrpGRMDLRuz  spine` | `crossdomain-render` | `f711fd2c7eb32f2a` | `af709de220e1e795` | 9536 |
| `9qVyfUxmRQqrpGRMDLRuz  spine` | `disallowed-entity-gate` | `a8938abe2e5c0189` | `7d6ad3ac60534c0a` | 15644 |
| `9qVyfUxmRQqrpGRMDLRuz  spine` | `dym-transform` | `64c3f50d381e49d1` | `789456d56dbd3d33` | 21003 |
| `9qVyfUxmRQqrpGRMDLRuz  spine` | `dym-transform-partial` | `64c3f50d381e49d1` | `789456d56dbd3d33` | 21003 |
| `9qVyfUxmRQqrpGRMDLRuz  spine` | `build-suggest-offer` | `253fe16453c8da9e` | `f57ee6d2d225e8ef` | 32173 |
| `9qVyfUxmRQqrpGRMDLRuz  spine` | `compile-current-state` | `c99251118e2d034d` | `6d2dfb74aae82f02` | 29839 |
| `XTODTw-dJcV0uRdC056hG  parser` | `AI Agent (systemMessage ONLY)` | `f5c6458aba477539` | `0555a9e8eec979af` | 35664 |
| `Fss5aAaXthJSWpZCgKiKR  get-results` | `entity-ids-transformer` | `45323f4d553d35fb` | `783443ea773c72fe` | 5215 |
| `rysSPgUssLDf6xJc  get-results TEST` | `entity-ids-transformer` | `97a030144ae73fc2` | `783443ea773c72fe` | 5215 |
| `Fss5aAaXthJSWpZCgKiKR  get-results` | `output-structurer` | `c015c6febe603907` | `68bd130cf367bb7a` | 17369 |
| `rysSPgUssLDf6xJc  get-results TEST` | `output-structurer` | `c015c6febe603907` | `68bd130cf367bb7a` | 17369 |

## NOT promoted — verified exclusions

| node | why |
|---|---|
| `Switch` (spine) | **F1 BLOCKER.** live has `get-presigned-url` between `Loop Over Items1[1]` and `Switch`; its response body has NO `mimeType`, so `$json.mimeType` is undefined on live and every attachment falls to `fallbackOutput`. Clone reverted to live expression. |
| `not-found-error-message` | clone is **BEHIND live** (missing `_ORDER_TYPES` phrasing + `notFoundRaw` fold) |
| `If10` | clone is **BEHIND live** (missing casual/business_query correction guard) |
| `If-incoming-picker` | clone drift: `typeValidation loose/v2` vs live `strict/v3` |
| `build-ideate-reply`, `patch-transcript` | harness lanes (mock ideate / mock transcript) |
| `output_exchange` (parser fork) | fork is **BEHIND live** by exactly 2 lines — missing `resource_attachment` in `DOMAIN_BLOCKED_HINTS.order`/`.incoming`. Copying REGRESSES live. |
| `chat-attach-push`, `guard-*-record` | clone-only harness nodes |

## Per-target construction notes

- **`Fss5aAaXthJSWpZCgKiKR` / `entity-ids-transformer`** — F2: the CS-BUILD body carries the harness tail
  inherited from `rysSPgU`:
  ```js
  out.contact_id = $input.first().json.contact_id.trim().toString()
  out.space_id = "364817"
  ```
  **CORRECTED 2026-08-09 — this is hygiene, NOT an outage.** The reviewer (and I, repeating it) claimed
  `.trim()` would throw because the probes pass no `contact_id`. Verified false: all six callers pass
  `contact_id` at TOP LEVEL (`={{ $('sorento-sub-respond-findcontact-respond').first().json.id }} ` —
  the trailing space is exactly what the `.trim()` cleans), and `semantic_input.space_id` is already
  `"364817"`, so the tail is behaviour-neutral today.

  It is still a REPLACEMENT of live's safer version, appended after it:
  live uses `semantic_input?.contact_id` / `?.space_id` (optional-chained, single source); the tail
  swaps the source to the trigger payload, drops the optional chaining, and freezes `space_id`.
  **Strip both lines for `Fss5aAa`** — live's version is strictly safer and already correct.
  **Keep them for `rys`**, which is that sub's current published behaviour and out of scope to change.

  Lesson worth keeping: the finding was reasoned from the FUNCTION (`.trim()` on a possibly-absent
  field) without checking the CALLERS. Correct reading of the code, wrong conclusion about the system.
- **Parser** — promote the `AI Agent` `options.systemMessage` LEAF only. Never the node, never `output_exchange`.

## Rollback

| workflow | rollback versionId |
|---|---|
| spine `9qVyfUxmRQqrpGRMDLRuz` | `d7a819fc` |
| parser `XTODTw-dJcV0uRdC056hG` | `659b7576` |
| get-results `Fss5aAaXthJSWpZCgKiKR` | `61b65e5f` |
| get-results TEST `rysSPgUssLDf6xJc` | `da0644da` |
