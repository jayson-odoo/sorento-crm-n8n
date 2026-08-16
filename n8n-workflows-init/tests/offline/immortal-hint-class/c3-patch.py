#!/usr/bin/env python3
"""C3 `multitoken-d1-annotate` patch for the spine/clone nodes.

    dym-transform + dym-transform-partial   gate open on the D1 lane + per-domain probe_cap
    dym-annotate  + dym-annotate-partial    page-saturation detection
    build-suggest-offer                     the rendered suffix on the multi-token D1 block

Usage: c3-patch.py <srcdir> <outdir>
  srcdir must contain dym-transform.js, dym-transform-partial.js, dym-annotate.js,
  dym-annotate-partial.js, build-suggest-offer.js.

⚠️ The `-partial` twins are the SAME body apart from two lane literals, so every hunk is applied
to BOTH copies from the same source string. A hunk applied to one copy only is the §IH-FP-11 defect.

Every hunk asserts its search string occurs EXACTLY once before substituting and that the file
changed afterwards (UAC §0 S9 / LESSONS §61b).
"""
import sys, pathlib, hashlib

src = pathlib.Path(sys.argv[1])
out = pathlib.Path(sys.argv[2]); out.mkdir(parents=True, exist_ok=True)

XF_HUNKS = []
AN_HUNKS = []
BSO_HUNKS = []
CCS_HUNKS = []

# ══════════════════════════════ dym-transform ══════════════════════════════

# ── C3 edit 1 — open the D1 multi-token gate ────────────────────────────────────────────────────
XF_HUNKS.append(("XF-gate", """    // MULTI-TOKEN: allowed on the PARTIAL lane only. compile-current-state's renderer shows
    // up to 5 missed tokens and does NO sorting, so the global-contiguous-idx renumbering
    // hazard that justifies D1's multi-token exclusion does not exist there. D1's exclusion
    // is unchanged — build-suggest-offer only annotates inside its single-token code mode.
    const _blocks = _isPartialLane ? _survivors : (_survivors.length === 1 ? _survivors : null);""",
"""    // ── C3 (immortal-hint-class) — MULTI-TOKEN IS NOW ALLOWED ON THE D1 LANE TOO ───────────────
    // The exclusion existed because D1 assigns a GLOBAL CONTIGUOUS idx across token sub-lists and
    // has-first sorting would renumber across blocks. The objection was to the SORT, never to the
    // SUFFIX: C3 annotates the rendered line WITHOUT re-sorting, so the renumbering hazard does not
    // exist and the exclusion dissolves. Same posture as the partial lane, which has shipped
    // multi-token since rev 4.
    //
    // It also stopped being a rare edge case. One stuck session entity makes EVERY turn carry ≥2
    // missed tokens, so every turn takes this path and the annotation becomes permanently
    // unreachable — six consecutive live turns did exactly that.
    //
    // `probe_skip_reason: 'multi_token'` is now unreachable on both lanes. The LITERAL IS RETAINED
    // DELIBERATELY (below) so a runData search for it distinguishes "never fired" from "constant
    // removed" — §IH-11 clause 5 asserts its absence.
    const _blocks = _survivors;"""))

