// Offline probe: runs the 5 stand-in bodies EXTRACTED FROM THE PUBLISHED WORKFLOW
// (not from the local source files) under a stubbed n8n Code-node context.
// Zero network, zero n8n. Proves: expression wiring, fixture selection, body/comment
// rendering, and that the throw-guards actually go red.
const fs = require('fs');
const path = require('path');
const DIR = process.argv[2];

const bodies = JSON.parse(fs.readFileSync(path.join(DIR, 'published-jscode.json'), 'utf8'));

// --- minimal Luxon DateTime shim: enough to prove the template wiring ---
const DateTime = {
  fromISO(s, opts) {
    return {
      _s: s, _z: (opts && opts.zone) || 'local',
      setZone(z) { return { _s: s, _z: z, toFormat(f) { return `<${s}|${z}|${f}>`; } }; },
      toFormat(f) { return `<${s}|${this._z}|${f}>`; },
    };
  },
};

function run(name, jsCode, ctx) {
  const fn = new Function('$', '$input', '$json', 'DateTime', jsCode);
  return fn(ctx.$, ctx.$input, ctx.$json, DateTime);
}

function mkctx(nodeOutputs, currentItem) {
  const $ = (n) => {
    if (!(n in nodeOutputs)) throw new Error(`stub: no output recorded for node ${n}`);
    const j = nodeOutputs[n];
    return { first: () => ({ json: j }), item: { json: j }, all: () => [{ json: j }] };
  };
  return { $, $input: { item: { json: currentItem } }, $json: currentItem };
}

const TRIG_BASE = {
  contact_id: 437264483,
  agent: 'CS',
  team: 'CS-TEAM',
  contact_phone_number: '+60123456789',
  message_id: 9876543210,
  input_message: 'I need help with my order SRT332-GM "not" delivered\nline2',
  test_run_id: 'S32-V2-probe',
  started_at: '2026-08-12T00:00:00.000Z',
  contact: { chat_id: '' },
  explicit_assignee_id: '',
  turn_id: 'turn-1',
};

let fails = 0;
function check(label, cond, extra) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
  if (!cond) fails++;
}
function expectThrow(label, fn, needle) {
  try { fn(); check(label + ' (expected throw)', false, 'no throw'); }
  catch (e) { check(label, String(e.message).includes(needle), '-> ' + e.message.slice(0, 90)); }
}

const CASES = [
  ['a  unassigned + in-hours',  false, 'fresh_insert_in_hours',      true],
  ['b  ASSIGNED + in-hours',    true,  'fresh_insert_in_hours',      true],
  ['c  unassigned + out-hours', false, 'fresh_insert_out_of_hours',  false],
  ['d  ASSIGNED + out-hours',   true,  'fresh_insert_out_of_hours',  false],
  ['e  retry already_active',   false, 'retry_already_active',       true],
  ['f  in_working_hours ABSENT',false, 'missing_in_working_hours',   undefined],
];

