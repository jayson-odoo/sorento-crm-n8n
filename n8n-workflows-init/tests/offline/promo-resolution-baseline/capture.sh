#!/usr/bin/env bash
# ── promotion-resolution baseline ────────────────────────────────────────────────────────────
# Records what the CRM entity resolver returns TODAY for a fixed set of promotion phrases, so a
# change to description matching can be diffed against real behaviour instead of argued about.
# "Absolutely no regression to promotion enquiry" is only checkable against a recorded before.
#
#   bash capture.sh baseline.json     # before the resolver change
#   bash capture.sh after.json        # after
#   node diff.js baseline.json after.json
#
# ── WHY THE uac RUNNER AND NOT THE CHAT CONSOLE ──────────────────────────────────────────────
# The first attempt drove `zz-chat` with a fresh sessionId per phrase and was VOID: conversation
# state is per CONTACT, not per session, so entity carry from phrase N leaked into phrase N+1 and
# "promotion flyer" came back with tokens ['cabana','kitchen tap']. A baseline whose values depend
# on phrase ORDER cannot prove anything. Kept as baseline.CONTAMINATED.json.
#
# This lane sends `previous_conversation_state: {}` per phrase, which is TRUTHY, so `sim-inject-gate`
# routes to `sim-inject-session` — state is injected, nothing is read from the contact's real
# session. Verified (exec 11924674) that `resolve-entity-http` STILL RUNS on this path, i.e. the
# resolver call is real while the state is isolated. That combination is the whole point; do not
# "simplify" by omitting the field, which reaches the network AND reads the contact's stale prod
# session (see memory `uac-mode-reads-prod-session`).
#
# READ-ONLY: prod CRM reads only. Egress is guarded (`would_log`/`would_send`) and returned by the
# runner for inspection.
set -uo pipefail
cd "$(dirname "$0")"
OUT="${1:-baseline.json}"
set -a; . "$(cd ../../../.. && pwd)/.env"; set +a
HOOK="$N8N_BASE_URL/webhook/zz-run-promo-picker"
CONTACT="437264483"

# Each phrase pins a match path the promotion flow depends on. The last two were requested by the
# CRM session: they are the paths SUBSTRING matching exists to protect, so without them the
# baseline cannot prove a tightening didn't break them — it would be a green that cannot fail.
PHRASES=(
  "promo for SRTBF11834"                 # product code -> promotion_membership / via_product
  "promo for CBS212-WH"                  # Cabana product; brand now on the row
  "promotion for bathroom furniture"     # category scope, large set
  "any Cabana promotion"                 # brand scope -> description matching
  "promo for SRTKS6047-NEW"              # exact product code
  "6047 promo"                           # bare numeric fragment
  "any promo for cabana bathtub"         # 2nd word absent from EVERY description
  "any promo for cabana car"             # substring hit on ALA-CARTE (3 rows, disjoint from cabana)
  "cabana kitchen tap promo"             # AND->OR union across two contributing tokens
  "promotion flyer"                      # flyer scope
  "promo for SRTWC6015-RL-UF"            # punctuated code — word-boundary matching would break this
  # ── the three below pin the paths SUBSTRING matching exists to protect. Supplied by the CRM
  # session with row counts verified against the live promotions table, replacing my "TT440s",
  # which returned 0 rows and therefore pinned nothing (_word_variants never strips a trailing `s`
  # from a token containing digits — deliberate — so that phrase exercised the path not at all).
  "cabana taps promo"                    # plural fallback: "taps" -> "TAP" via _word_variants (n=3)
  "promo MBF97582"                       # filename fragment AFTER an underscore, substring-only (n=1)
  "kitchen sink promo"                   # 3 of 13 rows are "…KITCHEN SINK_22052026…" — `_` is a word
                                         # char, so word-boundary matching silently drops a fifth of
                                         # a routine customer question. The concrete case for loose.
)

echo "[" > "$OUT.tmp"; first=1
for p in "${PHRASES[@]}"; do
  echo "→ $p"
  python3 - "$p" "$CONTACT" > /tmp/prb_item.json <<'PY'
