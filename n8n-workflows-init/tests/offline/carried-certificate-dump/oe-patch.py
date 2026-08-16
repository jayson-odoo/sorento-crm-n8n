#!/usr/bin/env python3
"""B2' (carried-certificate-dump) + C1/C2/M2 (immortal-hint-class) patch for output_exchange.js.

Applies the four B2' hunks bottom-up by line number so earlier inserts never shift later
anchors, then applies the immortal-hint-class hunks (C1 `immortal-hint-axis`,
C2 `no-domain-name-hints`, M2 the `ordinal`-exemption fix) as EXACT-COUNT-ASSERTED string
replacements on the result — string anchors, so they are immune to the line shifts the
B2' pass introduces.

Source = the LIVE body (`export/sub-semantic-parser/nodes/output_exchange.js`) at promote
time (LESSONS §57: build the target as LIVE + own hunks, NEVER a fork copy). Passing the
FORK body reproduces the fork, which is how the fork↔live delta is measured.

    python3 oe-patch.py <src.js> <out.js>            # B2' + C1 + C2 + M2   (the promote target)
    python3 oe-patch.py <src.js> <out.js> --no-c     # B2' only             (provenance / the fork @ 95193323)

Every hunk asserts its search string occurs EXACTLY once before substituting and that the
body actually changed afterwards (LESSONS §61b / UAC §0 S9) — a silent no-op patch that
still prints "wrote" is the failure this guards.
"""
import sys, pathlib, hashlib

HERE = pathlib.Path(__file__).parent
ARGV = [a for a in sys.argv[1:] if not a.startswith("--")]
WITH_C = "--no-c" not in sys.argv
C_ONLY = "--c-only" in sys.argv          # source already carries B2' (the fork): apply C hunks only
src = pathlib.Path(ARGV[0] if len(ARGV) > 0 else HERE / "oe.before.js")
out = pathlib.Path(ARGV[1] if len(ARGV) > 1 else HERE / "oe.regen.js")

L = src.read_text().split("\n")

# ── anchors (asserted, not assumed) ────────────────────────────────────────────
def need(i, text):
    if L[i - 1] != text:
        raise SystemExit("ANCHOR FAIL line %d\n  want %r\n  got  %r" % (i, text, L[i - 1]))

A_SNAP = 78    # close of the _parser_raw_snapshot IIFE
A_PICK = 187   # applyDymPick: dym_slot stamp
A_EXEC0, A_EXEC1 = 310, 349   # executor header .. close of the local axisOf
A_BLOCK = 656  # blocklist-apply `if`

if "--c-only" not in sys.argv:
    need(A_SNAP, "})();")
    need(A_PICK, "  if (_slot != null) _picked.dym_slot = _slot;   // stamp so tier-0 resolves the NEXT pick (code-reply)")
    need(A_EXEC0, "// ── ENTITY OPERATION EXECUTOR (op + axis-aware replace/combine) ──")
    need(A_EXEC1, "    };")
    need(A_BLOCK, "if (output.output?.entities && Array.isArray(output.output.entities)) {")