# ── C3 mitigation (i) — per-domain probe_cap. Declared next to the tool, where the row-count
#    assumption lives.
XF_HUNKS.append(("XF-cap-cfg-attach", """    predicate: 'row_present_with_type',
    requires:  ['attachment_type', 'certificate'],     // ≥1 UUID-shaped scoping entity or we do not probe
  },""", """    predicate: 'row_present_with_type',
    requires:  ['attachment_type', 'certificate'],     // ≥1 UUID-shaped scoping entity or we do not probe
    // ── C3 mitigation (i): PROBE CAP. Multi-token carries up to 5 tokens x cap3 = 15 candidates in
    // ONE call. No `limit` is ever sent (TOOL_DEFAULT_QUERY_PARAMS has no entry for either probe
    // tool and entity-ids-transformer emits none), so the backend default applies:
    // `app/schemas/common.py:37  limit: int = 50`. Truncation is STRUCTURALLY UNDETECTABLE — the
    // render envelope (presenters.py:806-818 + _PASSTHROUGH_KEYS) carries no total/pagination, and
    // output-structurer.js forwards only nine keys and would drop it anyway. A candidate whose rows
    // fell off page 1 returns zero rows and renders a CONFIDENT `- no certificate` about a product
    // that has one — the exact class this feature exists to remove.
    // Overflow renders BARE (absent from dym_candidate_codes ⇒ absent from _dymProbed ⇒ no suffix),
    // so the cap can only ever withhold an annotation, never invent one.
    // ✅ MEASURED (tester pass 2, exec 11646010): ~0.8-1.3 rows/candidate, because the probe is
    // additionally scoped by attachment_type_ids. 8 candidates ⇒ ~10 of the 50-row budget, so this
    // is safe with a large margin and is CONFIRMED at 8. Contrast `inventory` below, where the
    // measured grain was 3x worse than estimated — do not generalise between the two domains.
    probe_cap: 8,
  },"""))

XF_HUNKS.append(("XF-cap-cfg-inv", """    requires:  [],
  },
};""", """    requires:  [],
    // ── C3 mitigation (i), and this is the WORST case by a wide margin.
    // ✅ MEASURED, not derived (tester pass 2, exec 11646010): a SINGLE stocked candidate returned
    // 13 rows. 🔴 THE GRAIN IS warehouse × SYSTEM-LOCATION, not warehouse — the original estimate
    // assumed one row per active warehouse and was wrong by ~3x. At 13 rows/candidate the backend
    // default (`app/schemas/common.py:37  limit: int = 50`) admits 3 candidates, not 5: 5 x 13 = 65
    // would saturate every time.
    // Saturation is fail-CLOSED (zero annotation, never a false label), but a cap that always
    // saturates makes the feature silently VANISH on exactly the multi-token inventory turns it
    // exists for — the shape the user reported. So 3 is a correctness value, not a tuning value.
    // ⚠️ DO NOT RAISE without re-measuring the row grain first.
    probe_cap: 3,
  },
};"""))

XF_HUNKS.append(("XF-cap-decl", """let dym_excluded_codes = [];   // F-DUPE: rendered but deliberately NOT probed
let probe_lane = 'd1';""", """let dym_excluded_codes = [];   // F-DUPE: rendered but deliberately NOT probed
let dym_capped_codes = [];     // C3 (i): over the domain's probe_cap ⇒ NOT probed ⇒ rendered BARE
let probe_cap_applied = false;
let probe_lane = 'd1';"""))

XF_HUNKS.append(("XF-cap-apply", """  if (cands.length === 0) {""", """  // ── C3 mitigation (i): apply the cap. `cands` and `dym_candidate_codes` are built in the same
  // loop under the same condition, so they are parallel arrays and a matched truncation is exact.
  // FAIL-OPEN by construction: a missing / non-positive / non-numeric probe_cap disables the cap
  // entirely rather than dropping candidates.
  const _cap = Number(cfg.probe_cap);
  if (Number.isFinite(_cap) && _cap > 0 && cands.length > _cap) {
    dym_capped_codes = cands.slice(_cap).map(c => c.code);
    cands.length = _cap;
    dym_candidate_codes = dym_candidate_codes.slice(0, _cap);
    probe_cap_applied = true;
  }

  if (cands.length === 0) {"""))

XF_HUNKS.append(("XF-return", """    dym_candidate_codes,
    dym_excluded_codes,""", """    dym_candidate_codes,
    dym_excluded_codes,
    dym_capped_codes,
    probe_cap_applied,"""))

# ══════════════════════════════ dym-annotate ══════════════════════════════

