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
  // a value that cannot be embedded raw must surface as a render failure, not silently.
  // POST-HARDENING (2026-08-12): the three trigger-sourced strings are JSON.stringify'd, so
  // the surviving raw-interpolated key is `assigned_to_id` (from get-round-robin-assignee).
  const out5 = { 'When Executed by Another Workflow': { ...TRIG_BASE, _case_fixture: 'fresh_insert_in_hours' },
                 'get-round-robin-assignee': { assignee_id: 'a"b' } };
  expectThrow('create throws when the rendered body is not valid JSON (raw assigned_to_id)',
    () => run('cr', bodies['conversation-sla-tracking-create'], mkctx(out5, {})), 'not valid JSON');
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

console.log(fails === 0 ? '\nALL PROBE ASSERTIONS PASSED' : `\n${fails} PROBE ASSERTION(S) FAILED`);
process.exit(fails === 0 ? 0 : 1);
