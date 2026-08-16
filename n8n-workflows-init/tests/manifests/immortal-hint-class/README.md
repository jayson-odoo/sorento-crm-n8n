# Per-rev MANIFEST snapshots — `immortal-hint-class` (C1 / C2 / C3 / M2)

Practice and diff recipe: see `../dym-probe-before-offer/README.md` (unchanged).

## Parser fork `wI5RkNGW3EOJfBdo` — C1 + C2 + M2

| rev | versionId | note |
|---|---|---|
| 0 | `95193323-e6cd-462a-9a91-aea08457b46c` | **ROLLBACK BASELINE.** B2′ as built, with the M2 defect present. Snapshot: `../carried-certificate-dump/rev2-fork-95193323.MANIFEST.json`. |
| 1 | `aab47959-9ee5-4283-a878-6e8af69d895a` | **C1 `immortal-hint-axis` + C2 `no-domain-name-hints` + M2 `ordinal`-exemption fix.** One node changed: `output_exchange` (`62,267 → 68,160` chars, sha `deaf3ef24e01`). 8 nodes, connections byte-identical, 2/2 credentials intact. |
| 2 | `184882c1-9ad8-4aff-bb36-3fe2340a87de` | **CURRENT. Tester pass-2 F3** — `unknown_entity_hints` was blind to DORMANT carried entities (the contribution loop short-circuits on `_ceIsCarried` before classifying; the reuse branch never calls `axisOf` at all), so the diagnostic could not see the immortal population it exists to measure (exec `11645628`). Fixed by an explicit diagnostic-only sweep of the final entity set. One node changed: `output_exchange` (`68,160 → 69,449` chars, sha `536f8fb67d3a`). Connections byte-identical, 2/2 credentials intact, `versionId == activeVersionId`. |

Rollback (one rev): `publish_workflow wI5RkNGW3EOJfBdo aab47959-9ee5-4283-a878-6e8af69d895a`.
Rollback (all): `publish_workflow wI5RkNGW3EOJfBdo 95193323-e6cd-462a-9a91-aea08457b46c`.
Then re-run `export-workflows.py`.

## Clone `txiPzSxy3Pclsz6v` — C3

| rev | versionId | note |
|---|---|---|
| 0 | `5fdd12df-a048-4f03-9141-c27b9f09674a` | **ROLLBACK BASELINE.** ⚠️ Not `2d1627c8` — the clone had already moved when this change was planned; `--verify` exited 1 on arrival. |
| 1 | `544138ca-95b4-4bdb-a2f4-2cd467ad0ef8` | **C3 `multitoken-d1-annotate`.** Five nodes changed: `dym-transform` + `dym-transform-partial` (both sha `d75a5198befc`), `dym-annotate` (`2e700477c414`) + `dym-annotate-partial` (`46882e9a2e5f`), `build-suggest-offer` (`08aec1d01e2c`). 148 nodes, connections byte-identical, 27/27 credentials intact. |
| 2 | `a2422bb9-1351-4da0-a83a-bb6f9afd0839` | **CURRENT. Tester pass-2 F1 (promote blocker)** — `inventory.probe_cap` `5 → 3`. Exec `11646010` measured **13 rows for a single stocked candidate**: the grain is warehouse × SYSTEM-LOCATION, not warehouse, so 5 × 13 = 65 saturated the 50-row budget every time and the feature silently vanished on multi-token inventory turns. `product_attachment: 8` confirmed safe (~0.8–1.3 rows/candidate) and left alone. **Only `dym-transform` + `dym-transform-partial` changed** (both sha `64c3f50d381e`); `dym-annotate` ×2 and `build-suggest-offer` are **byte-identical to rev 1** — the PUT reported them `ALREADY IDENTICAL` and skipped them, which is the mechanical proof that §IH-13's live-proven `product_attachment` behaviour was not disturbed. Connections byte-identical, 27/27 credentials intact, `versionId == activeVersionId`. |

| 3 | `879d0f68-15cf-4e18-af0d-34bbd3636f29` | **CURRENT. Reviewer F-STRIP** — `dym_capped_codes` and `probe_cap_applied` were never added to `_DYM_CTRL_KEYS`, so `build-suggest-offer` leaked two stray keys on every not-found turn including every non-enabled domain (§DP-10 byte-identity). Two nodes changed: `build-suggest-offer` (sha `253fe16453c8`) and `compile-current-state` (**comment-only**, sha `c99251118e2d` — the F-CCS-STRIP rationale enumerated "10 harness control keys" and was stale at 12). `dym-transform` ×2 and `dym-annotate` ×2 reported `ALREADY IDENTICAL` and were skipped. Connections byte-identical, 27/27 credentials intact, `versionId == activeVersionId`. |

Rollback (one rev): `publish_workflow txiPzSxy3Pclsz6v a2422bb9-1351-4da0-a83a-bb6f9afd0839`.
Rollback (all): `publish_workflow txiPzSxy3Pclsz6v 5fdd12df-a048-4f03-9141-c27b9f09674a`.
Then re-run `export-workflows.py`.

## ⚠️ Node count 149 → 148 — NOT caused by this change

`3a196c44` (dym-probe rev8) and `2d1627c8` (B1) are **149**; every `immortal-hint-class` rev is
**148**. The drop happened in `2d1627c8 → 5fdd12df`, and `5fdd12df` is the state this change *found*
— confirmed by the first REST GET, taken before any write here. Also established: the removed node
was **not a code node** (the 38 code-node hashes are an identical name-set across `2d1627c8` and
today) and it **was credentialed** (28 → 27, and 27 has held across all three revs). The removal was
clean — no dangling connection endpoints and no `$('X')`/`$("X")` read resolving to a missing node.

**The node's identity is NOT recoverable** from anything available here: no backup holds a 149-node
snapshot (they top out at 141 @ `4c63eb41`), the git-tracked export has one commit at 141
@ `a5cf2434`, REST `?includeData=true` does not return `workflowData` on this n8n version, and MCP
`get_execution` returns metadata only. **Open item for whoever owns the `2d1627c8 → 5fdd12df`
interval** — it is not attributable to `immortal-hint-class` and cannot be closed from here.

## The fork is now IN the export set

`export/sub-semantic-parser-FORK/` was added by this change, so
`export-workflows.py --verify` now covers it and the fork↔live delta (§IH-0e / plan §6-IH-V5) is a
`git diff` of two exported files instead of a hand-rolled REST pull. It is **not live** — never
promote from that directory (LESSONS §57). Build the promote target with:

```bash
python3 tests/offline/carried-certificate-dump/oe-patch.py \
    export/sub-semantic-parser/nodes/output_exchange.js <target.js>       # B2' + C1 + C2 + M2
python3 .../oe-patch.py <live body> <target.js> --no-c                    # B2' only (provenance)
```

Measured 2026-08-08 against the published fork rev 1: `diff fork ↔ oe-patch(live)` is **exactly one
hunk**, the two `DOMAIN_BLOCKED_HINTS` `resource_attachment` entries live has and the fork lacks.
Any additional hunk halts the promote.