AN_HUNKS.append(("AN-const", """const norm = (s) => String(s ?? '').trim().toLowerCase();""",
"""const norm = (s) => String(s ?? '').trim().toLowerCase();

// ── C3 mitigation (ii): PAGE SATURATION. The backend default page size is
// `app/schemas/common.py:37  limit: int = 50` and NOTHING in the envelope reports truncation, so a
// full page is the only signal available that rows may have been cut. Detection-by-proxy, and it is
// the only defence if the per-domain probe_cap's rows-per-candidate assumption is wrong. A
// saturated page ⇒ ok:false ⇒ ZERO annotation ⇒ byte-identical to the un-annotated offer. It can
// only ever withhold an annotation.
// Cost of a false positive: an exactly-50-row honest answer loses its annotation for that turn.
// Cost of a false negative: a confident `- no <noun>` about a product that HAS the thing.
const _PAGE_SATURATION = 50;"""))

AN_HUNKS.append(("AN-branch", """} else if (!answers) {
  meta.reason = 'no_answers_array';
} else if (meta.predicate === 'qty_gt_zero') {""",
"""} else if (!answers) {
  meta.reason = 'no_answers_array';
} else if (answers.length >= _PAGE_SATURATION) {
  // C3 (ii). Checked BEFORE either predicate: both attribute by code, and an attribution built on a
  // truncated page is wrong in the one direction that matters (a missing code reads as "no").
  meta.answer_count = answers.length;
  meta.reason = 'page_saturated';
} else if (meta.predicate === 'qty_gt_zero') {"""))

# ══════════════════════════════ compile-current-state ══════════════════════════════
# COMMENT-ONLY. The F-CCS-STRIP rationale enumerates the control keys dym-transform-partial
# appends; it said "10" and was already stale at 12 before C3 added two more. A load-bearing
# invariant whose documentation is wrong decays into a refactor hazard, so the count is corrected
# here. NO behavioural change — the node still builds a fresh object literal and strips nothing.
CCS_HUNKS.append(("CCS-comment", """// dym-transform-partial sits directly upstream on the results lane and APPENDS 10 harness
// control keys to the item this node receives (dym_probe_entities, dym_candidate_codes,
// dym_excluded_codes, probe_tool, probe_noun, probe_predicate, probe_needed,
// probe_skip_reason, probe_lane, _dym_probe_input). This node needs no strip list ONLY
// because it builds its output from scratch and copies named fields across.""",
"""// dym-transform-partial sits directly upstream on the results lane and APPENDS 14 harness
// control keys to the item this node receives (dym_probe_entities, dym_candidate_codes,
// dym_excluded_codes, dym_capped_codes, probe_cap_applied, probe_tool, probe_noun,
// probe_predicate, probe_needed, probe_skip_reason, probe_lane, _dym_probe_input, plus
// dym_available_codes / dym_probe_meta added downstream by dym-annotate-partial).
// This node needs no strip list ONLY because it builds its output from scratch and copies
// named fields across. (Count was stale at 10 through the dym-probe and C3 changes — reviewer
// F-STRIP. Keep it accurate: it is the evidence the invariant was re-checked.)"""))

# ══════════════════════════════ build-suggest-offer ══════════════════════════════

BSO_HUNKS.append(("BSO-suffix", """    for (const p of s.picks) {
      idx += 1;
      const isU = isUuid(p.m.canonical_code);
      candLines.push(`  ${idx}. ${p.label}`);""",
"""    for (const p of s.picks) {
      idx += 1;
      const isU = isUuid(p.m.canonical_code);
      // ── C3 (immortal-hint-class): annotate the RENDERED LINE ONLY. ────────────────────────────
      // No sort is introduced: `idx` still increments once per pick in exactly the same order, so
      // the numbering is preserved BY CONSTRUCTION and §IH-11 clause 3 (strip the suffixes, diff
      // against the pre-change render) holds byte-for-byte.
      // The suffix lands on `candLines`, a local array feeding ONLY suggest_response. It is never
      // applied to `p.label`, so suggest_last_result_set[].label stays BARE and the numbered pick
      // still round-trips on idx/value. dym_candidates (for_raw/for_hint/for_canonical) is a
      // separate statement and is untouched.
      // Unprobed ⇒ BARE, never a misleading `- no`: capped codes, multi-uuid exclusions and
      // unmappable types are all absent from _dymProbed and all render with no suffix.
      const _k = _dymNorm(p.m.canonical_code);
      const _sfx = (_dymOk && _dymProbed.has(_k))
        ? (_dymHas.has(_k) ? ` - has ${_dymNoun}` : ` - no ${_dymNoun}`)
        : '';
      candLines.push(`  ${idx}. ${p.label}${_sfx}`);"""))

