#!/usr/bin/env node
// Offline probe for S4/S5 (promo-picker). Real node body, fixture captured verbatim from
// live exec 11827379 ("promotion for bathroom furniture" -> 15 promotions, 15 attachments).
//
//   node probe.js              -> GREEN
//   node probe.js <mutant.js>  -> used by mutate.sh
//
// BLIND SPOT: asserts the producer node's returned object. The customer-boundary check
// (sendmsg payload on a real run) is separate and is the one that counts.
const fs = require('fs'), path = require('path'), vm = require('vm');
// path.resolve, NOT path.join: join(__dirname, '/tmp/x') mangles an absolute mutant path
// into __dirname/tmp/x, the read throws, and EVERY mutant reads as "caught" — mutate.sh was
// vacuous for as long as that held (found 2026-08-11, tier-ask build).
const body = fs.readFileSync(path.resolve(__dirname, process.argv[2] || 'promo-picker.js'), 'utf8');
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures.json'), 'utf8'));

let GATE = {};
function run({ answers, attachments, qf, gate, wrap, shape }) {
  GATE = gate || {};
  const j = JSON.parse(JSON.stringify(FX.validator));
  // Deep-copy overrides too. S4b sorts by SPLICING `answers`/`attachments` in place — they alias
  // env.answers/env.attachments, which is what makes the sort visible downstream without renaming
  // anything. Passing a caller's array straight through would let the node permute the test's own
  // expectation arrays underneath it, and two assertions duly "failed" against a node that was
  // right. Copy at the boundary so a fixture is a fixture.
  if (answers !== undefined) j.answers = JSON.parse(JSON.stringify(answers));
  if (attachments !== undefined) j.attachments = JSON.parse(JSON.stringify(attachments));
  const parser = Object.assign(JSON.parse(JSON.stringify(FX.qf)), qf || {});
  const $ = (n) => {
    if (n === "Call 'sub-query-reformulator'") return { first: () => ({ json: { output: parser } }), isExecuted: true };
    if (n === 'disallowed-entity-gate') return { first: () => ({ json: { access_notice: (arguments[0] && 0) || GATE.access_notice || '' } }), isExecuted: true };
    throw new Error('no stub for ' + n);
  };
  let item = j;
  if (wrap) item = { output: j };                 // the central-exchange-style wrapped envelope
  if (shape === 'unknown') item = { attachments: (attachments !== undefined ? attachments : FX.validator.attachments) };
  const ctx = vm.createContext({ $, $input: { first: () => ({ json: item }) }, console, JSON, Object, Array, Set, Map, String, Number, Boolean });
  const r = vm.runInContext(`(function(){${body}\n})()`, ctx);
  return (r && typeof r.output === 'object' && r.output !== null) ? Object.assign({}, r.output, { _promo_pick: r._promo_pick, _promo_picker: r._promo_picker, _promo_picker_shape: r._promo_picker_shape, _promo_pick_label_miss: r._promo_pick_label_miss, _promo_sort: r._promo_sort }) : r;
}
const A = FX.validator.answers, T = FX.validator.attachments;
// Expected order, derived here with an INDEPENDENT implementation of the S4b rule (latest end
// date first, then latest start date, then original position). If the node's sort and this one
// ever disagree, these assertions fail — which is the point. `SA`/`ST` are the answers and their
// index-paired attachments AS THE CUSTOMER NOW SEES THEM, so every positional expectation below
// is written in customer positions rather than CRM positions.
const _fv = (a, l) => ((a.fields || []).find(f => String(f.label).toLowerCase() === l) || {}).value || null;
const _dk = (a, l) => { const v = _fv(a, l); return /^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? v : null; };
const ORDER = A.map((_, i) => i).sort((x, y) => {
  const ex = _dk(A[x], 'end date'), ey = _dk(A[y], 'end date');
  if (ex !== ey) { if (ex === null) return 1; if (ey === null) return -1; return ex > ey ? -1 : 1; }
  const sx = _dk(A[x], 'start date'), sy = _dk(A[y], 'start date');
  if (sx !== sy) { if (sx === null) return 1; if (sy === null) return -1; return sx > sy ? -1 : 1; }
  return x - y;
});
const SA = ORDER.map(i => A[i]), ST = ORDER.map(i => T[i]);
const checks = [];
const ck = (id, d, p, x) => checks.push({ id, d, p, x });

