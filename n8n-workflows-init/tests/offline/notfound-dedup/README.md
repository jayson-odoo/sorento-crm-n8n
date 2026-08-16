# Offline harness — `notfound-dedup` (GH #11, #12)

Runs the REAL `not-found-error-message` body against fixtures captured **verbatim from live
executions** — `11823791` (#11) and `11823769` (#12). No n8n, no network.

```bash
node probe.js nfem.before.js   # the defects reproduce:  RED 3/6
node probe.js nfem.after.js    # post-fix:               GREEN 6/6
./mutate.sh                    # §0 S9 fail-on-purpose:  5/5 mutants caught
```

| file | what |
|---|---|
| `nfem.before.js` | fork `not-found-error-message` @ `9c00e846` — identical to live, both defects present |
| `nfem.after.js`  | the bytes actually PUT — fork @ `279abf9a` (13,091 → 14,407 chars) |
| `fixtures.json`  | `qf` / `r` / `gate` / node input, captured from the two live executions |
| `probe.js`       | 6 assertions across both defects |
| `mutate.sh`      | 5 mutants, one per guarded property |

## The two fixes

**#11** — the access-level phrase arrives as a resolver **token** (`tokens: ['Mocha Dealer']`) while
the `access` suffix already names it, so it printed twice. Tokens/unresolved/entities matching an
`access_levels` entry are excluded from `requested`, and the `" for …"` segment is dropped entirely
when nothing survives.

**#12** — `_byType` kept `_compat` order, so `codes[0]` could name a sibling variant (`SRTSH1040-T`
for a typed `SRTSH1040`). An exact token match is now promoted to the front. `(+N more)` unchanged.

## 🔴 Where this harness is BLIND

- **No customer boundary.** It asserts the producer node's `escalate_message`. Both fixes were
  additionally verified on real runs at the sendmsg payload — that check is the one that counts.
- Fixtures are two turns. Other `not-found-error-message` arms (attachment, order-status,
  vague-token, require-specific) are **not** exercised; the hunks avoid them by construction but that
  is an argument, not a test.
