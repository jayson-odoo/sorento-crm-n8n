// Relay the ideation turn result (real http in prod, mock in clone via ideate-turn)
// into the shared compile->send->save path. Reuse (Rev-3.1): n8n stays the central
// session_vars writer; hand compile the returned ideation pointer to persist.
const r = $('ideate-turn').first().json || {};
let response = r.reply_text || '';
// The REAL endpoint already embeds the deep link inside reply_text on complete
// ("Track it here: <link>"); appending r.link unconditionally rendered it twice.
// Only append when the reply doesn't already carry it (the mock doesn't).
if (r.status === 'complete' && r.link && !response.includes(r.link)) response += `\n\n${r.link}`;
// SHAPE TOLERANCE: the mock returns the n8n-native nested blob
// ({ session_vars: { variables: { ideation } } }), but the REAL turn endpoint keys
// `ideation` at the TOP level of session_vars (ideation_turn_service reads/writes
// session_vars['ideation'] flat). Reading only the nested path silently yielded null
// against the real endpoint, so the pointer never persisted. Accept BOTH.
const sv = r.session_vars || {};
const ideation = (sv.ideation !== undefined ? sv.ideation : ((sv.variables && sv.variables.ideation) || null)) || null;
return [{ json: { response, manualResponse: true, includeResponse: true, ideation, ideate_status: r.status || 'error' } }];
