#!/usr/bin/env node
/* Δ1 characterization test — proves the new escalate-catalog emits the SAME
 * {response, manualResponse, includeResponse} as the OLD 7-arm ladder, for every branch.
 *
 * OLD side = the literal escalate_message strings + flag logic extracted verbatim from the
 * live/clone Edit Fields nodes + compile-current-state ladder (the behavior we must preserve).
 * NEW side = the escalate-catalog switch (kept byte-identical to catalog.js / the deployed node).
 * Any divergence (typo, dropped flag) fails the test before it can reach the clone.
 */

const SAMPLE = { user_goal: 'looking for product info', suggested_team: 'warehouse' };

// ── sample upstream node outputs (dynamic-ref branches) ──
function ctx(overrides = {}) {
  return {
    qf: { user_goal: SAMPLE.user_goal, routing: { suggested_team: SAMPLE.suggested_team } },
    notFound: { escalate_message: 'Could not find incoming for SR-1234. Would you like me to escalate to warehouse team?', require_specific: false, is_clarification: false },
    accessChoice: { escalate_message: "Please specify which access level you'd like to use for stock:" },
    ...overrides,
  };
}

// ════════════════════════ OLD ladder (verbatim from current nodes) ════════════════════════
// Mirrors compile-current-state lines 9-38 + the Edit Fields literal strings.
function oldLadder(kind, c) {
  let response, includeResponse = true, isEscalateBranch = true, manualResponse = false;
  switch (kind) {
    case 'not_found': // Edit Fields1 = $('not-found-error-message').escalate_message
      response = c.notFound.escalate_message;
      if (!c.notFound.require_specific) manualResponse = true;
      break;
    case 'access_choice': // Edit Fields3 = $('access-level-choice-message').escalate_message
      response = c.accessChoice.escalate_message; manualResponse = true; break;
    case 'demand_qty': // Edit Fields4
      response = 'Please specify your demand quantity'; manualResponse = true; break;
    case 'not_supported': // Edit Fields5
      response = "Sorry, we don't support direct goods receive & SPO at the moment. You may ask about incoming stock for a specific product or container"; manualResponse = true; break;
    case 'clarify_menu': // Edit Fields6
      response = `I see you're ${c.qf.user_goal}, Let me understand more.\n\nAre you asking about any of these?\n\n- Product (List Price, Dimension)\n- Photos, Technical Specs, Cert\n- Promotion\n- Forms\n- Stock\n- Delivery order\n- Incoming\n- Catalogue, Warranty\n\nI can help with the topics listed above.`; manualResponse = true; break;
    case 'escalate_offer': // Edit Fields7
      response = `I am sorry the provided answer does not meet your requirements. Would you like me to escalate to ${c.qf.routing.suggested_team} team?`; manualResponse = true; break;
    case 'out_of_scope': // Edit Fields8
      response = `Informed the user that request is out of scope and will proceed to escalate to the ${c.qf.routing.suggested_team} team`; manualResponse = true; includeResponse = false; break;
  }
  return { response, manualResponse, includeResponse, isEscalateBranch };
}

// ════════════════════════ NEW catalog (keep identical to catalog.js node body) ════════════════════════
function catalog(kind, c) {
  const qf = c.qf;
  let response = '', manualResponse = false, includeResponse = true, is_escalate_offer = false;
  switch (kind) {
    case 'not_found': {
      const nf = c.notFound;
      response = nf.escalate_message;
      manualResponse = !nf.require_specific;
      is_escalate_offer = !nf.is_clarification;
      break;
    }
    case 'access_choice':
      response = c.accessChoice.escalate_message; manualResponse = true; break;
    case 'demand_qty':
      response = 'Please specify your demand quantity'; manualResponse = true; break;
    case 'not_supported':
      response = "Sorry, we don't support direct goods receive & SPO at the moment. You may ask about incoming stock for a specific product or container"; manualResponse = true; break;
    case 'clarify_menu':
      response = `I see you're ${qf.user_goal}, Let me understand more.\n\nAre you asking about any of these?\n\n- Product (List Price, Dimension)\n- Photos, Technical Specs, Cert\n- Promotion\n- Forms\n- Stock\n- Delivery order\n- Incoming\n- Catalogue, Warranty\n\nI can help with the topics listed above.`; manualResponse = true; break;
    case 'escalate_offer':
      response = `I am sorry the provided answer does not meet your requirements. Would you like me to escalate to ${qf.routing.suggested_team} team?`; manualResponse = true; is_escalate_offer = true; break;
    case 'out_of_scope':
      response = `Informed the user that request is out of scope and will proceed to escalate to the ${qf.routing.suggested_team} team`; manualResponse = true; includeResponse = false; break;
  }
  return { response, manualResponse, includeResponse, is_escalate_offer };
}

// ════════════════════════ assertions ════════════════════════
const KINDS = ['not_found', 'access_choice', 'demand_qty', 'not_supported', 'clarify_menu', 'escalate_offer', 'out_of_scope'];
const EXPECT_OFFER = { not_found: true, access_choice: false, demand_qty: false, not_supported: false, clarify_menu: false, escalate_offer: true, out_of_scope: false };

let fails = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

for (const kind of KINDS) {
  const c = ctx();
  const o = oldLadder(kind, c);
  const n = catalog(kind, c);
  const flagsMatch = eq(
    { response: o.response, manualResponse: o.manualResponse, includeResponse: o.includeResponse },
    { response: n.response, manualResponse: n.manualResponse, includeResponse: n.includeResponse },
  );
  const offerMatch = n.is_escalate_offer === EXPECT_OFFER[kind];
  if (!flagsMatch) {
    fails++; console.error(`✗ ${kind}: ladder/catalog mismatch`);
    console.error('   old:', JSON.stringify(o)); console.error('   new:', JSON.stringify(n));
  } else if (!offerMatch) {
    fails++; console.error(`✗ ${kind}: is_escalate_offer ${n.is_escalate_offer} != expected ${EXPECT_OFFER[kind]}`);
  } else {
    console.log(`✓ ${kind}`);
  }
}

// not_found require_specific variant: manualResponse must flip to false, is_escalate_offer follows is_clarification
{
  const c = ctx({ notFound: { escalate_message: 'X', require_specific: true, is_clarification: true } });
  const o = oldLadder('not_found', c), n = catalog('not_found', c);
  const ok = o.manualResponse === false && n.manualResponse === false && n.is_escalate_offer === false;
  if (!ok) { fails++; console.error('✗ not_found(require_specific): expected manualResponse=false, is_escalate_offer=false; got', JSON.stringify(n)); }
  else console.log('✓ not_found(require_specific variant)');
}

console.log(fails === 0 ? '\nGREEN — catalog == old ladder for all branches' : `\nRED — ${fails} mismatch(es)`);
process.exit(fails === 0 ? 0 : 1);
