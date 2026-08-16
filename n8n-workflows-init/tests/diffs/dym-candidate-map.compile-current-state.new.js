let output = {};
const qf = $('Call \'sub-query-reformulator\'').first().json.output;
const contact = $('sorento-sub-respond-findcontact-respond').first().json;
let response;
let includeResponse = true;
let isEscalateBranch = true;
let quickReply;
let manualResponse = false
// ── unified escalate catalog (replaces the 7-arm isExecuted ladder) ──
// One catalog Code node resolves response + behavior flags per branch_kind.
// Escalate branches converge on 'escalate-catalog'; the happy path stays central-exchange.
const _cat = (() => {
  try { return $('escalate-catalog').isExecuted ? $('escalate-catalog').first().json : null; }
  catch (e) { return null; }
})();
// Δ3: CS member-offer override — when build-cs-member-offer ran, its numbered-list message
// + member roster (cs_last_result_set) + selection_context take priority over the catalog.
const _mem = (() => {
  try { return $('build-cs-member-offer').isExecuted ? $('build-cs-member-offer').first().json : null; }
  catch (e) { return null; }
})();
// suggest-on-miss override (D1/D2) — highest priority. When build-suggest-offer built a
// suggestion offer (resolver "did you mean" candidates / data-miss alternatives), its
// message + quick_reply + candidate roster win over the catalog AND the member offer.
const _sug = (() => {
  try {
    const nf = $('build-suggest-offer').isExecuted ? $('build-suggest-offer').first().json : null;
    return (nf && nf.suggest_offer === true) ? nf : null;
  } catch (e) { return null; }
})();
// Δ4: date-suggest AND CS member roster both present → show BOTH.
// Date suggestion keeps its quick-reply buttons; the member picker is appended as
// numbers/names. A numeric/name reply resolves to a member (selection_context =
// member_offer below); tapping a date re-queries; 'yes' → round-robin.
const _merge = !!(_sug && _mem);
if (_merge) {
  const _picker = (Array.isArray(_mem.cs_last_result_set) ? _mem.cs_last_result_set : [])
    .map(m => `${m.idx}. ${m.label}`).join('\n');
  response = `${_sug.suggest_response}\n\nTo escalate, choose who to route to — reply the number or name:\n${_picker}\n\nOr just reply 'yes' and we'll assign automatically.`;
  manualResponse  = true;
  includeResponse = true;
  isEscalateBranch = true;
} else if (_sug) {
  response        = _sug.suggest_response;
  manualResponse  = true;
  includeResponse = true;
  isEscalateBranch = true;
} else if (_mem) {
  response        = _mem.response;
  manualResponse  = _mem.manualResponse;
  includeResponse = _mem.includeResponse;
  isEscalateBranch = true;
} else if (_cat) {
  response        = _cat.response;
  manualResponse  = _cat.manualResponse;
  includeResponse = _cat.includeResponse;
  isEscalateBranch = true;
} else if ($('central-exchange').isExecuted) {
  response = $('central-exchange').first().json.response; isEscalateBranch = false;
}
if ($('access-level-choice-message').isExecuted) {
  quickReply = $('access-level-choice-message').first().json.quick_reply.length > 0 ? $('access-level-choice-message').first().json.quick_reply: null
}
// suggest-on-miss quick replies (codes/dates + Yes,escalate + No,it's okay), comma-joined
if (_sug) { quickReply = _sug.suggest_quick_reply; }

function getResultObj() {
  try { if ($('central-exchange').isExecuted) return $('central-exchange').first().json; } catch (e) {}
  try { if ($('validator').isExecuted)        return $('validator').first().json; }        catch (e) {}
  try { if ($('disallowed-entity-gate').isExecuted)        return $('disallowed-entity-gate').first().json; }        catch (e) {}
  return $input.first().json || {};
}

let userResponse;
if (includeResponse) {
  userResponse = response;   
} // escalate/clarification → short, pass through as-is
let last_result_set = [];

if (true) {
  const resultObj = getResultObj();

  // envelope shape: items[]; tolerate legacy answers[] and gate compatible_entities[]
  let items = Array.isArray(resultObj.items) ? resultObj.items
              : Array.isArray(resultObj.answers) ? resultObj.answers
              : Array.isArray(resultObj.compatible_entities) ? resultObj.compatible_entities
              : [];
  const domain = qf.domain_hint || 'result';
  const offeredEscalation = /would you like me to escalate/i.test(userResponse);
  if (resultObj.require_specific === true && Array.isArray(resultObj.compatible_entities)) {
    items = items.filter(e => String(e.entity_type).toLowerCase() === 'product');
  }
  if (qf.message_type == "business_query" && !manualResponse) {
    if (items.length === 0 ) {
      response = `Previous turn (${domain}): no results.`;
    } else {
      const fieldVal = (it, labelWanted) => {
        const f = (it.fields || []).find(x =>
          String(x.label || '').toLowerCase() === labelWanted.toLowerCase());
        return f ? f.value : null;
      };
    
      const indexed = items.map((it, i) => {
        const firstField = (it.fields || [])[0];
        // label priority covers BOTH shapes:
        //   envelope item → title / fields
        //   compatible_entity → code / canonical_code / product_name
        const label =
          it.title ||
          it.code ||                              // ← gate compatible_entities
          it.canonical_code ||                    // ← raw resolver match, if used
          it.display?.product_name ||             // ← raw resolver match
          fieldVal(it, 'Form Name') ||
          fieldVal(it, 'Promotion Name') ||
          fieldVal(it, 'Product') ||
          (firstField ? firstField.value : null) ||
          `item ${i + 1}`;
    
        return {
          idx: i + 1,
          uuid: it.uuid || it.id || null,
          label: String(label).replace(/\*/g, '').trim(),
          entity_type: it.entity_type || null,
          product: fieldVal(it, 'Product') || it.product || it.code || null,
          attachment_type: it.attachmentType || it.attachment_type || null,
          filename: it.filename || null,
        };
      });
    
      const what = indexed[0].attachment_type || 'records';
      response = `Previous turn (${domain}): returned ${items.length} ${what}`;
      last_result_set = indexed;
    }
  }
}