import json,sys
text, contact = sys.argv[1], sys.argv[2]
print(json.dumps({"test_run_id": "baseline", "contact": contact, "item": {
  "mode": "uac", "test_run_id": "baseline",
  "previous_conversation_state": {},          # truthy -> sim-inject -> ISOLATED per phrase
  "contact": {"id": contact, "firstName": "Dev", "lastName": "Test", "phone": "+60100000000",
              "countryCode": "MY", "status": "open",
              "custom_fields": [{"name": "is_human_intervened", "value": "false"}]},
  "message": {"event_type": "message.received", "contact": {"id": contact},
              "message": {"messageId": "baseline", "contactId": contact, "channelId": "1",
                          "traffic": "incoming", "timestamp": 1786000000,
                          "message": {"type": "text", "text": text}}}}}))
PY
  curl -sS -m 300 -o /dev/null -X POST "$HOOK" -H 'Content-Type: application/json' \
    --data-binary "@/tmp/prb_item.json" || true
  python3 - "$p" "$first" >> "$OUT.tmp" <<'PY'
import json,os,sys,urllib.request
phrase, first = sys.argv[1], sys.argv[2]
BASE, KEY = os.environ['N8N_API_BASE'], os.environ['N8N_API_KEY']
def get(u):
    # urllib's default User-Agent is 403'd at the edge while curl succeeds. Cost a silent empty
    # capture once; send a UA.
    return json.load(urllib.request.urlopen(urllib.request.Request(
        u, headers={'X-N8N-API-KEY': KEY, 'User-Agent': 'sorento-n8n-baseline/1.0'})))
rec = {"phrase": phrase, "error": "no execution found"}
for ex in get(f"{BASE}/executions?workflowId=RnpxEnAV3g20MmKj&limit=4").get('data', []):
    rd = get(f"{BASE}/executions/{ex['id']}?includeData=true").get('data', {}).get('resultData', {}).get('runData', {})
    try:
        t = rd['tf-message'][0]['data']['main'][0][0]['json']['message']['message']['text'].strip()
    except Exception:
        continue
    if t != phrase:
        continue
    try:
        r = rd['resolve-entity-http'][0]['data']['main'][0][0]['json']
    except Exception:
        rec = {"phrase": phrase, "execution": ex['id'], "error": "resolve-entity-http did not run"}
        break
    pools = list(r.get('intersection') or [])
    for res in (r.get('resolutions') or []):
        pools += list(res.get('matches') or [])
    seen, uniq = set(), []
    for m in pools:
        k = (m.get('entity_type'), m.get('uuid') or m.get('canonical_code'))
        if k in seen: continue
        seen.add(k)
        uniq.append({"type": m.get('entity_type'), "uuid": m.get('uuid'), "code": m.get('canonical_code'),
                     "field": m.get('match_field'), "tier": m.get('match_tier'),
                     "desc": (m.get('display') or {}).get('description')})
    rec = {"phrase": phrase, "execution": ex['id'], "tokens": r.get('tokens'),
           "match_mode": r.get('match_mode'), "fallback_applied": r.get('fallback_applied'),
           "unresolved_tokens": r.get('unresolved_tokens'), "n": len(uniq),
           "rows": sorted(uniq, key=lambda x: str(x['uuid'] or x['code']))}
    break
sys.stdout.write(("" if first == "1" else ",") + json.dumps(rec, indent=1) + "\n")
PY
  first=0
done
echo "]" >> "$OUT.tmp"; mv "$OUT.tmp" "$OUT"

# Contamination gate. Every token the resolver saw must come from the phrase itself; if a token
# appears that the phrase does not contain, state leaked and the capture is VOID — which is exactly
# how the first attempt failed while looking perfectly healthy.
python3 - "$OUT" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); bad=0
print()
for r in d:
    toks=r.get('tokens') or []; ph=r['phrase'].lower()
    leaked=[t for t in toks if not all(w in ph for w in str(t).lower().split())]
    flag='  🔴 LEAKED '+str(leaked) if leaked else ''
    if leaked: bad+=1
    print(f"  {r['phrase'][:32]:34} n={str(r.get('n','?')):>3}  fallback={str(r.get('fallback_applied')):5} tokens={toks}{flag}")
print(f"\n{len(d)} phrases | {bad} contaminated")
sys.exit(1 if bad else 0)
PY
