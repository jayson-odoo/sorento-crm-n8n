const exec = $input.first().json;
let data = exec.data;
if (typeof data === 'string') { data = JSON.parse(data); }
const runData = (data && data.resultData && data.resultData.runData) || {};
const wfNodes = (exec.workflowData && exec.workflowData.nodes) || [];
const nameToId = {};
for (const n of wfNodes) { nameToId[n.name] = n.id; }
const turn = $('Build Item').first().json;
const replayRunId = $('Insert replay_run').first().json.id;

const STRIP_KEYS = new Set(['pairedItem','mode','mock_parser_output','mock_reformulator_output','fixtures','test_run_id','scope']);
const TS_KEY = /(_at$|^ts$|^timestamp$|last_updated|elapsed_ms|^elapsed$|startTime|executionTime|captured_at|started_at|finished_at)/i;
const ISO = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/;
function norm(v){
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === 'object'){
    const o = {};
    for (const k of Object.keys(v).sort()){
      if (STRIP_KEYS.has(k)) continue;
      if (TS_KEY.test(k)) { o[k] = '<V>'; continue; }
      if (k === 'person_mention' && (v[k] === null || v[k] === undefined)) continue; // order-member-pick-name-resolve: additive always-extract key, ignore-when-null / surface-when-non-null (LESSON 21 - not a blanket ignore)
      if (k === '_parser_raw') continue; // state-transition-monitor C2/C4: _parser_raw is a top-level sibling on the parser sub output — a PURE MIRROR of output.output (== parser_applied), which is diffed in full at this same node. Stripping it on BOTH sides loses nothing observable (LESSON 21: legitimate strip, not a blanket ignore). It is absent in golden and present post-C2 on every real-parser replay turn; without this it would regress all ~2.2k turns (LESSON 40).
      if (k === 'similarity' && typeof v[k] === 'number') { o[k] = Math.round(v[k] * 1000) / 1000; continue; }
      o[k] = norm(v[k]);
    }
    return o;
  }
  if (typeof v === 'string' && (ISO.test(v) || /^\d{13}$/.test(v))) return '<TS>';
  return v;
}
function canon(v){ return JSON.stringify(norm(v)); }
function h32(s){ let h = 0; for (let i = 0; i < s.length; i++){ h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0; } return (h >>> 0).toString(16); }
function resolveInput(run){
  const src = (run && run.source) || [];
  const inputs = [];
  for (const s of src){
    if (!s || !s.previousNode) continue;
    const pn = s.previousNode; const po = s.previousNodeOutput || 0; const pr = s.previousNodeRun || 0;
    const prun = (runData[pn] && runData[pn][pr]) ? runData[pn][pr] : null;
    if (prun && prun.data && prun.data.main && prun.data.main[po] !== undefined) inputs.push(prun.data.main[po]);
  }
  return inputs.length ? inputs : null;
}

const HARNESS = new Set([
  'parser-bypass-gate','mock-parser-output','Basic LLM Chain','OpenAI Chat Model',
  'replay-resolve-entity','fixture-resolve-entity','resolve-entity-http',
  'replay-check-access','fixture-check-access','check-access-http',
  'replay-get-results','fixture-get-results',"Call 'sub-get-results'",
  'replay-get-access-types','fixture-get-access-types','get-access-types'
]);
const SEP = String.fromCharCode(0);

const goldenRows = ($('Fetch Golden').first().json.golden_rows) || [];
const golden = {};
for (const j of goldenRows){
  const key = (j.node_id || ('NAME:' + j.node_name)) + SEP + j.run_index;
  golden[key] = { node_name: j.node_name, node_id: j.node_id || null, input: j.input_json, output: j.output_json };
}
const replay = {};
for (const nodeName of Object.keys(runData)){
  const nid = nameToId[nodeName] || null;
  const keyId = nid || ('NAME:' + nodeName);
  const runs = runData[nodeName] || [];
  for (let i = 0; i < runs.length; i++){
    const run = runs[i] || {};
    let out;
    if (run.data && run.data.main) out = run.data.main;
    else if (run.error) out = { error: String((run.error && run.error.message) || run.error) };
    else out = [];
    replay[keyId + SEP + i] = { node_name: nodeName, node_id: nid, input: resolveInput(run), output: out };
  }
}
const keys = new Set([...Object.keys(golden), ...Object.keys(replay)]);
const rows = [];
for (const key of keys){
  const run_index = Number(key.slice(key.indexOf(SEP) + 1));
  const g = golden[key];
  const r = replay[key];
  const node_name = (r && r.node_name) || (g && g.node_name);
  const node_id = (r && r.node_id) || (g && g.node_id) || null;
  const gOut = g ? g.output : undefined;
  const rOut = r ? r.output : undefined;
  const gc = gOut !== undefined ? canon(gOut) : null;
  const rc = rOut !== undefined ? canon(rOut) : null;
  let status; let diffJson = null;
  if (HARNESS.has(node_name)) status = 'volatile';
  else if (gc !== null && rc !== null){
    if (gc === rc) status = 'match';
    else { status = 'regression'; diffJson = { golden: norm(gOut), replay: norm(rOut) }; }
  } else if (gc !== null) status = 'missing';
  else status = 'new';
  rows.push({
    trigger_chat_history_id: Number(turn.trigger_chat_history_id),
    node_name, node_id, run_index,
    golden_norm_hash: gc !== null ? h32(gc) : null,
    replay_norm_hash: rc !== null ? h32(rc) : null,
    diff_status: status,
    diff_json: diffJson,
    golden_input: g && g.input !== undefined ? g.input : null,
    golden_output: gOut !== undefined ? gOut : null,
    replay_input: r && r.input !== undefined ? r.input : null,
    replay_output: rOut !== undefined ? rOut : null
  });
}
return [{ json: { replay_run_id: replayRunId, trigger_chat_history_id: Number(turn.trigger_chat_history_id), row_count: rows.length, rows } }];