# ── HUNK 4 — the post-merge reconciliation pass (B2' parts 2,4,5) ──────────────
HUNK_RECONCILE = r"""
// ── B2' (carried-certificate-dump) — POST-MERGE ENTITY RECONCILIATION ──────────────────────────
// Placed AFTER every entity-set writer — tryDymPick (applyDymPick), the op executor,
// dymNumberedMultiSelect, the reference-positions block and block (B) — and after the two
// domain-carry blocks + the #6 switch, so `domain_hint` is FINAL and the axis classification here is
// the one the rest of the turn uses. Runs immediately BEFORE blocklist-apply. Plan §3.6 parts 2/4/5.
//
// Why a post-merge pass and not a wider `prior` filter (plan §3.0): the executor's axis filter at
// `keptPrior = prior.filter(...)` touches `prior` ONLY — `current` is spread unfiltered — and
// applyDymPick promotes every carried entity into `current` before the executor runs, while
// dymNumberedMultiSelect overwrites the executor's output wholesale afterwards. Both bypass the axis
// map entirely. This pass sits downstream of all of them.
if (output.output && !output.output.is_menu_label && Array.isArray(output.output.entities)) {
  const _rcDomain = output.output.domain_hint;
  const _rcEnts   = output.output.entities;
  // INSTANCE-bound attachment scope: a specific certificate NUMBER or a specific attachment. These
  // are narrowing filters bound to the product they were resolved against, so they are stale by
  // construction the moment product scope changes (an empty product_ids ∧ certificate_ids
  // intersection reads to the customer as a confident "no certificate for X" — F-CARRY-NARROW).
  // `attachment_type` is deliberately NOT evictable here: it is a TYPE filter that legitimately
  // outlives a product change, and re-attaching it is block (B)'s entire purpose.
  const _RC_INSTANCE_HINTS = new Set(['certificate', 'attachment']);

  // "contributes" = present in the final set and NOT carried (provenance, per _ceIsCarried).
  let _rcContribAttach = false, _rcContribProduct = false;
  for (const e of _rcEnts) {
    if (_ceIsCarried(e)) continue;
    const _ax = _ceAxisFor(e, _rcDomain);
    if (_ax === 'attachment_scope') _rcContribAttach = true;
    if (_ax === 'product_scope')    _rcContribProduct = true;
  }
  // Part 4 — the widened trigger. The product_scope half is the load-bearing one: it is what fixes
  // the bare-product follow-up (plan §3.2 row 2, ruled a design error by §3.0) AND the post-B1
  // did-you-mean CODE reply, which is the modal turn B1 funnels affected customers into.
  const _rcEvict = _rcContribAttach || _rcContribProduct;
  const _rcDropped = [];
  let _rcKept = _rcEnts;
  if (_rcEvict) {
    _rcKept = _rcEnts.filter(e => {
      const _drop = _ceIsCarried(e)
        && _ceAxisFor(e, _rcDomain) === 'attachment_scope'
        && _RC_INSTANCE_HINTS.has(_ceNorm(e && e.hint));
      if (_drop) _rcDropped.push(String(e.hint) + ':' + String(e.canonical_code || e.raw));
      return !_drop;
    });
  }

  // Part 5 — dedupe. `current` is spread unconditionally by the executor and is never pruned, so once
  // applyDymPick promotes the carried set into `current` the entity list becomes append-only for that
  // axis. That is what produced FIVE copies of PC 000078 in the observed state (plan §5.1c) and what
  // made gate_debug.entities_count disagree with compatible_entities.length.
  const _rcSeenKey = new Set(), _rcSeenUuid = new Set(), _rcOut = [];
  let _rcDupes = 0;
  for (const e of _rcKept) {
    const _k = _ceKey(e);
    const _u = (e && e.uuid) ? (_ceNorm(e.hint) + '|' + _ceNorm(e.uuid)) : null;
    if (_rcSeenKey.has(_k) || (_u && _rcSeenUuid.has(_u))) {
      _rcDupes++;
      // never lose a resolution to the dedupe: backfill onto the retained twin
      const _first = _rcOut.find(x => _ceKey(x) === _k)
        || (_u ? _rcOut.find(x => x && x.uuid && (_ceNorm(x.hint) + '|' + _ceNorm(x.uuid)) === _u) : null);
      if (_first) {
        if (!_first.uuid && e && e.uuid) _first.uuid = e.uuid;
        if (!_first.canonical_code && e && e.canonical_code) _first.canonical_code = e.canonical_code;
      }
      continue;
    }
    _rcSeenKey.add(_k);
    if (_u) _rcSeenUuid.add(_u);
    _rcOut.push(e);
  }

  output.output.entities = _rcOut;
  // diagnostics: emitted ONLY when non-zero, so they are drop-when-absent in the replay norm()
  // (LESSONS §40) instead of diffing on every golden turn.
  if (_rcDropped.length) output.output.carried_attachment_evicted = _rcDropped;
  if (_rcDupes > 0)      output.output.entities_deduped = _rcDupes;
}
"""

