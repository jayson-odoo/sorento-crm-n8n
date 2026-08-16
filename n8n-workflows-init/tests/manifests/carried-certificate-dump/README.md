# Per-rev MANIFEST snapshots — `carried-certificate-dump`

Practice and diff recipe: see `../dym-probe-before-offer/README.md` (unchanged).

## Snapshots

| rev | versionId | note |
|---|---|---|
| 0 | `3a196c44` | **rollback baseline for B1.** Not duplicated here — it is byte-identical to `../dym-probe-before-offer/rev8-3a196c44.MANIFEST.json` (same clone versionId, last rev of the previous change). |
| 1 | `2d1627c8` | **B1 `attachment-subject-gate`.** One node changed: `disallowed-entity-gate` (`sha256 7626c83e… → a8938abe…`). 149 nodes, connections identical, 28/28 credentials intact. |

Rollback: `publish_workflow txiPzSxy3Pclsz6v 3a196c44-66d3-4c43-8039-17130f60ef7d`, then re-run
`export-workflows.py`.

## B2′ — parser fork `wI5RkNGW3EOJfBdo` (a DIFFERENT workflow from rev0/rev1 above)

🛠 **SUPERSEDED 2026-08-08:** the fork **IS** now in the export set as
`export/sub-semantic-parser-FORK/`, so `export-workflows.py --verify` covers it and these snapshots
are no longer its only staleness handle. (It was not tracked when this file was written.)

| rev | versionId | note |
|---|---|---|
| 0 | `c9f6e280` | **rollback baseline for B2′.** `versionId == activeVersionId`, no draft. |
| 2 | `95193323` | **B2′ `certificate-eviction`.** One node changed: `output_exchange` (`sha256 710e577a…` → `a773fff4…`, 867 → 978 lines). 8 nodes, connections byte-identical, 2/2 credentials intact. |

Rollback: `publish_workflow wI5RkNGW3EOJfBdo c9f6e280-e686-4bbb-a5ab-42615b63e997`, then re-run
`export-workflows.py`.

⚠️ The fork is STALE vs live `XTODTw` by two `DOMAIN_BLOCKED_HINTS` lines (`'resource_attachment'` in
`.order` and `.incoming`). **Never block-copy the fork to live.** Build the promote target as LIVE +
these hunks with `../../offline/carried-certificate-dump/oe-patch.py --src <live body> --out <target>`;
its anchors are asserted, so it aborts if live has drifted.

| 2 | `3f1b20d4` | **B1 RESTORED** after a silent UI-save revert (clone sat on the pre-B1 body `7626c83e` from `b94eea53` 08-07 07:46 to `879d0f68` 08-08 04:41). Restored node sha `a8938abe…` — exact match to rev 1. 148 nodes (`get-presigned-url` stays removed), 27/27 credentials. Rollback = `879d0f68-15cf-4e18-af0d-34bbd3636f29`. |

⚠️ No snapshots exist for the reverted revisions — they were not produced by this pipeline. That
gap is itself the argument for `assert-b1-present.sh` (see `tests/uac/CD.md` §CD-0b).
