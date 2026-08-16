---
name: codex-review
description: Second-opinion review from a different model family (OpenAI Codex CLI). Runs `codex exec` read-only over the exported n8n node bodies and the working-tree diff, then the main session verifies and merges the findings with /code-review. Use in step 8 on any diff that will be promoted to live, or when the user asks for a codex/cross-model review.
---

# /codex-review — cross-model second-opinion review

A different model family catches different bug classes. This skill shells out to the OpenAI
Codex CLI for a read-only review, then the main session verifies and merges the findings.

**Why this works here at all:** the reviewable artifact used to be a 444 KB remote JSON blob that
only MCP could reach. `n8n-workflows-init/export/<slug>/nodes/*.js` are now real files on disk, so
a model with no n8n access can still read the code that actually runs. Codex reviews the *files*;
it never touches the remote instance.

## Preconditions

1. `codex --version` works (installed via `brew install codex`).
2. Authenticated: `codex login status`. If not logged in, STOP and ask the user to run
   `! codex login` (interactive browser flow, uses their ChatGPT subscription). Never attempt to
   log in for them.
3. **The export must be fresh.** Run first, always:

   ```bash
   python3 n8n-workflows-init/scripts/export-workflows.py --verify
   ```

   A stale export means codex reviews code that is not what runs. If verify exits 1, re-export
   before running codex — do not proceed on the old files. This is the same gate as `/feature`
   step 1 and it is not optional here.

## What codex is allowed to see

- `n8n-workflows-init/export/<slug>/nodes/*.js` — the node bodies as real files
- `n8n-workflows-init/export/<slug>/TOPOLOGY.md` — edges, read-BY-NAME map, orphans, sub-calls
- `n8n-workflows-init/tests/offline/<slug>/` — probes, fixtures, mutation scripts
- the git diff of the above
- the promote candidate file (LIVE + your own hunks) before step 9, if one exists

Codex does **not** get: `.env`, the MCP server, the remote instance, the `n8n_test` DB. It has no
credentials for any of them and `--sandbox read-only` keeps it from writing anywhere.

## How to run

Determine the diff base (usually `main`, or the merge-base the user names), then:

```bash
codex exec --sandbox read-only --cd n8n-workflows-init \
  "Review the diff between <base> and HEAD for CORRECTNESS BUGS only. This code is n8n Code-node
   JavaScript for a WhatsApp chatbot: each file in export/*/nodes/ is one node body, and
   export/*/TOPOLOGY.md gives the graph and which nodes read which other nodes BY NAME.

   Prioritise these failure classes, which have all shipped broken here before:
   - a node read by name (\$('x') or \$(\"x\")) whose producer was renamed, rewired or removed —
     rewiring does NOT redirect a by-name read
   - a rendered customer-facing string built on more than one code path, where the diff changes
     only some of them (enumerate renderers by the literal output string, not by graph edges)
   - a guard or kill-switch that fails OPEN — the unsafe branch runs when the flag is missing,
     null, the string \"false\", or the property is absent entirely
   - an error-output branch (continueErrorOutput) whose main[1] goes nowhere, so a failure is
     reported as success
   - a parameter name passed to a downstream tool/MCP call that does not match what the callee
     reads, which is dropped silently and yields an empty result rather than an error
   - state written under one key shape and read under another (nested vs top-level session_vars)
   - byte/length caps computed on .length (UTF-16 units) where the limit is bytes
   - an assertion or test that passes when the guarded-against thing HAPPENED

   Ignore style, formatting, naming, and anything about n8n UI positioning.
   Output one finding per line as: <file>:<line> | <problem> | <suggested fix>.
   If you find nothing, output exactly: NO FINDINGS."
```

- `--sandbox read-only` is mandatory: codex must never write to the tree.
- `--cd n8n-workflows-init` so it reads the harness, not the whole repo. For a single-workflow
  diff, `--cd n8n-workflows-init/export/<slug>` reads even less.
- Long diffs: one pass per workflow (spine, parser sub, sendmsg sub) rather than one giant pass.
- Timeout generously (5–10 min); codex explores files itself.

## Merging findings

- Treat codex output as **CANDIDATE** findings, exactly like a `/code-review` low-confidence pass:
  verify each against the actual node body before reporting. A different model family has
  different false positives, not fewer.
- Codex is reading a *cache*. Before acting on a finding, confirm the line still exists in the
  verified export; if verify has since gone stale, the finding is void.
- Dedupe against the primary `/code-review` findings; report the union, marking which reviewer
  found what only when the user asks.
- Never let a codex finding bypass this repo's contract: `CLAUDE.md`'s safety rule, `docs/LESSONS.md`,
  and the UAC family file stay the bar. "Codex says it's fine" does not clear a promote gate.

## What this skill is NOT

- **Not an executor.** Codex never writes code here, never edits a workflow, never runs an
  execution, never promotes. Implementation stays with `sorento-coder` on the clone.
- **Not a replacement for `sorento-reviewer` or `/code-review`.** It is the second opinion, run
  after, on the diffs that are about to touch live.
- **Not a zero-egress check.** Egress is proven from the `test:egress:{test_run_id}` log and
  sink-delta with payload attribution (step 7), by an agent that can actually see the run. Codex
  reads static files and cannot clear §0.

## Related

- `.claude/skills/feature/SKILL.md` — step 8, where this fits in the pipeline
- `CLAUDE.md` — the export contract and the `--verify` gate
- `docs/LESSONS.md` — §57 promote-as-hunks, §61 green-that-cannot-fail, §62 where time goes
