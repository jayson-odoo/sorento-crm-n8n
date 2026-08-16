# Promotion node-diff — `dym-single-use-fix` + `datemiss-summary` (BUNDLED)  (LIVE ← promote target)

Generated 2026-07-22. Target = current LIVE node code + ONLY these two changes hunks (foreign deltas EXCLUDED).
SPINE `9qVyfUxmRQqrpGRMDLRuz` @ active `b71f56fd` (3 nodes) · PARSER `XTODTw-dJcV0uRdC056hG` @ active `06388c41` (1 node). Both draft==active.

## Change A — `dym-single-use-fix`: build-suggest-offer(E1) + compile-current-state(E2) + output_exchange(E3, parser).
## Change B — `datemiss-summary`: not-found-error-message exports resolved-entity bullets; build-suggest-offer date arm prepends them.

⚠️ **Staleness catches (both handled by building target = LIVE+hunks, never clone/fork verbatim):**
- parser fork `wI5RkNGW3EOJfBdo` carries a `_parser_raw` (state-transition-monitor) delta NOT on live — EXCLUDED from E3.
- clone `not-found-error-message` is STALE vs live (live has extra `_ORDER_TYPES`/order-status labeling the clone lacks) — datemiss hunks applied to the LIVE version, preserving that logic.

## SPINE node `build-suggest-offer`
```diff
@@ -22,6 +22,15 @@
 // (or later match) a dym entry keyed on a date the bot itself invited ("reply with a date").
 const isDateLike   = (s) => { const v = String(s ?? '').trim(); return /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(v) || /^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(v); };
 const isCodeShaped = (s) => { const v = String(s ?? '').trim(); return v.length > 0 && /[a-z0-9]/i.test(v) && !isDateLike(v); };
+// dym-single-use-fix: wrap a candidate list in an offer object carrying identity + lifecycle.
+//   id     = this spine execution id (turn-unique) → stamped onto the picked entity as dym_slot,
+//            giving output_exchange a STABLE handle that survives raw-overwrite across repeated picks.
+//   domain = the reformulator domain_hint at build time → drives the domain-switch supersede rule.
+//   ttl/picked seed the lifecycle that compile-current-state advances each turn.
+// candidates[] shape is UNCHANGED from the shipped map. Returns null for an empty set (no offer).
+const _mkOffer = (cands) => (Array.isArray(cands) && cands.length)
+  ? { id: String($execution.id), domain: (q && q.domain_hint) || null, ttl: 3, candidates: cands, picked: [] }
+  : null;
 
 // ── D3: incoming sibling-family picker (empty-exact incoming miss) — PHASE 1 ──
 // Fires ONLY when sibling-gate routed the not-found through family-fetch →
@@ -194,6 +203,7 @@
         for_raw: d1.token, for_hint: p.m.entity_type || (_srcEnt && _srcEnt.hint) || null,
         for_canonical: (_srcEnt && _srcEnt.canonical_code) || null,
       }));
+      out.dym_offer = _mkOffer(out.dym_candidates);   // dym-single-use-fix
     } else {
       // Code mode: all candidates have real product codes — BYTE-IDENTICAL to pre-fix.
       const codes = picks.map(p => p.m.canonical_code);
@@ -212,6 +222,7 @@
         for_raw: d1.token, for_hint: p.m.entity_type || (_srcEnt && _srcEnt.hint) || null,
         for_canonical: (_srcEnt && _srcEnt.canonical_code) || null,
       }));
+      out.dym_offer = _mkOffer(out.dym_candidates);   // dym-single-use-fix
     }
     return out;
   }
@@ -264,8 +275,12 @@
       ? q.entities.find(e => String(e.hint || '').toLowerCase() === 'customer') : null;
     const cust = custEnt ? custEnt.raw : 'This customer';
     const near = picks.map(a => a.display || a.value).join('; ');
+    // datemiss-summary: lead with WHAT we resolved (customer + product bullets from
+    // not-found-error-message) so a date-relaxation offer still confirms the entities it matched on.
+    const _summary = (out.found_summary && String(out.found_summary).trim())
+      ? `Here's what you want:\n${String(out.found_summary).trim()}\n\n` : '';
     text =
