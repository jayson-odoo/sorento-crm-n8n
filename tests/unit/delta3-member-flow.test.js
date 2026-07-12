#!/usr/bin/env node
/* Δ3 member-escalation flow — pure logic (v2, post-sim fixes).
 * buildOffer: roster -> numbered offer (+ excludes null respond_user_id).
 * extractPositions: robust position parse from a reply (bare "1", ordinals, "option 3", multi),
 *   ignoring incidental numbers inside sentences (e.g. product code SR-1234 on an abandon).
 * resolvePick: single valid -> target; multi/out-of-range -> reprompt; yes -> round-robin; no -> decline.
 * Keep byte-identical to the deployed build-cs-member-offer node + output_exchange member-block.
 */

function buildOffer(members, catalogResponse) {
  members = (Array.isArray(members) ? members : []).filter(m => m && m.user_id && m.respond_user_id);
  if (members.length === 0) return { response: catalogResponse, last_result_set: [], selection_context: null, member_offer: false };
  const numbered = members.map((m, i) => `${i + 1}. ${m.name}`).join('\n');
  const response =
    `Would you like me to escalate to customer_service team?\n\n` +
    `Please choose who to route to (reply with the number):\n${numbered}\n\n` +
    `If you have no preference, just reply 'yes' and we'll assign automatically.`;
  const last_result_set = members.map((m, i) => ({ idx: i + 1, label: m.name, uuid: m.user_id, respond_user_id: m.respond_user_id }));
  return { response, last_result_set, selection_context: 'member_offer', member_offer: true };
}

