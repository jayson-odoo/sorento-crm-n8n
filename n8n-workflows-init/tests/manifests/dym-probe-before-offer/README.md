# Per-rev MANIFEST snapshots — `dym-probe-before-offer`

**Why this exists.** `export-workflows.py` rewrites every exported file on each run, which destroys
mtime, so "what changed on the clone between rev N and rev N+1?" was unanswerable retrospectively —
the tester hit exactly that on rev6→rev7. `MANIFEST.json` already carries `versionId` plus a
**per-node sha256**, so snapshotting it once per published rev makes that question answerable with
no new tooling: diff two snapshots and the differing node hashes are the answer.

**Do this from here on, immediately after each `publish` + `export-workflows.py`:**

```bash
cp n8n-workflows-init/export/clone-sorento-consume-main-TEST/MANIFEST.json \
   n8n-workflows-init/tests/manifests/<change-id>/rev<N>-<versionId-prefix>.MANIFEST.json
```

Compare two revs:

```bash
python3 - <<'PY'
import json
a=json.load(open('rev8-3a196c44.MANIFEST.json')); b=json.load(open('rev9-xxxxxxxx.MANIFEST.json'))
A,B=a['nodes'],b['nodes']
print('changed:', sorted(k for k in A if k in B and A[k]!=B[k]))
print('added  :', sorted(set(B)-set(A)))
print('removed:', sorted(set(A)-set(B)))
PY
```

## Snapshots

| rev | versionId | note |
|---|---|---|
| 8 | `3a196c44` | fail-open comment correction (sentinel/`error` branch); first snapshot — revs 1–7 predate this practice and have **no** snapshot, so a retrospective diff earlier than rev 8 is not possible. |

Per the reviewer, no retrospective rev6→rev7 diff is required, and for a structural reason rather
than tolerance: promote builds the three modified nodes as **LIVE + reviewed hunks**, so an
unnoticed clone-side change cannot reach live. The exposure is only the **8 added** nodes — 4 of
which are byte-covered by `parity.js`, 2 are one-expression IF gates, 2 are config-only.