-      `No delivery on ${asked}. ${cust} has delivery on ${near}. ` +
+      `${_summary}No delivery on ${asked}. ${cust} has delivery on ${near}. ` +
       `Reply with a date to continue, or would you like me to escalate to ${team} team?`;
   } else {
     text =
@@ -298,6 +313,7 @@
         for_canonical: (compat[0] && (compat[0].code || compat[0].canonical_code)) || null,
       }))
       .filter(c => isCodeShaped(c.code));
+    out.dym_offer = _mkOffer(out.dym_candidates);   // dym-single-use-fix
   }
   return out;
 }
@@ -332,6 +348,7 @@
       for_canonical: (compat[0] && (compat[0].code || compat[0].canonical_code)) || null,
     }))
     .filter(c => isCodeShaped(c.code));
+  out.dym_offer = _mkOffer(out.dym_candidates);   // dym-single-use-fix
 }
 return out;
 
```

## SPINE node `compile-current-state`
```diff
@@ -214,7 +214,40 @@
     if (wantsCatalogue) {
       userResponse += "\n\nTip: looking for a specific detail like material or finish? Search the *product code* inside the catalogue and you'll find all its attributes there 👍";
     }
+  }
+})();
+
+// ── dym-single-use-fix: did-you-mean offer LIFECYCLE (supersede / retain / expire) ──
+// Replaces the single-turn dym_candidates erasure with an explicit offer that survives repeated
+// picks but is bounded by domain-switch / escalation / answer / TTL. First matching rule wins;
+// EVERY non-retaining branch writes null explicitly — never reliance on key absence (§3c).
+const _newOffer = (_sug && _sug.dym_offer && Array.isArray(_sug.dym_offer.candidates) && _sug.dym_offer.candidates.length)
+  ? _sug.dym_offer : null;
+const _prevOffer = (() => {
+  try {
+    const s = $('get-session-vars').first().json;
+    const v = (s && s.session_vars && s.session_vars.variables) || (s && s.variables) || null;
+    return (v && v.dym_offer && typeof v.dym_offer === 'object') ? v.dym_offer : null;
+  } catch (e) { return null; }
+})();
+const _pickApplied = qf.dym_pick_applied === true;
+// a human owns the thread once escalation is confirmed OR a specific member was resolved this turn
+const _escalated = !!(qf.escalation && (qf.escalation.is_escalation_confirmation === true || qf.escalation.preferred_assignee_id));
+const _answered = Array.isArray(last_result_set) && last_result_set.length > 0;
+const _dymOffer = (() => {
+  if (_newOffer) return { ..._newOffer, ttl: 3, picked: [] };                    // 1. fresh offer → REPLACE
+  if (!_prevOffer) return null;                                                  //    nothing to carry
+  // 2. domain switch — reads the POST-carry domain_hint (null never kills: a bare-code pick emits null)
+  if (qf.domain_hint && _prevOffer.domain && qf.domain_hint !== _prevOffer.domain) return null;
+  if (_escalated) return null;                                                   // 3. escalation committed → DIE
+  if (_pickApplied) {                                                            // 4. pick applied → RETAIN (T3 fix)
+    const _picked = Array.isArray(_prevOffer.picked) ? _prevOffer.picked.slice() : [];
+    if (qf.dym_offer_pick_code && !_picked.includes(qf.dym_offer_pick_code)) _picked.push(qf.dym_offer_pick_code);
+    return { ..._prevOffer, ttl: 3, picked: _picked };
   }
+  if (_answered) return null;                                                    // 5. answered, no pick → DIE
+  if (!(Number(_prevOffer.ttl) > 1)) return null;                               // 6. TTL exhausted (ttl-1<=0)
+  return { ..._prevOffer, ttl: Number(_prevOffer.ttl) - 1 };                     // 7. otherwise RETAIN, decrement
 })();
 
 output = {
@@ -236,10 +269,11 @@
     "date_mode": qf.date_mode,
     "match_mode": qf.match_mode,
     "contains_flyer": qf.contains_flyer,
-    // dym-candidate-map: persist the did-you-mean candidate→source-token map when an offer was
-    // built (survives the _merge/member_offer case since _sug is still set); ALWAYS write [] when no
-    // offer → clears after exactly one consumption (variables is rebuilt whole each turn).
-    "dym_candidates": (_sug && Array.isArray(_sug.dym_candidates)) ? _sug.dym_candidates : [],
+    // dym-single-use-fix: persist the lifecycle-managed offer (null clears it — see §3c above).
+    // dym_candidates is a READ-ONLY LEGACY MIRROR of the offer's candidates, kept only for the
+    // spine↔parser promotion window so an OLD parser can still pick; delete it once both are live.
+    "dym_offer": _dymOffer,
+    "dym_candidates": (_dymOffer && Array.isArray(_dymOffer.candidates)) ? _dymOffer.candidates : [],
     // Ideation pointer (Rev-3.1): on an ideate turn, persist the endpoint's returned
     // pointer; on any other turn carry the prior one forward so a CRM question
     // mid-collection does not wipe an open draft. Reads 'get-session-vars' (the CRM
```

## SPINE node `not-found-error-message`
```diff
@@ -34,6 +34,9 @@
 let escalate_message;
 const _statusLabel = (q.domain_hint === 'order' && q.order_status === 'outstanding') ? 'outstanding ' : (q.domain_hint === 'order' && q.order_status === 'delivered') ? 'delivered ' : '';
 let is_clarification = false;
+// datemiss-summary: expose the resolved-entity bullets (• customer: … / • product: …) so
+// build-suggest-offer can show them on the date-relaxation offer too, not just escalate_message.
+let _found_summary = '';
 
 if (missingAttachmentType) {
   const subject = Array.isArray(q?.entities) ? q.entities.find(e => e.hint === 'product') : null;
@@ -138,6 +141,7 @@
     const extra = codes.length > 1 ? ` (+${codes.length - 1} more)` : '';
     _foundLines.push(`• ${et}: ${codes[0]}${extra}`);
   }
+  _found_summary = _foundLines.join('\n');   // datemiss-summary: reused by build-suggest-offer
   // tokens the user gave that resolved to NOTHING (exclude those that resolved via fallback tiers)
   const _notFoundRaw = unresolved.filter(t => !_resolvedToks.has(normRaw(t)));
   const _useBreakdown = _foundLines.length > 0;
@@ -238,5 +242,6 @@
 const out = $input.first().json;
 out.escalate_message = escalate_message;
 out.is_clarification = is_clarification;
+out.found_summary = _found_summary;   // datemiss-summary: resolved-entity bullets for the date arm
 return out;
 
```

## PARSER node `output_exchange`  (fork-only `_parser_raw` EXCLUDED)
```diff
@@ -150,7 +150,11 @@
 // and IGNORE the LLM's scope_exclusive + (mis-)hint. Keyed on the EXPLICIT map, never on string/prefix.
 (function tryDymPick(){
   const _prev = parent_input.previous_conversation_state || {};
-  const _cands = Array.isArray(_prev.dym_candidates) ? _prev.dym_candidates : [];
+  // dym-single-use-fix: source candidates from the offer object; fall back to the legacy flat array
+  // during the spine↔parser promotion window (an OLD spine writes only dym_candidates).
+  const _offer = (_prev.dym_offer && typeof _prev.dym_offer === 'object') ? _prev.dym_offer : null;
+  const _cands = (_offer && Array.isArray(_offer.candidates)) ? _offer.candidates
+               : (Array.isArray(_prev.dym_candidates) ? _prev.dym_candidates : []);
   if (!_cands.length || !output.output) return;
   const norm = s => String(s ?? '').trim().toLowerCase();
   // FINDING-1 FIX (belt-and-suspenders): a dym pick must be an ENTITY-CODE, never a DATE. Even if a
@@ -162,19 +166,31 @@
   const _curEnts = Array.isArray(output.output.entities) ? output.output.entities.filter(e=>e&&e.current_message===true) : [];
   const _codeMatches = c => !_isDateLike(c.code) && (norm(c.code) === _msg
       || _curEnts.some(e => norm(e.raw)===norm(c.code) || norm(e.canonical_code)===norm(c.code)));
+  // NOTE: picked[] is a RECORD, not a filter — re-picking the same code is idempotent, so we do NOT
+  // skip codes already in _offer.picked. That is what makes a SECOND pick from the same offer work.
   const _hit = _cands.find(_codeMatches);
   if (!_hit) return;                          // code not in the map → fall through to today's behaviour
 
   const _prior = Array.isArray(_prev.entities) ? _prev.entities.map(e=>({ ...e })) : [];
-  // find WHICH prior entity this suggestion was FOR (for_raw primary; for_canonical / for_hint fallback)
-  let _idx = _prior.findIndex(e => norm(e.raw) === norm(_hit.for_raw));
+  // dym-single-use-fix: the offer id, stamped onto the picked entity, is a STABLE handle back to the
+  // offer. The first pick overwrites the source entity's raw with the picked code, destroying the
+  // for_raw linkage; the slot id survives every subsequent pick.
+  const _slot = (_offer && _offer.id != null) ? _offer.id : null;
+  // find WHICH prior entity this suggestion was FOR — tier 0: the stamped dym_slot (survives raw
+  // overwrite), then for_raw / for_canonical / unambiguous single-for_hint (all destroyed by pick 1).
+  let _idx = -1;
+  if (_slot != null) _idx = _prior.findIndex(e => e && e.dym_slot != null && norm(e.dym_slot) === norm(_slot));
+  if (_idx < 0) _idx = _prior.findIndex(e => norm(e.raw) === norm(_hit.for_raw));
   if (_idx < 0 && _hit.for_canonical) _idx = _prior.findIndex(e => norm(e.canonical_code) === norm(_hit.for_canonical));
   if (_idx < 0 && _hit.for_hint) {
     const _sameHint = _prior.filter(e => norm(e.hint) === norm(_hit.for_hint));
     if (_sameHint.length === 1) _idx = _prior.indexOf(_sameHint[0]);   // unambiguous single-hint fallback
   }
-  const _picked = { raw: _hit.code, hint: _hit.for_hint || _hit.entity_type || (_idx>=0 ? _prior[_idx].hint : null),
+  // FORCE the type from the candidate record — entity_type is the PICKED candidate's resolved type;
+  // for_hint describes the SOURCE token and only coincidentally matches. Never trust the LLM hint here.
+  const _picked = { raw: _hit.code, hint: _hit.entity_type || _hit.for_hint || (_idx>=0 ? _prior[_idx].hint : null),
                     canonical_code: _hit.code, uuid: _hit.uuid || null, current_message: true };
+  if (_slot != null) _picked.dym_slot = _slot;   // stamp so tier-0 resolves the NEXT pick
   let _final;
   if (_idx >= 0) { _prior[_idx] = _picked; _final = _prior.map(e=>({ ...e, current_message: true })); }
   else { _final = [ _picked, ..._prior.map(e=>({ ...e, current_message: true })) ]; output.output.dym_replace_unmatched = true; }
@@ -192,6 +208,8 @@
     if (_prev.date_mode)         output.output.date_mode         = _prev.date_mode;
   }
   output.output.dym_pick_applied = true;       // diagnostic + precedence guard (see §4)
+  // let the spine append to picked[] + reset the TTL without re-deriving anything (§3c rule 4)
+  output.output.dym_offer_pick_code = _hit.code;
 })();
 
 // ── REVISION 4: intent-only effective domain signal (de-overfit) ──
```
