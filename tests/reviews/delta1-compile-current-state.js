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
if (_cat) {
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
    "date_filter_start": qf.date_filter_start,
    "date_filter_end": qf.date_filter_end,
    "date_mode": qf.date_mode,
    "match_mode": qf.match_mode,
    "contains_flyer": qf.contains_flyer
  },
  "user_response": userResponse,
  "quick_reply": quickReply
};
return output;