# ── HUNK 3 — hoist the axis maps + add B2' part 1 entries ──────────────────────
HUNK_AXIS = r"""// ── AXIS MAP (hoisted for B2': the op executor AND the post-merge reconciliation pass below must
// classify entities with ONE definition, and the pass needs it at module scope) ──
// axis depends on DOMAIN: in promotion, product/brand/category/flyer all scope "which promotion"
const AXIS_BY_DOMAIN = {
  promotion: {
    brand: 'promo_scope', category: 'promo_scope', promotion: 'promo_scope',
    flyer: 'promo_scope', product: 'promo_scope',   // ← product joins promo_scope HERE
  },
  master_products: {
    product: 'product_scope', category: 'product_scope', brand: 'product_scope',
  },
  order: {
    order: 'order_scope', order_number: 'order_scope', customer_order: 'order_scope',
    customer: 'order_scope', transporter: 'order_scope', product: 'order_scope',
  },
  incoming: {
    product: 'incoming_scope', inbound_shipment: 'incoming_scope',
    category: 'incoming_scope', brand: 'incoming_scope',
  },
  product_attachment: {
    product: 'product_scope', category: 'product_scope', brand: 'product_scope',
    attachment_type: 'attachment_scope',   // type is its own axis (coexists with product)
    certificate:     'attachment_scope',   // B2' part 1: was `__certificate` -> never evicted (exec 11509873)
    attachment:      'attachment_scope',   // B2' part 1: same class, same hazard
  },
  // …
};

// fallback flat map for hints/domains not covered
const HINT_AXIS_DEFAULT = {
  brand: 'promo_scope', category: 'promo_scope', promotion: 'promo_scope', flyer: 'promo_scope',
  product: 'product_scope', attachment_type: 'attachment_scope',
  certificate: 'attachment_scope', attachment: 'attachment_scope',   // B2' part 1
  customer: 'order_scope', transporter: 'order_scope', order: 'order_scope', order_number: 'order_scope', customer_order: 'order_scope',
  warehouse: 'location', goods_receive: 'doc', spo: 'doc', form: 'doc',
};

const _ceAxisFor = (e, domain) => {
  const hint = String((e && e.hint) || '').toLowerCase();
  const domainMap = AXIS_BY_DOMAIN[domain];
  return (domainMap && domainMap[hint]) || HINT_AXIS_DEFAULT[hint] || `__${hint}`;
};

// ── ENTITY OPERATION EXECUTOR (op + axis-aware replace/combine) ──
if (output.output && !output.output.is_menu_label) {
    const domain = output.output.domain_hint;
    const axisOf = (e) => _ceAxisFor(e, domain);"""

# ── HUNK 2 — record dym picks as this-turn provenance ─────────────────────────
HUNK_PICK = r"""  _ceDymPickedKeys.add(_ceKey(_picked));   // B2' part 3: a did-you-mean pick IS a this-turn choice"""

# ── HUNK 1 — provenance helpers ───────────────────────────────────────────────
HUNK_HELPERS = r"""
// ── B2' (carried-certificate-dump) — CARRIED-ENTITY PROVENANCE (plan §3.6 part 3) ─────────────
// "Carried" is derived from PROVENANCE, never from `current_message`. That flag is a proven-corrupted
// signal: applyDymPick re-maps EVERY prior entity to `current_message: true` before the executor runs,
// and block (B) does it again for prior attachment_types (plan §5.1, writers W4 + W7 — observed on
// parser exec 11509876, where all seven carried entities arrived flagged true). The uncorrupted
// this-turn signal is `_parser_raw_snapshot` above: the frozen raw LLM object, captured before any
// mutation. An entity is CARRIED iff it was in prior state and the LLM did not emit it this turn.
const _ceNorm = (v) => String(v ?? '').trim().toLowerCase();
const _ceKey  = (e) => _ceNorm(e && e.hint) + '|' + _ceNorm((e && (e.canonical_code || e.raw)) || '');
const _cePriorKeys = new Set(
  (Array.isArray(parent_input.previous_conversation_state?.entities)
    ? parent_input.previous_conversation_state.entities : []).map(_ceKey));
const _ceLlmKeys = new Set(
  (Array.isArray(_parser_raw_snapshot?.entities) ? _parser_raw_snapshot.entities : []).map(_ceKey));
// Codes minted by applyDymPick THIS TURN are genuine this-turn choices (the customer picked them), so
// they are recorded rather than inferred — a picked code that happens to collide with a prior entity
// key must still count as a contribution. Local variable only: no new output key, no replay-diff noise.
const _ceDymPickedKeys = new Set();
const _ceIsCarried = (e) => {
  if (!e) return false;
  if (e.ordinal !== undefined) return false;      // reference-position pick = this-turn selection
  const _k = _ceKey(e);
  if (_ceDymPickedKeys.has(_k)) return false;     // did-you-mean pick = this-turn selection
  return _cePriorKeys.has(_k) && !_ceLlmKeys.has(_k);
};
"""

# ══ immortal-hint-class hunks — C1 / C2 / M2 (plans/immortal-hint-class-plan.md) ══
# String-anchored, applied AFTER the B2' pass, so B2''s line shifts cannot break them.
# Each entry: (id, exact-search, replacement). Order is irrelevant — the anchors are disjoint.

C_HUNKS = []