// ── reconcile parser hints with resolver's authoritative entity_type ──
// The resolver checked against real data; its entity_type wins over the parser's hint.
function reconcileEntities(parserEntities, resolverJson) {
  if (!Array.isArray(parserEntities)) return parserEntities || [];

  const resolutions  = Array.isArray(resolverJson?.resolutions)  ? resolverJson.resolutions  : [];
  const intersection = Array.isArray(resolverJson?.intersection) ? resolverJson.intersection : [];

  // normalize: a lookup from a raw value → resolved match
  // OR-mode: match pe.raw to the resolution token, take its first match
  // AND-mode: match pe.raw to a match's canonical_code / product_name
  const norm = s => String(s || '').toLowerCase().trim();

  return parserEntities.map(pe => {
    const raw = norm(pe.raw);
    let match = null;

    // OR-mode: by token
    const res = resolutions.find(r => norm(r.token || r.query) === raw);
    if (res?.matches?.length) match = res.matches[0];

    // AND-mode (or OR-mode that didn't token-match): by the record's own value
    if (!match && intersection.length) {
      match = intersection.find(m =>
        norm(m.canonical_code) === raw ||
        norm(m.display?.product_name) === raw
      ) || null;
    }

    if (match?.entity_type) {
      return { ...pe, hint: match.entity_type, canonical_code: match.canonical_code };
    }
    return pe;   // unresolved → keep parser's guess
  });
}

const resolverJson = (() => {
  try { return $('resolve-entity').first().json; } catch (e) { return {}; }
})();
const reconciledEntities = reconcileEntities(qf.entities, resolverJson);

// Δ3: member-offer roster becomes the persisted last_result_set so a round-2 position pick
// resolves to a member; selection_context flags the next turn as a member-pick context.
if (_merge) { last_result_set = Array.isArray(_mem.cs_last_result_set) ? _mem.cs_last_result_set : []; }
else if (_sug) { last_result_set = Array.isArray(_sug.suggest_last_result_set) ? _sug.suggest_last_result_set : []; }
else if (_mem) { last_result_set = Array.isArray(_mem.cs_last_result_set) ? _mem.cs_last_result_set : []; }
const _isDisambig = (() => { try { const r = getResultObj(); return !!(r && r.require_specific === true && Array.isArray(r.compatible_entities) && r.compatible_entities.length > 0); } catch (e) { return false; } })();
const selection_context = _merge ? 'member_offer' : (_sug ? 'suggest_offer' : (_mem ? (_mem.selection_context || null) : (_isDisambig ? 'disambiguation' : null)));

// ── friendly domain disclaimers (append to user-facing text on the happy path only) ──
// master_products answered → nudge toward the catalogue for attributes not shown.
// resource_attachment catalogue answered → tip to search by product code for attributes.
(() => {
  const dh = qf.domain_hint;
  const answered = !isEscalateBranch
    && includeResponse
    && typeof userResponse === 'string'
    && userResponse.trim().length > 0
    && Array.isArray(last_result_set)
    && last_result_set.length > 0;
  if (!answered) return;
  if (dh === 'master_products') {
    userResponse += "\n\nP/S: if the spec you're after isn't shown above, just ask me for the *product catalogue* and I'll pull it up for you 😊";
  } else if (dh === 'resource_attachment') {
    const ents = Array.isArray(reconciledEntities) ? reconciledEntities : (qf.entities || []);
    const wantsCatalogue = ents.some(e => /catalog|katalog/i.test(String((e && e.raw) || '')));
    if (wantsCatalogue) {
      userResponse += "\n\nTip: looking for a specific detail like material or finish? Search the *product code* inside the catalogue and you'll find all its attributes there 👍";
    }
  }
})();

output = {
  "variables": {
    "message_type": qf.message_type,
    "intent_hint": qf.intent_hint,
    "domain_hint": qf.domain_hint,
    "user_goal": qf.user_goal,
    "query_scope": qf.query_scope,
    "access_levels": qf.access_levels,
    "entities": reconciledEntities,
    "routing": qf.routing,
    "escalation": qf.escalation,
    "response": response,                 // now the COMPRESSED view (parser-facing)
    "last_result_set": last_result_set,
    "selection_context": selection_context,
    "date_filter_start": qf.date_filter_start,
    "date_filter_end": qf.date_filter_end,
    "date_mode": qf.date_mode,
    "match_mode": qf.match_mode,
    "contains_flyer": qf.contains_flyer,
    // dym-candidate-map: persist the did-you-mean candidate→source-token map when an offer was
    // built (survives the _merge/member_offer case since _sug is still set); ALWAYS write [] when no
    // offer → clears after exactly one consumption (variables is rebuilt whole each turn).
    "dym_candidates": (_sug && Array.isArray(_sug.dym_candidates)) ? _sug.dym_candidates : []
  },
  "user_response": userResponse,
  "quick_reply": quickReply
};
return output;