for (const [label, already, fixture, expectIWH] of CASES) {
  console.log('\n======== case ' + label + ' ========');
  const trig = { ...TRIG_BASE, _case_already_assigned: already, _case_fixture: fixture };
  const out = {};
  out['When Executed by Another Workflow'] = trig;

  // 1. get-round-robin-assignee
  const rr = run('rr', bodies['get-round-robin-assignee'], mkctx(out, { seed: 1 })).json;
  out['get-round-robin-assignee'] = rr;
  check('rr.is_already_assigned mirrors the case', rr.is_already_assigned === already);
  check('rr.assignee_id', rr.assignee_id === 'USR-0042');

  // 2. assign stand-in (only on the TRUE branch = NOT already assigned)
  let intoCreate = rr;
  if (!already) {
    const asg = run('asg', bodies['Assign or unassign a Conversation1'], mkctx(out, rr)).json;
    out['Assign or unassign a Conversation1'] = asg;
    check('assign would_assign_contact == trigger contact_id', asg.would_assign_contact === trig.contact_id);
    check('assign would_assign_user == rr.assignee_respond_user_id', asg.would_assign_user === 123456);
    check('assign passes through rr fields', asg.assignee_id === 'USR-0042');
    intoCreate = asg;
  } else {
    check('assign stand-in NOT executed on the already-assigned branch', true);
  }

  // 3. create stand-in
  const cr = run('cr', bodies['conversation-sla-tracking-create'], mkctx(out, intoCreate)).json;
  out['conversation-sla-tracking-create'] = cr;
  check('rendered url', cr._rendered_url.endsWith('/conversation-sla-tracking/integration'));
  check('body.message_id is an unquoted NUMBER', typeof cr._rendered_body.message_id === 'number', JSON.stringify(cr._rendered_body.message_id));
  check('body.source_message_id is a quoted STRING', typeof cr._rendered_body.source_message_id === 'string');
  check('both message ids agree', String(cr._rendered_body.message_id) === cr._rendered_body.source_message_id);
  check('body.assigned_to_id from rr', cr._rendered_body.assigned_to_id === 'USR-0042');
  check('source_message_text survives quotes+newline', cr._rendered_body.source_message_text === trig.input_message);
  check('no legacy keys (policy_id/current_tier/assigned_to)', !('policy_id' in cr._rendered_body) && !('current_tier' in cr._rendered_body) && !('assigned_to' in cr._rendered_body));
  check('body key set == locked contract',
        JSON.stringify(Object.keys(cr._rendered_body).sort()) ===
        JSON.stringify(['agent_code','assigned_to_id','contact_phone_number','message_id','source_message_id','source_message_text','team_set_code']));
  check('in_working_hours == ' + expectIWH, cr.in_working_hours === expectIWH, JSON.stringify(cr.in_working_hours));
  check('in_working_hours key present == ' + (expectIWH !== undefined), ('in_working_hours' in cr) === (expectIWH !== undefined));
  check('already_active pinned', cr.already_active === (fixture === 'retry_already_active'));

  // 4. comment stand-in
  const cm = run('cm', bodies["Call 'sub-add-comment-respond'"], mkctx(out, cr)).json;
  out["Call 'sub-add-comment-respond'"] = cm;
  check('comment names the team', cm._rendered_comment.startsWith('Team: CS-TEAM'));
  check('comment carries the SLA-alert marker', cm._rendered_comment.includes('SLA Alert'));
  check('comment reads initiated_at off the create response', cm._rendered_comment.includes(cr.initiated_at));
  check('comment reads due_at + due_at_resolution', cm._rendered_comment.includes(cr.due_at) && cm._rendered_comment.includes(cr.due_at_resolution));
  check('comment converts utc -> Asia/Kuala_Lumpur', cm._rendered_comment.includes('|Asia/Kuala_Lumpur|yyyy-MM-dd HH:mm:ss'));
  check('comment reference-message deep link', cm._rendered_comment.includes(`inbox/${trig.contact_id}#${trig.message_id}`));
  check('_comment_user_id == rr.assignee_respond_user_id', cm._comment_user_id === 123456);
  check('comment passes create response through', cm.tracking_id === cr.tracking_id);

  // 5. get-working-days (out-of-hours leg only)
  if (expectIWH === false) {
    const wd = run('wd', bodies['get-working-days'], mkctx(out, cm)).json;
    check('work-calendar shape consumed by the out-of-hours copy',
          wd.working_day_ranges[0].start_weekday === 'Tuesday' && wd.working_hours_start === '08:00' && wd.working_hours_end === '23:59');
  }
}

console.log('\n======== fail-on-purpose: the guards must go RED ========');
{
  const out = { 'When Executed by Another Workflow': { ...TRIG_BASE } }; // no _case_* keys
  expectThrow('rr throws when _case_already_assigned is absent',
    () => run('rr', bodies['get-round-robin-assignee'], mkctx(out, {})), '_case_already_assigned');
  const out2 = { 'When Executed by Another Workflow': { ...TRIG_BASE, _case_already_assigned: 'true' } };
  expectThrow('rr throws when _case_already_assigned is a STRING',
    () => run('rr', bodies['get-round-robin-assignee'], mkctx(out2, {})), '_case_already_assigned');
  const out3 = { 'When Executed by Another Workflow': { ...TRIG_BASE, _case_fixture: 'typo_fixture' },
                 'get-round-robin-assignee': { assignee_id: 'USR-0042' } };
  expectThrow('create throws on an unknown _case_fixture',
    () => run('cr', bodies['conversation-sla-tracking-create'], mkctx(out3, {})), '_case_fixture');
  const out4 = { 'When Executed by Another Workflow': { ...TRIG_BASE, _case_fixture: undefined },
                 'get-round-robin-assignee': { assignee_id: 'USR-0042' } };
  expectThrow('create throws when _case_fixture is absent',
    () => run('cr', bodies['conversation-sla-tracking-create'], mkctx(out4, {})), '_case_fixture');
  // NOTE (2026-08-16, codex VERDICT: FIX): the old case 5 here drove an unrenderable body through
  // `assigned_to_id: 'a"b'` and asserted the JSON.parse guard threw. The 2026-08-16 hardening
  // JSON.stringify's assigned_to_id, so that case can no longer go red — a green that cannot fail
  // (LESSONS §61; this is the SECOND time this same case had to be retargeted for the same reason,
  // the first being the 2026-08-12 pass which moved it off contact_phone_number).
  // It is retired here and replaced by the `======== 2026-08-16 hardening ========` block below,
  // which covers the NEW invariants positively AND negatively. Its red-proof is a reconstructed
  // pre-fix body (throwaway-build.md §13), not a hostile input — because after this change NO
  // interpolation in the template can malform the body, which is the whole point.
}