# ── F-STRIP (reviewer) — the two C3 control keys were never added to the strip list ────────────
# `dym-transform` appends its control keys to EVERY not-found turn, including every non-enabled
# domain, and `build-suggest-offer` starts from `{...$input.first().json}`. So without these two
# entries the output object carries `dym_capped_codes` + `probe_cap_applied` on the path covering
# most traffic, breaking §DP-10 (the byte-identity gate).
# Re-derived rather than assumed: this is the ONLY strip list in the clone. The partial lane's
# consumer (`compile-current-state`) needs none because it builds a FRESH OBJECT LITERAL and copies
# named fields across — the F-CCS-STRIP invariant, which still holds for these two keys.
BSO_HUNKS.append(("BSO-strip", """const _DYM_CTRL_KEYS = ['dym_probe_entities', 'dym_candidate_codes', 'dym_excluded_codes',
  'probe_tool', 'probe_noun', 'probe_predicate', 'probe_needed', 'probe_skip_reason',
  'probe_lane', '_dym_probe_input', 'dym_available_codes', 'dym_probe_meta'];""",
"""const _DYM_CTRL_KEYS = ['dym_probe_entities', 'dym_candidate_codes', 'dym_excluded_codes',
  'probe_tool', 'probe_noun', 'probe_predicate', 'probe_needed', 'probe_skip_reason',
  'probe_lane', '_dym_probe_input', 'dym_available_codes', 'dym_probe_meta',
  // C3: both emitted UNCONDITIONALLY by dym-transform, which runs on every not-found turn
  // including every non-enabled domain. Omitting them leaked two stray keys into this node's
  // output on most traffic (reviewer F-STRIP). ⚠️ ANY new dym-transform output key must be added
  // here in the same commit that introduces it.
  'dym_capped_codes', 'probe_cap_applied'];"""))

# also correct the now-stale scope comment above the annotation inputs
BSO_HUNKS.append(("BSO-scope-comment", """// Scope: the single-token D1 CODE mode only. Numbered mode, multi-token D1 and D2
// are deliberately untouched (see the annotation block further down).""",
"""// Scope: the single-token D1 CODE mode, the require-specific picker, and — since C3
// (immortal-hint-class) — the MULTI-TOKEN D1 block. Single-token NUMBERED mode and D2
// remain deliberately untouched."""))


def apply(name, hunks):
    p = src / name
    body = p.read_text()
    for hid, find, repl in hunks:
        n = body.count(find)
        if n != 1:
            raise SystemExit("%s / %s: search string occurs %d times, want exactly 1" % (name, hid, n))
        prev = body
        body = body.replace(find, repl, 1)
        if body == prev:
            raise SystemExit("%s / %s: body unchanged after substitution" % (name, hid))
    body = "\n".join(ln.rstrip() for ln in body.split("\n"))
    (out / name).write_text(body)
    print("  %-28s %6d -> %6d chars  sha %s  (%d hunks)" % (
        name, len(p.read_text()), len(body),
        hashlib.sha256(body.encode()).hexdigest()[:12], len(hunks)))

for n in ("dym-transform.js", "dym-transform-partial.js"):
    apply(n, XF_HUNKS)
for n in ("dym-annotate.js", "dym-annotate-partial.js"):
    apply(n, AN_HUNKS)
apply("build-suggest-offer.js", BSO_HUNKS)
apply("compile-current-state.js", CCS_HUNKS)