# ── C1a — the axis fallback. `__${hint}` minted a PRIVATE axis nothing could collide with,
#          so the entity was immortal by construction. Two-step fallback instead.
C_HUNKS.append(("C1a", r"""const _ceAxisFor = (e, domain) => {
  const hint = String((e && e.hint) || '').toLowerCase();
  const domainMap = AXIS_BY_DOMAIN[domain];
  return (domainMap && domainMap[hint]) || HINT_AXIS_DEFAULT[hint] || `__${hint}`;
};""", r"""// ── C1 (immortal-hint-class) — AN UNRECOGNISED HINT MUST NEVER GET A PRIVATE AXIS ─────────────
// `__${hint}` produced an island no current-turn entity could ever collide with, so the executor's
// `keptPrior = prior.filter(e => !currentAxes.has(axisOf(e)))` retained it on EVERY subsequent turn.
// Observed: ('M2399','product_attachment',ordinal:1) surviving six consecutive turns (parser exec
// 11554793) — a DOMAIN name in the entity hint field, minted by the reference-positions block (C2
// fixes the writer; this fixes the class). Same mechanism as the `__certificate` bug B2' fixed BY
// NAME; the class stayed open because the fallback itself was never changed.
//
// Two-step fallback:
//   1. the domain's SUBJECT axis — an unrecognised hint under domain D is, in every observed case,
//      the subject of D's own query (a domain-named hint minted by the reference-positions block is
//      literally that), so it belongs on D's primary axis and evicts normally;
//   2. ONE shared axis for anything left — unknown hints collide with each other rather than each
//      getting an island. Never `__${hint}`.
// Rejected: a single shared 'misc' axis with no domain step — inert on the exact transcript that
// motivated the fix (nothing else that turn carried an unrecognised hint), i.e. "test green, stay
// broken". Rejected: dropping/throwing on an unknown hint — this family is fail-open by contract.
const DOMAIN_SUBJECT_AXIS = {
  product_attachment: 'product_scope', master_products: 'product_scope',
  inventory: 'product_scope', resource_attachment: 'product_scope',
  incoming: 'incoming_scope', promotion: 'promo_scope',
  order: 'order_scope', spo_allocation: 'order_scope',
  goods_receive: 'doc', forms: 'doc', portal_link: 'doc',
};
// Diagnostic so the RESIDUAL unrecognised class is MEASURABLE in production instead of assumed
// empty. Emitted only when non-empty ⇒ drop-when-absent in the replay norm() (LESSONS §40).
const _ceUnknownHints = new Set();
const _ceAxisFor = (e, domain) => {
  const hint = String((e && e.hint) || '').toLowerCase();
  const domainMap = AXIS_BY_DOMAIN[domain];
  const known = (domainMap && domainMap[hint]) || HINT_AXIS_DEFAULT[hint];
  if (known) return known;
  if (hint) _ceUnknownHints.add(hint);
  return DOMAIN_SUBJECT_AXIS[domain] || 'unscoped_scope';
};"""))

# ── C1b — two explicitly known-missing hints. Belt and braces: they should never have been
#          reaching the fallback at all.
C_HUNKS.append(("C1b", r"""  warehouse: 'location', goods_receive: 'doc', spo: 'doc', form: 'doc',
};""", r"""  warehouse: 'location', goods_receive: 'doc', spo: 'doc', form: 'doc',
  inbound_shipment: 'incoming_scope',   // C1: mapped under `incoming` only; fell to __ elsewhere
  grn:              'doc',              // C1: sibling of goods_receive/spo, was unmapped
};"""))

# ── M2a — record reference-position picks minted THIS TURN, mirroring B2''s own reviewed
#          `_ceDymPickedKeys` pattern.
C_HUNKS.append(("M2a", r"""const _ceDymPickedKeys = new Set();""",
r"""const _ceDymPickedKeys = new Set();
// M2 (immortal-hint-class §2.4) — the SAME record-don't-infer pattern for REFERENCE POSITIONS.
// B2' tested the persisted field `e.ordinal`, which is written once and then lives in session state
// forever, so a positional-pick entity was exempt from eviction for the rest of the session — the
// exact failure shape part 3 was designed to defeat, arriving by a different route. Populated by the
// reference-positions block below, which runs BEFORE the reconciliation pass that reads it.
const _ceRefPickedKeys = new Set();"""))