console.log('\n======== hardening: the 3 stringify\'d keys survive hostile values ========');
{
  const hostile = {
    ...TRIG_BASE,
    _case_already_assigned: false,
    _case_fixture: 'fresh_insert_in_hours',
    contact_phone_number: 'a"b\\c\nd',
    agent: 'C"S',
    team: 'CS\n"TEAM',
  };
  const out = { 'When Executed by Another Workflow': hostile,
                'get-round-robin-assignee': { assignee_id: 'USR-0042' } };
  // must NOT throw post-hardening. Pre-hardening this render dies on the `"` — caught here so
  // the instrument reports a labelled FAIL instead of crashing the probe.
  let cr;
  try {
    cr = run('cr', bodies['conversation-sla-tracking-create'], mkctx(out, {})).json;
  } catch (e) {
    check('hostile values render without throwing (HARDENING)', false, '-> ' + String(e.message).split('\n')[0].slice(0, 110));
    cr = { _rendered_body: {} };
  }
  check('hostile contact_phone_number round-trips', cr._rendered_body.contact_phone_number === hostile.contact_phone_number, JSON.stringify(cr._rendered_body.contact_phone_number));
  check('hostile agent_code round-trips', cr._rendered_body.agent_code === hostile.agent);
  check('hostile team_set_code round-trips', cr._rendered_body.team_set_code === hostile.team);
  check('body key set unchanged by the hardening',
        JSON.stringify(Object.keys(cr._rendered_body).sort()) ===
        JSON.stringify(['agent_code','assigned_to_id','contact_phone_number','message_id','source_message_id','source_message_text','team_set_code']));

  // null/undefined must render as "" (the ?? '' half), never as the literal null/undefined
  const nullish = { ...TRIG_BASE, _case_fixture: 'fresh_insert_in_hours', contact_phone_number: null, agent: undefined };
  delete nullish.team;
  const out6 = { 'When Executed by Another Workflow': nullish,
                 'get-round-robin-assignee': { assignee_id: 'USR-0042' } };
  let cr6;
  try {
    cr6 = run('cr', bodies['conversation-sla-tracking-create'], mkctx(out6, {})).json;
  } catch (e) {
    check('nullish values render without throwing (HARDENING)', false, '-> ' + String(e.message).split('\n')[0].slice(0, 110));
    cr6 = { _rendered_body: {} };
  }
  check('null contact_phone_number renders as ""', cr6._rendered_body.contact_phone_number === '', JSON.stringify(cr6._rendered_body.contact_phone_number));
  check('undefined agent renders as ""', cr6._rendered_body.agent_code === '');
  check('absent team renders as ""', cr6._rendered_body.team_set_code === '');
}