const ORD = { first:1, second:2, third:3, fourth:4, fifth:5, sixth:6, '1st':1, '2nd':2, '3rd':3, '4th':4, '5th':5, '6th':6 };
function extractPositions(msg, llmPositions) {
  if (Array.isArray(llmPositions) && llmPositions.length) return [...new Set(llmPositions.map(Number).filter(n => !isNaN(n)))];
  const t = String(msg || '').trim().toLowerCase();
  const cand = [];
  if (/^#?\s*\d+$/.test(t)) cand.push(parseInt(t.replace(/\D/g, ''), 10));         // "1", "#2"
  for (const w in ORD) if (new RegExp('\\b' + w + '\\b').test(t)) cand.push(ORD[w]); // "first", "2nd"
  const opt = t.match(/\b(?:option|number|no\.?|choice)\s*#?\s*(\d+)/g);             // "option 3"
  if (opt) opt.forEach(m => cand.push(parseInt(m.replace(/\D/g, ''), 10)));
  if (cand.length === 0 && t.split(/\s+/).filter(Boolean).length <= 4)              // short reply "2 and 3"
    (t.match(/\d+/g) || []).forEach(n => cand.push(Number(n)));
  return [...new Set(cand)].filter(n => !isNaN(n));
}

function resolvePick(out, prev) {
  const res = { escalation: { is_escalation_confirmation: false }, handled: false };
  if (prev.selection_context !== 'member_offer') return res;
  res.handled = true;
  const lastSet = Array.isArray(prev.last_result_set) ? prev.last_result_set : [];
  const maxIdx = lastSet.length;
  const positions = extractPositions(out.raw_message, out.reference_positions);
  if (positions.length === 1 && positions[0] >= 1 && positions[0] <= maxIdx) {
    res.escalation = { is_escalation_confirmation: true, preferred_assignee_id: lastSet.find(r => Number(r.idx) === positions[0]).uuid };
  } else if (positions.length > 1) {
    res.reprompt = 'multi'; res.escalation = { is_escalation_confirmation: false };
  } else if (positions.length === 1) {
    res.reprompt = 'out_of_range'; res.escalation = { is_escalation_confirmation: false };
  } else if (out.is_affirmative === true) {
    res.escalation = { is_escalation_confirmation: true };
  } else if (out.is_affirmative === false) {
    res.escalation = { is_escalation_confirmation: false }; res.clear = true; res.message_type = 'casual';
  } else { res.abandoned = true; }
  return res;
}

const MEMBERS = [
  { user_id: 'u-emily', name: 'Emily', respond_user_id: 'r-emily' },
  { user_id: 'u-sandy', name: 'Sandy', respond_user_id: 'r-sandy' },
  { user_id: 'u-john', name: 'John', respond_user_id: 'r-john' },
];
const PREV = { selection_context: 'member_offer', last_result_set: buildOffer(MEMBERS, 'X').last_result_set };
let fails = 0;
const check = (name, cond, got) => { if (!cond) { fails++; console.error(`✗ ${name}: ${JSON.stringify(got)}`); } else console.log(`✓ ${name}`); };

// offer
const offer = buildOffer(MEMBERS, 'generic');
check('offer numbered + hints', /1\. Emily/.test(offer.response) && /reply with the number/.test(offer.response) && /just reply 'yes'/.test(offer.response), offer.response);
check('offer excludes null respond_user_id', (() => { const o = buildOffer([{ user_id:'a', name:'Has', respond_user_id:'r' }, { user_id:'b', name:'Null', respond_user_id:null }], 'g'); return o.last_result_set.length === 1 && !/Null/.test(o.response); })(), null);

// extractPositions
check('extract bare "1"', JSON.stringify(extractPositions('1', [])) === '[1]', extractPositions('1', []));
check('extract "first one please"', JSON.stringify(extractPositions('first one please', [])) === '[1]', extractPositions('first one please', []));
check('extract "the 2nd"', JSON.stringify(extractPositions('the 2nd', [])) === '[2]', extractPositions('the 2nd', []));
check('extract "option 3"', JSON.stringify(extractPositions('option 3', [])) === '[3]', extractPositions('option 3', []));
check('extract "2nd and 3rd" -> multi', JSON.stringify(extractPositions('2nd and 3rd', [])) === '[2,3]', extractPositions('2nd and 3rd', []));
check('extract "5"', JSON.stringify(extractPositions('5', [])) === '[5]', extractPositions('5', []));
check('ignore incidental number in sentence (abandon)', extractPositions('actually what is the price of SR-1234', []).length === 0, extractPositions('actually what is the price of SR-1234', []));
check('trust LLM reference_positions', JSON.stringify(extractPositions('whatever', [2])) === '[2]', extractPositions('whatever', [2]));

// resolvePick
check('pick "1" -> Emily targeted (THE FAIL FIX)', (() => { const r = resolvePick({ raw_message:'1', reference_positions:[] }, PREV); return r.escalation.preferred_assignee_id === 'u-emily'; })(), resolvePick({ raw_message:'1', reference_positions:[] }, PREV));
check('pick "the 2nd" -> Sandy', resolvePick({ raw_message:'the 2nd', reference_positions:[] }, PREV).escalation.preferred_assignee_id === 'u-sandy', null);
check('multi "2nd and 3rd" -> reprompt, no confirm', (() => { const r = resolvePick({ raw_message:'2nd and 3rd', reference_positions:[] }, PREV); return r.reprompt === 'multi' && r.escalation.is_escalation_confirmation === false; })(), resolvePick({ raw_message:'2nd and 3rd', reference_positions:[] }, PREV));
check('out-of-range "5" -> reprompt', (() => { const r = resolvePick({ raw_message:'5', reference_positions:[] }, PREV); return r.reprompt === 'out_of_range' && r.escalation.is_escalation_confirmation === false; })(), resolvePick({ raw_message:'5', reference_positions:[] }, PREV));
check('bare yes -> round-robin', (() => { const r = resolvePick({ raw_message:'yes', is_affirmative:true, reference_positions:[] }, PREV); return r.escalation.is_escalation_confirmation === true && !('preferred_assignee_id' in r.escalation); })(), null);
check('no -> decline + clear', (() => { const r = resolvePick({ raw_message:'no thanks', is_affirmative:false, reference_positions:[] }, PREV); return r.escalation.is_escalation_confirmation === false && r.clear === true; })(), null);
check('abandon (new question) -> abandoned', (() => { const r = resolvePick({ raw_message:'actually what is the price of SR-1234', reference_positions:[] }, PREV); return r.abandoned === true && r.escalation.is_escalation_confirmation === false; })(), null);
check('not in member context -> untouched', resolvePick({ raw_message:'2', reference_positions:[2] }, { selection_context: null }).handled === false, null);

console.log(fails === 0 ? '\nGREEN — Δ3 v2 (bare-number + multi/OOR reprompt) correct' : `\nRED — ${fails} fail(s)`);
process.exit(fails === 0 ? 0 : 1);