# ── M2b — the exemption becomes THIS-TURN-ONLY. Strict tightening: nothing that was evictable
#          becomes exempt.
C_HUNKS.append(("M2b", r"""  if (e.ordinal !== undefined) return false;      // reference-position pick = this-turn selection""",
r"""  if (_ceRefPickedKeys.has(_ceKey(e))) return false;   // M2: reference-position pick MINTED THIS TURN"""))

# ── C2a — the narrow hint guard. Declared inside the reference-positions block: it is applied at
#          this ONE writer only, never as a repo-wide validator (that is filed separately, D2).
C_HUNKS.append(("C2a", r"""  const HINT_MAP = {
    promotion: 'promotion', product: 'product', order: 'order',
    order_number: 'order', customer: 'customer', form: 'form',
  };""", r"""  const HINT_MAP = {
    promotion: 'promotion', product: 'product', order: 'order',
    order_number: 'order', customer: 'customer', form: 'form',
  };

  // ── C2 (immortal-hint-class) — NEVER STAMP A DOMAIN NAME INTO AN ENTITY HINT ────────────────
  // `hint = output.output.domain_hint || 'promotion'` fired whenever the frozen row's label had no
  // "<type>: " prefix — which is EVERY bare product-code title, i.e. every product_attachment /
  // inventory / master_products / incoming result. HINT_MAP covers only 6 hints, so every other
  // domain's result set minted a domain-named hint on any positional pick. The hint field is
  // enum-validated NOWHERE repo-wide, and reconcileEntities only corrects a bad hint when the token
  // RESOLVES — so bad hints are permanent on exactly the unresolved population did-you-mean is
  // built from. Prefer signals that already exist and are already correct:
  //   1. the resolver's authoritative entity_type, persisted on the frozen row
  //      (compile-current-state `entity_type: it.entity_type || null`) — null for render-envelope
  //      answer items, which is exactly when (2) carries the decision;
  //   2. the DOMAIN's SUBJECT entity hint — an entity hint, never a domain name.
  // The legacy `|| 'promotion'` tail is DROPPED, not preserved: it is itself an instance of this
  // same defect (a pick on an unknown domain became a *promotion* entity). Every real promotion
  // turn keeps its hint byte-identical via DOMAIN_SUBJECT_HINT.promotion.
  const DOMAIN_SUBJECT_HINT = {
    product_attachment: 'product', master_products: 'product', inventory: 'product',
    incoming: 'product', resource_attachment: 'attachment', portal_link: 'form',
    goods_receive: 'goods_receive', spo_allocation: 'spo', forms: 'form',
    order: 'order', promotion: 'promotion',
  };
  const KNOWN_ENTITY_HINTS = new Set([
    'product','promotion','customer','transporter','inbound_shipment','warehouse','attachment',
    'form','order','category','brand','attachment_type','certificate','flyer','order_number',
    'customer_order','goods_receive','spo','grn','forms',
  ]);
  const _c2Hint = (candidate, domain) => {
    const h = String(candidate ?? '').trim().toLowerCase();
    if (h && KNOWN_ENTITY_HINTS.has(h)) return h;
    return DOMAIN_SUBJECT_HINT[domain] || 'product';
  };"""))

# ── C2b + M2c — both writer sites, and the this-turn provenance record.
C_HUNKS.append(("C2b", r"""    const sep = row.label.indexOf(': ');
    let hint, raw;
    if (sep !== -1) {
      const before = row.label.slice(0, sep).trim().toLowerCase();
      raw  = row.label.slice(sep + 2).trim();
      hint = HINT_MAP[before] || before || output.output.domain_hint || 'promotion';
    } else {
      raw  = row.label.trim();
      hint = output.output.domain_hint || 'promotion';
    }
    // carry uuid/code straight from the frozen row so it needn't re-resolve
    resolved.push({ raw, hint, ordinal: pos, current_message: true,
                    uuid: row.uuid || null, canonical_code: row.product || raw });""",
r"""    const sep = row.label.indexOf(': ');
    let hint, raw;
    if (sep !== -1) {
      const before = row.label.slice(0, sep).trim().toLowerCase();
      raw  = row.label.slice(sep + 2).trim();
      hint = _c2Hint(HINT_MAP[before] || before || row.entity_type, output.output.domain_hint);   // C2
    } else {
      raw  = row.label.trim();
      hint = _c2Hint(row.entity_type, output.output.domain_hint);                                 // C2
    }
    // carry uuid/code straight from the frozen row so it needn't re-resolve
    resolved.push({ raw, hint, ordinal: pos, current_message: true,
                    uuid: row.uuid || null, canonical_code: row.product || raw });
    // M2: this pick was minted THIS TURN — record it, never infer it from the persisted `ordinal`.
    // Key shape must match _ceKey exactly (hint | canonical_code||raw), computed from the SAME
    // values pushed above, or the reconciliation pass will not recognise the entity it just saw.
    _ceRefPickedKeys.add(_ceKey({ hint, canonical_code: row.product || raw, raw }));"""))