console.log("\n======== 2026-08-16 hardening: assigned_to_id / message_id / source_message_id ========");
{
  // Renders the create stand-in with a given trigger json and returns {raw, body} — or records a
  // labelled FAIL and returns a null shape, so a throw here never crashes the probe.
  function render(label, trigOverrides, rrOverrides) {
    const trig = { ...TRIG_BASE, _case_fixture: 'fresh_insert_in_hours', ...trigOverrides };
    for (const k of Object.keys(trigOverrides)) if (trigOverrides[k] === '__DELETE__') delete trig[k];
    const rr = { assignee_id: 'USR-0042', ...rrOverrides };
    for (const k of Object.keys(rrOverrides || {})) if (rr[k] === '__DELETE__') delete rr[k];
    const out = { 'When Executed by Another Workflow': trig, 'get-round-robin-assignee': rr };
    try {
      const j = run('cr', bodies['conversation-sla-tracking-create'], mkctx(out, {})).json;
      return { raw: j._rendered_body_raw, body: j._rendered_body };
    } catch (e) {
      check(label + ' renders without throwing', false, '-> ' + String(e.message).split('\n')[0].slice(0, 120));
      return { raw: '', body: {} };
    }
  }
  // The raw template text is the object under test for "bare null" vs `""` vs `"null"` — the parsed
  // value alone cannot tell a bare null from a JSON string "null" being fixed up downstream.
  const lineOf = (raw, key) => (raw.split('\n').find((l) => l.trim().startsWith(`"${key}":`)) || '').trim();

  // ---- (c) PRESENT message_id: number unquoted, source_message_id a QUOTED string ----
  {
    const r = render('present message_id', { message_id: 1786538674000000 }, {});
    check('(c) present: message_id line is the bare number', lineOf(r.raw, 'message_id') === '"message_id": 1786538674000000,', lineOf(r.raw, 'message_id'));
    check('(c) present: source_message_id line is a QUOTED string', lineOf(r.raw, 'source_message_id') === '"source_message_id": "1786538674000000",', lineOf(r.raw, 'source_message_id'));
    check('(c) present: parsed message_id is a number', typeof r.body.message_id === 'number');
    check('(c) present: parsed source_message_id is a string', typeof r.body.source_message_id === 'string', JSON.stringify(r.body.source_message_id));
    check('(c) present: the two agree', String(r.body.message_id) === r.body.source_message_id);
  }

  // ---- (a)+(b) ABSENT message_id: BOTH keys render a BARE null; the body still parses ----
  for (const [what, ov] of [['absent', { message_id: '__DELETE__' }], ['null', { message_id: null }], ['undefined', { message_id: undefined }]]) {
    const r = render(`${what} message_id`, ov, {});
    check(`(a) ${what}: message_id renders BARE null (never a malformed empty slot)`, lineOf(r.raw, 'message_id') === '"message_id": null,', lineOf(r.raw, 'message_id'));
    check(`(a) ${what}: body is still valid JSON`, r.body && typeof r.body === 'object' && 'message_id' in r.body);
    check(`(a) ${what}: parsed message_id === null`, r.body.message_id === null, JSON.stringify(r.body.message_id));
    check(`(b) ${what}: source_message_id renders BARE null, NOT ""`, lineOf(r.raw, 'source_message_id') === '"source_message_id": null,', lineOf(r.raw, 'source_message_id'));
    check(`(b) ${what}: parsed source_message_id === null (empty idempotency key impossible)`, r.body.source_message_id === null, JSON.stringify(r.body.source_message_id));
    check(`(b) ${what}: source_message_id is NOT the empty string`, r.body.source_message_id !== '');
    check(`(b) ${what}: source_message_id is NOT the STRING "null"`, r.body.source_message_id !== 'null');
  }

  // ---- `== null` must catch undefined AND null but NOT 0 or "" ----
  {
    const r0 = render('message_id 0', { message_id: 0 }, {});
    check('(b) message_id 0 is NOT treated as missing (== null, not falsy)', lineOf(r0.raw, 'source_message_id') === '"source_message_id": "0",', lineOf(r0.raw, 'source_message_id'));
    check('(a) message_id 0 renders the bare number 0', lineOf(r0.raw, 'message_id') === '"message_id": 0,', lineOf(r0.raw, 'message_id'));
    const rE = render('message_id ""', { message_id: '' }, {});
    check('(b) message_id "" is NOT treated as missing', lineOf(rE.raw, 'source_message_id') === '"source_message_id": "",', lineOf(rE.raw, 'source_message_id'));
    check('(a) message_id "" renders a quoted empty string, not a malformed slot', lineOf(rE.raw, 'message_id') === '"message_id": "",', lineOf(rE.raw, 'message_id'));
  }

  // ---- (d) MISSING assignee_id renders "" (correct: empty means round-robin server-side) ----
  for (const [what, ov] of [['absent', { assignee_id: '__DELETE__' }], ['null', { assignee_id: null }], ['undefined', { assignee_id: undefined }]]) {
    const r = render(`${what} assignee_id`, {}, ov);
    check(`(d) ${what}: assigned_to_id renders ""`, lineOf(r.raw, 'assigned_to_id') === '"assigned_to_id": "",', lineOf(r.raw, 'assigned_to_id'));
    check(`(d) ${what}: parsed assigned_to_id === ""`, r.body.assigned_to_id === '', JSON.stringify(r.body.assigned_to_id));
    check(`(d) ${what}: NEVER the literal string "undefined"`, r.body.assigned_to_id !== 'undefined');
    check(`(d) ${what}: NEVER the literal string "null"`, r.body.assigned_to_id !== 'null');
  }

  // ---- positive counterpart of the retired fail-on-purpose case: a hostile assignee_id is now SAFE ----
  {
    const r = render('hostile assignee_id', {}, { assignee_id: 'a"b\\c\nd' });
    check('hostile assigned_to_id round-trips instead of malforming the body', r.body.assigned_to_id === 'a"b\\c\nd', JSON.stringify(r.body.assigned_to_id));
    check('hostile assigned_to_id keeps the key set intact',
          JSON.stringify(Object.keys(r.body).sort()) ===
          JSON.stringify(['agent_code','assigned_to_id','contact_phone_number','message_id','source_message_id','source_message_text','team_set_code']));
  }
}

console.log(fails === 0 ? '\nALL PROBE ASSERTIONS PASSED' : `\n${fails} PROBE ASSERTION(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