// S4 — many promotions: list, no files
{
  const o = run({});
  // D5 (access-tier-ask-plan, 2026-08-11): the S4 list-gate is REMOVED — answers ALWAYS
  // attach. The tier ask upstream now bounds the count; the roster stays for follow-ups.
  ck('S4-1', '15 promotions -> ALL 15 files attached (D5 always-attach)', o.attachments.length === 15, `len=${o.attachments.length}`);
  ck('S4-2', 'roster has one row per promotion', (o.suggest_last_result_set || []).length === 15, `len=${(o.suggest_last_result_set || []).length}`);
  ck('S4-3', "selection_context = 'suggest_offer'", o.suggest_selection_context === 'suggest_offer', String(o.suggest_selection_context));
  ck('S4-4', 'roster labels are BARE (no leading numbering)', (o.suggest_last_result_set || []).every(r => !/^\s*\d+\s*[.)]/.test(r.label)), 'a label starts with a number');
  ck('S4-5', 'roster idx is 1-based and contiguous', (o.suggest_last_result_set || []).every((r, i) => r.idx === i + 1), 'idx mismatch');
  ck('S4-6', 'intro says the files are attached (D5), never the pick invite', /I have attached the file\(s\) below/.test(o.response_intro || '') && !/reply with the number you want/i.test(o.response_intro || ''), o.response_intro);
  ck('S4-7', 'answers preserved for rendering (description + period)', o.answers.length === 15, `len=${o.answers.length}`);
  // the customer reads `response`, not answers[] — the node must own it
  ck('S4-8', 'response claims the files are attached (D5 — they are)', /attached the file/i.test(o.response || ''), (o.response||'').split('\n')[0]);
  ck('S4-9', 'response still lists all 15 (numbering intact)', /^15\./m.test(o.response || ''), 'no line 15.');
  // CONTRACT CHANGE (S4b): the LLM body is in CRM order, so a REORDERED list must rebuild it.
  // Reusing it would show the customer one order while the roster addresses another.
  ck('S4-10','reordered list rebuilds the body instead of reusing the LLM rendering',
     o._promo_picker.intro_swapped === false && o._promo_picker.rebuilt === true, JSON.stringify(o._promo_picker));
  // scope echo — the intro must say what the list is FOR, using the customer's own words
  ck('S4-11','intro names the scope the customer typed', /for bathroom furniture\./.test(o.response_intro || ''), o.response_intro);
  ck('S4-12','the swapped `response` carries the same intro', /for bathroom furniture\./.test((o.response || '').split('\n\n')[0]), (o.response || '').split('\n\n')[0]);
}
// S4b — order: latest END DATE first, and the file pairing survives the permutation
{
  const o = run({});
  const endOf = (a) => (a.fields.find(f => f.label.toLowerCase() === 'end date') || {}).value;
  const startOf = (a) => (a.fields.find(f => f.label.toLowerCase() === 'start date') || {}).value;
  const ends = o.answers.map(endOf);
  ck('S4b-1', 'end dates are non-increasing down the list',
     ends.every((e, i) => i === 0 || ends[i - 1] >= e), JSON.stringify(ends));
  ck('S4b-2', 'the latest-ending promotion is row 1', ends[0] === '2026-11-06', String(ends[0]));
  ck('S4b-3', 'the earliest-ending is last', ends[ends.length - 1] === '2026-08-31', String(ends[ends.length - 1]));
  ck('S4b-4', 'equal end dates fall back to start date descending',
     (() => { const g = o.answers.filter(a => endOf(a) === '2026-09-18'); return g.every(a => startOf(a) === '2026-06-18'); })(), 'tiebreak');
  ck('S4b-5', 'no row is lost or duplicated', o.answers.length === 15 && new Set(o.answers.map(a => a.fields[0].value)).size === 15, `len=${o.answers.length}`);
  // THE hazard: attachments are index-paired with answers. If the permutation is applied to one
  // and not the other, every pick sends a file belonging to a different promotion.
  ck('S4b-6', 'roster row N still carries row N\'s own file',
     (o.suggest_last_result_set || []).every(r => {
       const want = r.label.replace(/[()]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
       const got = String(r.filename || '').replace(/[()]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
       return got && want.slice(0, 40) === got.slice(0, 40);
     }), JSON.stringify((o.suggest_last_result_set || []).slice(0, 2)));
  ck('S4b-7', 'the rendered body is REBUILT in sorted order, not the LLM\'s stale one',
     /^1\. \*Promotion:\* SORENTO UPDATED BATHROOM FURNITURE PROMO_06082026 DEALER/m.test(o.response || ''),
     (o.response || '').split('\n\n')[1]);
  ck('S4b-8', 'the freshness stamp survives the rebuild',
     /_Data last updated:/.test(o.response || ''), (o.response || '').slice(-60));
  ck('S4b-9', 'the rebuild is recorded', o._promo_picker.rebuilt === true, JSON.stringify(o._promo_picker));
}
{
  // a pick must land on the SORTED row, not the CRM's original position
  const o = run({ qf: { reference_positions: [1] } });
  ck('S4b-10', 'pick "1" returns the latest-ending promotion',
     o.attachments.length === 1 && /PROMO_06082026/.test(o.attachments[0].filename), JSON.stringify(o.attachments.map(a => a.filename)));
}
{
  // rows with no parseable end date must sink, never float to the top on an empty-string compare
  const A2 = JSON.parse(JSON.stringify(FX.validator.answers));
  A2[3].fields = A2[3].fields.filter(f => f.label.toLowerCase() !== 'end date');
  const o = run({ answers: A2 });
  const lastLabel = o.answers[o.answers.length - 1].fields[0].value;
  ck('S4b-11', 'a row with no end date sorts LAST',
     lastLabel === A2[3].fields[0].value, `last=${lastLabel}`);
}
{
  // start-date tiebreak DISCRIMINATOR (P7): the real fixture's equal-end-date group shares one
  // start date, so nothing in it can catch a dropped tiebreak — build the case from real rows.
  const A3 = JSON.parse(JSON.stringify(FX.validator.answers)).slice(0, 3);
  const setF = (a, l, v) => { a.fields.find(f => f.label.toLowerCase() === l).value = v; };
  A3.forEach(a => setF(a, 'end date', '2026-12-31'));
  setF(A3[0], 'start date', '2026-01-01'); setF(A3[1], 'start date', '2026-06-01'); setF(A3[2], 'start date', '2026-03-01');
  const o = run({ answers: A3, attachments: FX.validator.attachments.slice(0, 3) });
  const starts = o.answers.map(a => (a.fields.find(f => f.label.toLowerCase() === 'start date') || {}).value);
  ck('S4b-13', 'equal end dates fall back to LATEST start date first',
     starts.join('|') === '2026-06-01|2026-03-01|2026-01-01', starts.join('|'));
}
{
  // if the arrays are not index-pairable, reorder answers but do NOT scramble the files
  const o = run({ attachments: FX.validator.attachments.slice(0, 3) });
  ck('S4b-12', 'unpairable attachments are left alone and the mismatch is recorded',
     o._promo_sort.pairable === false, JSON.stringify(o._promo_sort && { p: o._promo_sort.pairable, r: o._promo_sort.reordered }));
}

// scope echo — bounds. Each of these is a way the echo could mislead rather than help.
{
  // a promotion-NAME scope is filename-length: drop the echo rather than print a truncated name
  const long = 'CABANA NEW ARRIVAL BATHROOM FURNITURE PROMO CBFAL5572_18062026 (END USER).pdf';
  const o = run({ qf: { entities: [{ raw: long, hint: 'promotion', current_message: true, confident: true }] } });
  ck('SE-1', 'an over-long scope is dropped, not truncated', /^I found 15 promotions\. /.test(o.response_intro || ''), o.response_intro);
  ck('SE-2', 'and no fragment of it leaks into the intro', !/CBFAL5572/.test(o.response_intro || ''), o.response_intro);
}
{
  const o = run({ qf: { entities: [] } });
  ck('SE-3', 'no scope entity -> the plain intro, no dangling "for"',
     /^I found 15 promotions\. I have attached/.test(o.response_intro || ''), o.response_intro);
}
{
  const o = run({ qf: { entities: [
    { raw: 'SRTKS6047', hint: 'product', current_message: true, confident: true },
    { raw: 'SRTKS6047', hint: 'promotion', current_message: true, confident: true },
    { raw: 'kitchen sink', hint: 'category', current_message: true, confident: true }] } });
  ck('SE-4', 'duplicate raws are echoed once', (o.response_intro.match(/SRTKS6047/g) || []).length === 1, o.response_intro);
  ck('SE-5', 'multiple distinct scopes are all named', /for SRTKS6047, kitchen sink\./.test(o.response_intro || ''), o.response_intro);
}
{
  // the echo must be the customer's words, never a canonical code they never typed
  const o = run({ qf: { entities: [{ raw: '6047', hint: 'promotion', canonical_code: 'SRTKS6047-NEW', current_message: true, confident: true }] } });
  ck('SE-6', 'echoes the typed token, not the canonical code', /for 6047\./.test(o.response_intro || '') && !/SRTKS6047-NEW/.test(o.response_intro || ''), o.response_intro);
}
// D2 — exactly one promotion: untouched, file still sent
{
  const o = run({ answers: A.slice(0, 1), attachments: T.slice(0, 1) });
  ck('D2-1', '1 promotion -> file still attached', o.attachments.length === 1, `len=${o.attachments.length}`);
  ck('D2-2', '1 promotion -> no roster built', !o.suggest_last_result_set, 'roster present');
}
// zero promotions: untouched
{
  const o = run({ answers: [], attachments: [] });
  ck('Z-1', '0 promotions -> no roster, no picker intro', !o.suggest_last_result_set && !o._promo_picker, 'picker fired on empty');
}
// non-promotion domain: untouched
{
  const o = run({ qf: { domain_hint: 'inventory' } });
  ck('X-1', 'non-promotion domain untouched', o.attachments.length === 15 && !o.suggest_last_result_set, 'picker fired off-domain');
}
// S5 — pick
{
  const o = run({ qf: { reference_positions: [1, 2] } });
  ck('S5-1', 'pick 1+2 -> exactly 2 answers', o.answers.length === 2, `len=${o.answers.length}`);
  ck('S5-2', 'pick 1+2 -> exactly 2 files', o.attachments.length === 2, `len=${o.attachments.length}`);
  ck('S5-3', 'the RIGHT files, matched by name', o.attachments.map(a => a.filename).join('|') === [ST[0].filename, ST[1].filename].join('|'), o.attachments.map(a => a.filename).join('|'));
  ck('S5-4', 'pick turn publishes the FULL roster (repeat picks keep working)',
     (o.suggest_last_result_set || []).length === 15, `len=${(o.suggest_last_result_set||[]).length}`);
  ck('S5-4d','roster rows still address the ORIGINAL list order',
     (o.suggest_last_result_set||[])[2] && (o.suggest_last_result_set)[2].label === SA[2].title,
     JSON.stringify((o.suggest_last_result_set||[])[2]));
  ck('S5-4b','response lists ONLY the 2 picked', !/^3\./m.test(o.response || '') && /^2\./m.test(o.response || ''), (o.response||'').slice(0,160));
  ck('S5-4c','response names the right promotions',
     (o.response||'').includes(SA[0].title) && (o.response||'').includes(SA[1].title) && !(o.response||'').includes(SA[2].title),
     (o.response||'').slice(0,200));
}
{
  const o = run({ qf: { reference_positions: [3] } });
  ck('S5-5', 'single pick -> 1 file, the third AS DISPLAYED', o.attachments.length === 1 && o.attachments[0].filename === ST[2].filename, o.attachments.map(a => a.filename).join('|'));
}
{ // "all"
  const o = run({ qf: { reference_positions: A.map((_, i) => i + 1) } });
  ck('S5-6', '"all" -> every file', o.attachments.length === 15, `len=${o.attachments.length}`);
}
{ // out of range
  const o = run({ qf: { reference_positions: [99] } });
  ck('S5-7', 'out-of-range pick sends NO file', o.attachments.length === 0, `len=${o.attachments.length}`);
  ck('S5-8', 'out-of-range is recorded, not silently dropped', (o._promo_pick || {}).out_of_range?.length === 1, JSON.stringify(o._promo_pick));
  ck('S5-8b','out-of-range says so, not "no file attached"',
     /only 15 promotions/.test(o.response || '') && !/No file is attached/.test(o.response || ''), o.response);
}
{ // picked promotion with no attachment (Q5)
  const o = run({ attachments: [], qf: { reference_positions: [1] } });
  ck('Q5-1', 'picked promo with no file -> details as text, not silence', o.answers.length === 1 && /details/i.test(o.response_intro || ''), o.response_intro);
}
{ // punctuation-stripped titles (the REAL shape: 7 of 15 rows on exec 11827379)
  const o = run({ qf: { reference_positions: [8, 12, 15] } });
  ck('S5-9', 'punctuation-differing titles still resolve to a file', o.attachments.length === 3, `len=${o.attachments.length}`);
  ck('S5-10', 'and to the RIGHT files (index contract)',
     o.attachments.map(a => a.filename).join('|') === [ST[7].filename, ST[11].filename, ST[14].filename].join('|'),
     o.attachments.map(a => a.filename).join('|'));
}
{ // genuinely shuffled attachments -> name lookup rescues it and RECORDS the drift
  // swap the two attachments that S4b puts at DISPLAYED positions 1 and 2, so the pairing is
  // genuinely broken where the pick looks.
  const shuffled = T.slice();
  const [i0, i1] = [ORDER[0], ORDER[1]];
  [shuffled[i0], shuffled[i1]] = [shuffled[i1], shuffled[i0]];
  const o = run({ attachments: shuffled, qf: { reference_positions: [1] } });
  ck('S5-11', 'shuffled attachments resolved by name, drift recorded',
     o.attachments[0].filename === ST[0].filename && (o._promo_pick.drift || []).length === 1,
     JSON.stringify(o._promo_pick));
}
{ // already-narrowed lane: parser resolved the pick to PROMOTION entities
  const o = run({ answers: A.slice(2,3), attachments: T.slice(2,3), qf: { reference_positions: [3], entities: [{hint:'promotion', raw:'x'}] } });
  ck('S5-12','pre-narrowed pick passes through (does NOT double-filter)',
     o.answers.length === 1 && o.attachments.length === 1 && o._promo_pick.pre_narrowed === true, JSON.stringify(o._promo_pick));
  ck('S5-13','pre-narrowed pick does not claim out-of-range',
     !/only 1 promotion/.test(o.response_intro || ''), o.response_intro);
}
{ // genuine out-of-range must STILL be caught (full set present)
  const o = run({ qf: { reference_positions: [99] } });
  ck('S5-14','genuine out-of-range still reported', (o._promo_pick||{}).out_of_range?.length === 1 && o.attachments.length === 0, JSON.stringify(o._promo_pick));
}
{ // "all" on the narrowed lane must not be mistaken for out-of-range
  const o = run({ qf: { reference_positions: A.map((_,i)=>i+1) } });
  ck('S5-15','"all" still yields every file', o.attachments.length === 15, `len=${o.attachments.length}`);
}
{ // Q23 notice must lead the list reply
  const o = run({ gate: { access_notice: "You don't have access to Mocha Dealer promotions — here's what you do have:" } });
  ck('Q23-1','notice leads the reply', /^You don't have access to Mocha Dealer/.test(o.response || ''), (o.response||'').slice(0,70));
  ck('Q23-2','the list still follows the notice', /I found 15 promotions/.test(o.response || ''), (o.response||'').slice(0,140));
}
{ // no notice -> unchanged
  const o = run({});
  ck('Q23-3','no notice when entitlement matched', !/don't have access/.test(o.response || ''), (o.response||'').slice(0,60));
}
{ // F3 regression: partial out-of-range must NOT pass the whole set through
  const o = run({ answers: A.slice(0,3), attachments: T.slice(0,3), qf: { reference_positions: [1,2,7] } });
  ck('F3-1','"1,2 and 7" on a 3-item list sends only 2 files', o.attachments.length === 2, `len=${o.attachments.length}`);
  ck('F3-2','and reports 7 as out-of-range', ((o._promo_pick||{}).out_of_range||[]).join() === '7', JSON.stringify(o._promo_pick));
}
{ // F4 regression: the pre-narrowed exit must republish roster + context ("all" takes it)
  const o = run({ qf: { reference_positions: A.map((_,i)=>i+1), entities: [{hint:'promotion'}] } });
  ck('F4-1','pre-narrowed exit republishes the roster', (o.suggest_last_result_set||[]).length === 15, `len=${(o.suggest_last_result_set||[]).length}`);
  ck('F4-2','and the suggest_offer context', o.suggest_selection_context === 'suggest_offer', String(o.suggest_selection_context));
}
{ // F6: Q23 notice must ride the single-promotion exit too
  const o = run({ answers: A.slice(0,1), attachments: T.slice(0,1),
                  gate: { access_notice: "You don't have access to Mocha Dealer promotions — here's what you do have:" } });
  ck('F6-1','notice carried on the 1-promotion (D2) exit', /don't have access/.test(o.response_intro || ''), o.response_intro);
}
{ // F1/F2: a promotion dym pick must NOT be re-filtered positionally
  const o = run({ answers: A.slice(0,5), attachments: T.slice(0,5),
                  qf: { reference_positions: [2], entities: [{hint:'promotion', raw:'picked'}] } });
  ck('F1-1','dym-picked promotion passes through unfiltered', o.answers.length === 5 && o.attachments.length === 5, `ans=${o.answers.length} att=${o.attachments.length}`);
}
{ // F10b: a promotion-NAME-scoped list must still be filtered positionally
  const sub = A.slice(0,4), subT = T.slice(0,4);
  const subOrder = sub.map((_,i)=>i).sort((x,y)=>{
    const ex=_dk(sub[x],'end date'), ey=_dk(sub[y],'end date');
    if (ex!==ey) { if(ex===null) return 1; if(ey===null) return -1; return ex>ey?-1:1; }
    return x-y;
  });
  const o = run({ answers: sub, attachments: subT,
                  qf: { reference_positions: [2], entities: [{hint:'promotion', raw:'SORENTO A3'}],
                        _promo_pick_scope_reused: true } });
  ck('F10b-1','scope-reused promotion list is filtered, not passed through', o.attachments.length === 1, `len=${o.attachments.length}`);
  ck('F10b-2','and picks the RIGHT row (displayed position 2)',
     o.attachments[0] && o.attachments[0].filename === subT[subOrder[1]].filename, o.attachments.map(a=>a.filename).join('|'));
}
{ // and a genuine picked-promotion (no scope reuse) still passes through
  const o = run({ answers: A.slice(0,4), attachments: T.slice(0,4),
                  qf: { reference_positions: [2], entities: [{hint:'promotion'}] } });
  ck('F10b-3','picked-promotion lane still passes through', o.attachments.length === 4, `len=${o.attachments.length}`);
}
{ // N1: a WRAPPED envelope must still be handled, not silently no-op'd
  const o = run({ wrap: true });
  ck('N1-1','wrapped envelope: attachments still attached (D5)', o.attachments.length === 15, `len=${o.attachments.length}`);
  ck('N1-2','wrapped envelope: roster still built', (o.suggest_last_result_set||[]).length === 15, `len=${(o.suggest_last_result_set||[]).length}`);
}
{ // N1: an UNRECOGNISED shape must fail CLOSED, never dump every PDF
  const o = run({ shape: 'unknown' });
  ck('N1-3','unknown shape suppresses attachments (fail-closed)', (o.attachments||[]).length === 0, `len=${(o.attachments||[]).length}`);
  ck('N1-4','and flags the shape', o._promo_picker_shape === 'unrecognised', String(o._promo_picker_shape));
}
{ // N2: roster labels beat index when the re-run order differs
  const reordered = [A[4], A[0], A[1], A[2], A[3]].concat(A.slice(5));
  const reAtts    = [T[4], T[0], T[1], T[2], T[3]].concat(T.slice(5));
  const o = run({ answers: reordered, attachments: reAtts,
                  qf: { reference_positions: [1], _promo_pick_labels: [A[0].title], _promo_pick_scope_reused: true } });
  ck('N2-1','label validation beats a shifted index', o.attachments.length === 1 && o.attachments[0].filename === T[0].filename,
     o.attachments.map(a=>a.filename).join('|'));
}
{ // N2: labels that no longer exist are RECORDED, not silently guessed
  const o = run({ qf: { reference_positions: [1], _promo_pick_labels: ['a promotion that vanished'], _promo_pick_scope_reused: true } });
  ck('N2-2','vanished labels recorded', o._promo_pick_label_miss === 1, String(o._promo_pick_label_miss));
}
let bad = 0;
for (const c of checks) { if (!c.p) bad++; console.log(`${c.p ? 'PASS' : 'FAIL'}  ${c.id}  ${c.d}`); if (!c.p) console.log(`        ${c.x}`); }
console.log(`\n${checks.length - bad}/${checks.length} passed`);
process.exit(bad ? 1 : 0);