# ── C1c — emit the residual-class diagnostic. Placed immediately after the B2' reconciliation
#          pass, which is the LAST caller of _ceAxisFor (the executor is the other, and runs
#          earlier), so the set is complete here.
C_HUNKS.append(("C1c", r"""  if (_rcDropped.length) output.output.carried_attachment_evicted = _rcDropped;
  if (_rcDupes > 0)      output.output.entities_deduped = _rcDupes;
}""", r"""  if (_rcDropped.length) output.output.carried_attachment_evicted = _rcDropped;
  if (_rcDupes > 0)      output.output.entities_deduped = _rcDupes;
}

// C1 residual-class diagnostic. Every hint that reached the two-step fallback this turn, so the
// "no orthogonal unrecognised hint exists" premise is MEASURABLE on real traffic instead of
// assumed. Sorted for determinism; emitted only when non-empty (LESSONS §40 drop-when-absent).
//
// 🔴 F3 (tester pass 2, exec 11645628) — THE DIAGNOSTIC WAS BLIND WHERE IT MATTERED MOST.
// _ceUnknownHints is populated as a side effect of _ceAxisFor, and the contribution loop above
// short-circuits on `if (_ceIsCarried(e)) continue;` BEFORE classifying. On a reuse turn the
// executor takes `finalEntities = prior` and never calls axisOf at all. So a DORMANT carried
// entity — precisely the immortal population this diagnostic exists to measure — was never
// counted: exec 11645628 carried the unrecognised `M2399` in state for the whole turn and emitted
// no diagnostic. Exactly inverted from plan §2.1's intent.
//
// Fixed by classifying the FINAL entity set explicitly. This is DIAGNOSTIC-ONLY and cannot change
// behaviour: every eviction decision was already taken above, and _ceAxisFor is pure apart from
// this Set. Placement note: blocklist-apply runs after this and may still drop an entity, so a
// blocklisted hint is counted as "seen this turn" — correct for a measurement of what reached the
// fallback, and deliberately NOT moved later to keep the change surface at one block.
if (output.output && !output.output.is_menu_label && Array.isArray(output.output.entities)) {
  for (const e of output.output.entities) _ceAxisFor(e, output.output.domain_hint);
}
if (output.output && !output.output.is_menu_label && _ceUnknownHints.size) {
  output.output.unknown_entity_hints = [..._ceUnknownHints].sort();
}"""))


# ── apply bottom-up ───────────────────────────────────────────────────────────
if C_ONLY:
    # --c-only: source ALREADY carries B2' (the fork @ 95193323). Apply the C hunks alone, so the
    # fork's build is C1+C2+M2 and nothing else — the stale-vs-live `resource_attachment` delta is
    # left untouched and DECLARED, never ridden in as an undeclared collateral change (LESSONS §51).
    body = "\n".join(L)
else:
    new = list(L)
    new[A_BLOCK - 1:A_BLOCK - 1] = HUNK_RECONCILE.strip("\n").split("\n") + [""]
    new[A_EXEC0 - 1:A_EXEC1] = HUNK_AXIS.split("\n")
    new[A_PICK:A_PICK] = HUNK_PICK.split("\n")
    new[A_SNAP:A_SNAP] = HUNK_HELPERS.strip("\n").split("\n")
    body = "\n".join(new)

if WITH_C:
    for hid, find, repl in C_HUNKS:
        n = body.count(find)
        if n != 1:
            raise SystemExit("HUNK %s: search string occurs %d times, want exactly 1 "
                             "(a 0 here would silently produce an UNPATCHED body)" % (hid, n))
        prev = body
        body = body.replace(find, repl, 1)
        if body == prev:
            raise SystemExit("HUNK %s: body unchanged after substitution" % hid)
    print("applied C hunks:", ", ".join(h[0] for h in C_HUNKS))

# LESSONS §58b — no trailing whitespace anywhere we author
body = "\n".join(ln.rstrip() for ln in body.split("\n"))
out.write_text(body)
print("wrote", out, len(body), "chars sha", hashlib.sha256(body.encode()).hexdigest()[:12])
