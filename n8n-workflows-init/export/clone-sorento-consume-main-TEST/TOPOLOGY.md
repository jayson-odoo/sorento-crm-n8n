# TOPOLOGY — sorento-consume-main TEST  (`txiPzSxy3Pclsz6v`)

- versionId **b2ce8a0a-752d-4a13-afc6-0726daf4b7df** · activeVersionId **b2ce8a0a-752d-4a13-afc6-0726daf4b7df** · DRAFT == ACTIVE
- 182 nodes

## Edges
_218 edge groups_

```
Aggregate[0] -> tier-gate
Aggregate1[0] -> not-found-error-message
Basic LLM Chain[0] -> central-exchange
Basic LLM Chain[1] -> set-ran-query-formulator
Call 'sub-get-results'[0] -> validator
Call 'sub-get-results'[1] -> set-ran-query-formulator
Call 'sub-human-intervention'[0] -> Execution Data
Call 'sub-query-reformulator'[0] -> replay-check-access
Call 'sub-query-reformulator'[1] -> set-ran-query-formulator
Code in JavaScript[0] -> Transcribe a recording
Edit Fields[0] -> Split Out
Edit Fields2[0] -> If8
Execute 'sub-get-rag'[0] -> tool-filter
If[0] -> replay-get-access-types
If[1] -> If7
If-customer-picker[0] -> probe-customer-orders
If-customer-picker[1] -> not-found-error-message
If-ideate[0] -> ideate-egress-gate
If-ideate[1] -> offer-hold-gate
If-incoming-picker[0] -> probe-incoming
If-incoming-picker[1] -> If-customer-picker
If1[0] -> tag-clarify-menu
If1[1] -> not-supported-domain
If10[0] -> tag-escalate-offer
If10[1] -> is-escalation-declined
If2[0] -> divert-suggest-yes
If2[1] -> If-ideate
If3[0] -> If-incoming-picker
If3[1] -> Execute 'sub-get-rag'
If4[0] -> replay-resolve-entity
If4[1] -> access-level-choice-message
If5[0] -> If2
If5[1] -> sorento-sub-respond-sendmsg-respond5
If6[0] -> central-exchange
If6[1] -> Aggregate1
If7[0] -> Edit Fields2
If7[1] -> replay-resolve-entity
If8[0] -> tag-demand-qty
If8[1] -> replay-resolve-entity
If9[0] -> resolve-entity-clarification
If9[1] -> If1
Loop Over Items1[1] -> get-presigned-url
Remove Duplicates[0] -> Loop Over Items1
Split Out[0] -> Remove Duplicates
Switch[0] -> guard-e-record
Switch[1] -> guard-f-record
Switch[2] -> guard-g-record
Transcribe a recording[0] -> sorento-sub-respond-sendmsg-respond-transcribed-message, transcribed-message
When Executed by Another Workflow[0] -> redis-pop-main-message-list
access-level-choice-message[0] -> tag-access-choice
annotate-customer-picker[0] -> build-suggest-offer
annotate-incoming-picker[0] -> build-suggest-offer
attach-merge[0] -> if-got-attachments
build-cs-member-offer[0] -> compile-current-state
build-ideate-reply[0] -> compile-current-state
build-miss-member-offer[0] -> dym-transform-partial
build-suggest-offer[0] -> tag-not-found
central-exchange[0] -> miss-roster-gate
chat-attach-push[0] -> Loop Over Items1
chat-attach?[0] -> chat-attach-push
chat-attach?[1] -> Loop Over Items1
check-access[0] -> If5
check-access-http[0] -> check-access
clarify-company-gate[0] -> clarify-company-reply
clarify-company-gate[1] -> Call 'sub-human-intervention'
compile-current-state[0] -> crossdomain-compose
console-incoming-gate[0] -> log-incoming-chat-history-n8ntest
construct-user-prompt[0] -> parser-bypass-gate
crossdomain-compose[0] -> sorento-sub-respond-sendmsg-respond2, guard-d-record, session-save-gate
crossdomain-gate[0] -> crossdomain-probe
crossdomain-gate[1] -> If6
crossdomain-probe[0] -> crossdomain-render
crossdomain-render[0] -> If6
crossdomain-zeroset[0] -> crossdomain-gate
cs-offer-gate[0] -> cs-roster-plan
cs-offer-gate[1] -> compile-current-state
cs-roster-plan[0] -> get-cs-members
detect-media[0] -> if-media-in
disallowed-entity-gate[0] -> If3
divert-suggest-yes[0] -> tag-escalate-offer
divert-suggest-yes[1] -> tag-out-of-scope, escalation-context
dym-annotate[0] -> build-suggest-offer
dym-annotate-partial[0] -> compile-current-state
dym-gate[0] -> if-promo-dym
dym-gate[1] -> build-suggest-offer
dym-gate-partial[0] -> dym-probe-partial
dym-gate-partial[1] -> compile-current-state
dym-probe[0] -> dym-annotate
dym-probe-partial[0] -> dym-annotate-partial
dym-transform[0] -> dym-gate
dym-transform-partial[0] -> dym-gate-partial
escalate-catalog[0] -> cs-offer-gate
escalation-context[0] -> clarify-company-gate
family-fetch[0] -> sibling-transform
fixture-check-access[0] -> check-access
fixture-get-access-types[0] -> Aggregate
fixture-get-results[0] -> validator
fixture-resolve-entity[0] -> resolve-entity
get-access-types[0] -> Aggregate
get-cs-members[0] -> build-cs-member-offer
get-cs-members-miss[0] -> build-miss-member-offer
get-presigned-url[0] -> Switch
get-session-vars[0] -> Call 'sub-query-reformulator'
get-session-vars-http[0] -> get-session-vars
guard-e-record[0] -> chat-attach?
guard-f-record[0] -> chat-attach?
guard-g-record[0] -> chat-attach?
ideate-egress-gate[0] -> ideate-turn-mock
ideate-egress-gate[1] -> ideate-turn-http
ideate-turn[0] -> build-ideate-reply
ideate-turn-http[0] -> ideate-turn
ideate-turn-mock[0] -> ideate-turn
if-got-attachments[0] -> Edit Fields
if-media-in[0] -> media-egress-gate
if-media-in[1] -> tf-message
if-media-ok[0] -> patch-transcript
if-media-ok[1] -> if-media-reply
if-media-poll[0] -> wait-media-poll
if-media-poll[1] -> if-media-ok
if-media-reply[0] -> send-media-reply
if-message-is-audio[1] -> guard-h-record, sim-inject-gate, Call 'sub-respond-save-message-redis'2
if-promo-dym[0] -> promo-dym-plan
if-promo-dym[1] -> dym-probe
if-tier-ask[0] -> tier-probe-plan
if-tier-ask[1] -> Call 'sub-get-results'
if-tier-has-any[0] -> access-level-choice-message
if-tier-has-any[1] -> Call 'sub-get-results'
if-transcribed-confirm[0] -> send-transcript-confirm
is-escalation-declined[0] -> tag-escalation-declined
is-escalation-declined[1] -> If9
is-human-intervened[0] -> if-message-is-audio
is-human-intervened[1] -> set-human-intervened, guard-c-record
media-egress-gate[0] -> media-extract-mock
media-egress-gate[1] -> media-extract-http
media-extract[0] -> media-route
media-extract-http[0] -> media-extract
media-extract-mock[0] -> media-extract
media-poll-gate[0] -> media-poll-mock
media-poll-gate[1] -> media-poll-http
media-poll-http[0] -> media-poll-merge
media-poll-merge[0] -> media-route
media-poll-mock[0] -> media-poll-merge
media-route[0] -> if-media-poll
miss-members-gate[0] -> get-cs-members-miss
miss-members-gate[1] -> build-miss-member-offer
miss-roster-gate[0] -> miss-roster-plan
miss-roster-gate[1] -> dym-transform-partial
miss-roster-plan[0] -> miss-members-gate
mock-parser-output[0] -> central-exchange
not-found-error-message[0] -> sibling-gate
not-supported-domain[0] -> tag-not-supported
not-supported-domain[1] -> If
offer-hold-gate[0] -> offer-hold-reply
offer-hold-gate[1] -> If10
offer-hold-reply[0] -> tag-offer-hold
parser-bypass-gate[0] -> mock-parser-output
parser-bypass-gate[1] -> Basic LLM Chain
patch-transcript[0] -> tf-message
pg-get-session[0] -> get-session-vars
presign-fail-notice[0] -> sorento-sub-respond-sendmsg-presign-fail
probe-customer-orders[0] -> annotate-customer-picker
probe-incoming[0] -> annotate-incoming-picker
promo-dym-plan[0] -> promo-dym-probe
promo-dym-probe[0] -> dym-annotate
promo-picker[0] -> crossdomain-zeroset
redis-pop-main-message-list[0] -> detect-media
replay-check-access[0] -> fixture-check-access
replay-check-access[1] -> check-access-http
replay-get-access-types[0] -> fixture-get-access-types
replay-get-access-types[1] -> get-access-types
replay-get-results[0] -> fixture-get-results
replay-get-results[1] -> if-tier-ask
replay-resolve-entity[0] -> fixture-resolve-entity
replay-resolve-entity[1] -> resolve-entity-http
resolve-entity[0] -> disallowed-entity-gate
resolve-entity-clarification[0] -> construct-user-prompt
resolve-entity-http[0] -> resolve-entity
send-message-files[0] -> Loop Over Items1
send-message-files[1] -> sorento-sub-respond-sendmsg-respond4
send-message-images[0] -> Loop Over Items1
send-message-images[1] -> sorento-sub-respond-sendmsg-respond4
send-message-video[0] -> Loop Over Items1
send-message-video[1] -> sorento-sub-respond-sendmsg-respond4
session-get-gate[0] -> pg-get-session
session-get-gate[1] -> get-session-vars-http
session-save-gate[0] -> pg-upsert-session
set-human-intervened[0] -> if-message-is-audio
set-ran-query-formulator[0] -> sorento-sub-respond-sendmsg-respond
sibling-gate[0] -> family-fetch
sibling-gate[1] -> dym-transform
sibling-probe[0] -> build-suggest-offer
sibling-transform[0] -> sibling-probe
sim-inject-gate[0] -> sim-inject-session
sim-inject-gate[1] -> session-get-gate
sim-inject-session[0] -> get-session-vars
sorento-sub-respond-findcontact-respond[0] -> is-human-intervened, console-incoming-gate, if-transcribed-confirm
sorento-sub-respond-sendmsg-respond[0] -> Execution Data
sorento-sub-respond-sendmsg-respond2[0] -> Execution Data, attach-merge
sorento-sub-respond-sendmsg-respond4[0] -> Loop Over Items1
sorento-sub-respond-sendmsg-respond4[1] -> Loop Over Items1
sorento-sub-respond-sendmsg-respond5[0] -> Execution Data
tag-access-choice[0] -> escalate-catalog
tag-clarify-menu[0] -> escalate-catalog
tag-demand-qty[0] -> escalate-catalog
tag-escalate-offer[0] -> escalate-catalog
tag-escalation-declined[0] -> escalate-catalog
tag-not-found[0] -> escalate-catalog
tag-not-supported[0] -> escalate-catalog
tag-offer-hold[0] -> escalate-catalog
tag-out-of-scope[0] -> escalate-catalog
tf-message[0] -> sorento-sub-respond-findcontact-respond
tier-gate[0] -> If4
tier-probe[0] -> tier-probe-collect
tier-probe-collect[0] -> if-tier-has-any
tier-probe-plan[0] -> tier-probe
tool-filter[0] -> replay-get-results
validator[0] -> promo-picker
wait-media-poll[0] -> media-poll-gate
```

## Read BY NAME (`$('x')` / `$("x")`)

> Rewiring alone does NOT redirect these. Repoint the expression too.

- **Aggregate** ← crossdomain-probe, disallowed-entity-gate, dym-probe, dym-probe-partial, not-found-error-message, probe-customer-orders, probe-incoming, promo-dym-probe, resolve-entity-clarification, sibling-probe
- **Edit Fields2** ← validator
- **Loop Over Items1** ← send-message-video
- **Remove Duplicates** ← presign-fail-notice
- **Split Out** ← Switch
- **Switch** ← guard-e-record, guard-f-record, send-message-files, sorento-sub-respond-sendmsg-respond4
- **access-level-choice-message** ← compile-current-state, escalate-catalog
- **annotate-incoming-picker** ← escalate-catalog
- **build-cs-member-offer** ← compile-current-state
- **build-ideate-reply** ← compile-current-state
- **build-miss-member-offer** ← compile-current-state
- **build-suggest-offer** ← compile-current-state, escalate-catalog
- **central-exchange** ← attach-merge, build-miss-member-offer, compile-current-state, dym-transform, dym-transform-partial, miss-roster-plan
- **check-access** ← If5
- **compile-current-state** ← Call 'sub-respond-save-message-redis'2
- **construct-user-prompt** ← Basic LLM Chain
- **crossdomain-compose** ← attach-merge, presign-fail-notice, sorento-sub-respond-sendmsg-presign-fail, sorento-sub-respond-sendmsg-respond2
- **crossdomain-render** ← attach-merge, crossdomain-compose, miss-roster-gate
- **crossdomain-zeroset** ← compile-current-state, crossdomain-render
- **cs-roster-plan** ← build-cs-member-offer, compile-current-state
- **detect-media** ← media-extract-http, media-extract-mock, media-route
- **disallowed-entity-gate** ← Call 'sub-get-results', If-customer-picker, If-incoming-picker, If3, annotate-customer-picker, annotate-incoming-picker, build-suggest-offer, compile-current-state, cs-offer-gate, cs-roster-plan, dym-transform, dym-transform-partial, escalate-catalog, family-fetch, miss-roster-plan, not-found-error-message, probe-customer-orders, probe-incoming, promo-picker, sibling-gate, sibling-transform, tier-probe, tool-filter
- **dym-annotate** ← build-suggest-offer
- **dym-transform** ← dym-probe, promo-dym-plan, promo-dym-probe
- **dym-transform-partial** ← dym-probe-partial
- **escalate-catalog** ← build-cs-member-offer, compile-current-state, cs-offer-gate
- **escalation-context** ← Call 'sub-human-intervention'
- **get-cs-members** ← build-cs-member-offer
- **get-session-vars** ← Call 'sub-query-reformulator', Call 'sub-respond-save-message-redis'2, clarify-company-reply, compile-current-state, construct-user-prompt, crossdomain-zeroset, disallowed-entity-gate, escalation-context, ideate-turn-http, offer-hold-gate, offer-hold-reply
- **ideate-turn** ← build-ideate-reply
- **is-human-intervened** ← transcribed-message
- **media-route** ← media-poll-merge, media-poll-mock
- **miss-roster-plan** ← build-miss-member-offer
- **not-found-error-message** ← escalate-catalog
- **offer-hold-reply** ← escalate-catalog
- **patch-transcript** ← compile-current-state, resolve-entity-http, send-transcript-confirm
- **probe-customer-orders** ← annotate-customer-picker
- **probe-incoming** ← annotate-incoming-picker
- **promo-picker** ← compile-current-state, miss-roster-gate
- **redis-pop-main-message-list** ← Call 'sub-human-intervention', Call 'sub-query-reformulator', console-incoming-gate, fixture-check-access, fixture-get-access-types, fixture-get-results, fixture-resolve-entity, guard-c-record, guard-d-record, guard-e-record, guard-f-record, guard-g-record, guard-h-record, ideate-egress-gate, ideate-turn-mock, log-incoming-chat-history-n8ntest, media-egress-gate, media-extract-mock, media-poll-gate, media-poll-mock, mock-parser-output, parser-bypass-gate, patch-transcript, replay-check-access, replay-get-access-types, replay-get-results, replay-resolve-entity, send-media-reply, send-transcript-confirm, session-get-gate, session-save-gate, sim-inject-gate, sim-inject-session, sorento-sub-respond-findcontact-respond, sorento-sub-respond-sendmsg-presign-fail, sorento-sub-respond-sendmsg-respond, sorento-sub-respond-sendmsg-respond-transcribed-message, sorento-sub-respond-sendmsg-respond2, sorento-sub-respond-sendmsg-respond3, sorento-sub-respond-sendmsg-respond4, sorento-sub-respond-sendmsg-respond5
- **resolve-entity** ← If3, build-suggest-offer, compile-current-state, crossdomain-zeroset, disallowed-entity-gate, dym-transform, dym-transform-partial, not-found-error-message, promo-picker
- **resolve-entity-clarification** ← construct-user-prompt
- **set-ran-query-formulator** ← sorento-sub-respond-sendmsg-respond
- **sibling-probe** ← build-suggest-offer
- **sibling-transform** ← build-suggest-offer, sibling-probe
- **sorento-sub-respond-findcontact-respond** ← Call 'sub-get-results', Call 'sub-human-intervention', Call 'sub-query-reformulator', Call 'sub-respond-save-message-redis'2, Execution Data, If7, chat-attach-push, chat-attach?, check-access-http, compile-current-state, crossdomain-probe, dym-probe, dym-probe-partial, get-access-types, get-cs-members, get-cs-members-miss, get-session-vars-http, guard-d-record, guard-h-record, ideate-turn-http, is-human-intervened, pg-get-session, pg-upsert-session, probe-customer-orders, probe-incoming, promo-dym-probe, resolve-entity-clarification, resolve-entity-http, save-session-vars, send-message-files, send-message-images, send-message-video, send-transcript-confirm, sibling-probe, sorento-sub-respond-sendmsg-presign-fail, sorento-sub-respond-sendmsg-respond, sorento-sub-respond-sendmsg-respond-transcribed-message, sorento-sub-respond-sendmsg-respond2, sorento-sub-respond-sendmsg-respond3, sorento-sub-respond-sendmsg-respond4, sorento-sub-respond-sendmsg-respond5, tier-probe
- **tf-message** ← Call 'sub-human-intervention', Call 'sub-query-reformulator', Call 'sub-respond-save-message-redis'2, Code in JavaScript, Transcribe a recording, build-suggest-offer, compile-current-state, construct-user-prompt, get-session-vars-http, guard-h-record, ideate-turn-http, if-message-is-audio, patch-transcript, resolve-entity-http, sorento-sub-respond-sendmsg-respond, sorento-sub-respond-sendmsg-respond-transcribed-message, sorento-sub-respond-sendmsg-respond2, sorento-sub-respond-sendmsg-respond4, sorento-sub-respond-sendmsg-respond5
- **tier-gate** ← Call 'sub-get-results', disallowed-entity-gate, if-tier-ask, tier-probe-collect, tier-probe-plan
- **tier-probe-collect** ← access-level-choice-message
- **tier-probe-plan** ← tier-probe-collect
- **tool-filter** ← Call 'sub-get-results', miss-roster-gate, miss-roster-plan, tier-probe
- **validator** ← If6, compile-current-state, crossdomain-render, sibling-gate
- **x** ← dym-transform, dym-transform-partial  ⚠️ TARGET NOT IN THIS WORKFLOW

## Zero inbound (orphaned / triggers)

- Code in JavaScript
- OpenAI Chat Model
- When Executed by Another Workflow
- presign-fail-notice
- save-session-vars
- send-message-files
- send-message-images
- send-message-video
- sorento-sub-respond-sendmsg-respond3
- update-human-intervened

## Sub-workflow calls

| node | workflowId | name |
|---|---|---|
| Call 'sub-get-results' | `t4QvrtrPnTwRU6br` | sub-get-results CS-BUILD |
| Call 'sub-human-intervention' | `vUfFUDjLAuMaeQE6` | sub-human-intervention TEST (delta3) |
| Call 'sub-query-reformulator' | `wI5RkNGW3EOJfBdo` | sub-semantic-parser FORK domain-continuity-carry |
| Call 'sub-respond-save-message-redis'2 | `tWm5DYLxfypmVC1T` | sub-respond-save-message-redis TEST |
| Execute 'sub-get-rag' | `tWP33QOFT7SxThfT` | sub-get-rag |
| crossdomain-probe | `t4QvrtrPnTwRU6br` | sub-get-results CS-BUILD |
| dym-probe | `t4QvrtrPnTwRU6br` | sub-get-results CS-BUILD |
| dym-probe-partial | `t4QvrtrPnTwRU6br` | sub-get-results CS-BUILD |
| probe-customer-orders | `t4QvrtrPnTwRU6br` | sub-get-results CS-BUILD |
| probe-incoming | `t4QvrtrPnTwRU6br` | sub-get-results CS-BUILD |
| promo-dym-probe | `t4QvrtrPnTwRU6br` | sub-get-results CS-BUILD |
| send-media-reply | `aQUmwMVplmNcyUVc` | sub-sendmsg-QRCHUNK |
| send-transcript-confirm | `aQUmwMVplmNcyUVc` | sub-sendmsg-QRCHUNK |
| sibling-probe | `t4QvrtrPnTwRU6br` | sub-get-results CS-BUILD |
| sorento-sub-respond-sendmsg-presign-fail | `aQUmwMVplmNcyUVc` | sub-sendmsg-QRCHUNK |
| sorento-sub-respond-sendmsg-respond | `aQUmwMVplmNcyUVc` | sub-sendmsg-QRCHUNK |
| sorento-sub-respond-sendmsg-respond-transcribed-message | `aQUmwMVplmNcyUVc` | sub-sendmsg-QRCHUNK |
| sorento-sub-respond-sendmsg-respond2 | `aQUmwMVplmNcyUVc` | sub-sendmsg-QRCHUNK |
| sorento-sub-respond-sendmsg-respond3 | `aQUmwMVplmNcyUVc` | sub-sendmsg-QRCHUNK |
| sorento-sub-respond-sendmsg-respond4 | `aQUmwMVplmNcyUVc` | sub-sendmsg-QRCHUNK |
| sorento-sub-respond-sendmsg-respond5 | `aQUmwMVplmNcyUVc` | sub-sendmsg-QRCHUNK |
| tier-probe | `t4QvrtrPnTwRU6br` | sub-get-results CS-BUILD |

## Credentials (references only — no secrets)

| node | type | credential |
|---|---|---|
| OpenAI Chat Model | openAiApi | sorento-openai |
| Transcribe a recording | openAiApi | sorento-openai |
| chat-attach-push | redis | sorento-redis |
| check-access-http | httpHeaderAuth | crm-n8n-auth |
| family-fetch | httpHeaderAuth | crm-n8n-auth |
| get-access-types | httpHeaderAuth | crm-n8n-auth |
| get-cs-members | httpHeaderAuth | crm-n8n-auth |
| get-cs-members-miss | httpHeaderAuth | crm-n8n-auth |
| get-presigned-url | httpHeaderAuth | crm-n8n-auth |
| get-session-vars-http | httpHeaderAuth | crm-n8n-auth |
| guard-c-record | redis | sorento-redis |
| guard-d-record | redis | sorento-redis |
| guard-e-record | redis | sorento-redis |
| guard-f-record | redis | sorento-redis |
| guard-g-record | redis | sorento-redis |
| guard-h-record | redis | sorento-redis |
| ideate-turn-http | httpHeaderAuth | crm-n8n-auth |
| log-incoming-chat-history-n8ntest | postgres | n8n_test-db |
| media-extract-http | httpHeaderAuth | crm-n8n-auth |
| media-poll-http | httpHeaderAuth | crm-n8n-auth |
| pg-get-session | postgres | n8n_test-db |
| pg-upsert-session | postgres | n8n_test-db |
| redis-pop-main-message-list | redis | sorento-redis |
| resolve-entity-clarification | httpHeaderAuth | crm-n8n-auth |
| resolve-entity-http | httpHeaderAuth | crm-n8n-auth |
| save-session-vars | httpHeaderAuth | crm-n8n-auth |
| send-message-files | respondIoApi | sorento-api |
| send-message-images | respondIoApi | sorento-api |
| send-message-video | respondIoApi | sorento-api |
| update-human-intervened | respondIoApi | sorento-api |

## Code nodes (bodies exported to `nodes/`)

| node | lines |
|---|---|
| compile-current-state | 1675 |
| disallowed-entity-gate | 835 |
| build-suggest-offer | 651 |
| promo-picker | 578 |
| not-found-error-message | 492 |
| dym-transform | 421 |
| dym-transform-partial | 410 |
| tier-gate | 195 |
| crossdomain-render | 181 |
| dym-annotate | 169 |
| media-route | 151 |
| build-cs-member-offer | 144 |
| dym-annotate-partial | 144 |
| crossdomain-zeroset | 143 |
| build-miss-member-offer | 111 |
| crossdomain-compose | 101 |
| escalate-catalog | 99 |
| access-level-choice-message | 95 |
| detect-media | 91 |
| escalation-context | 89 |
| miss-roster-plan | 73 |
| presign-fail-notice | 62 |
| tool-filter | 59 |
| annotate-customer-picker | 59 |
| attach-merge | 51 |
| sibling-transform | 47 |
| tier-probe-collect | 47 |
| media-extract-mock | 47 |
| validator | 46 |
| patch-transcript | 43 |
| clarify-company-reply | 39 |
| offer-hold-reply | 39 |
| promo-dym-plan | 37 |
| annotate-incoming-picker | 35 |
| tier-probe-plan | 33 |
| media-poll-merge | 31 |
| central-exchange | 28 |
| construct-user-prompt | 25 |
| cs-roster-plan | 23 |
| media-poll-mock | 19 |
| build-ideate-reply | 17 |
| ideate-turn-mock | 12 |
| transcribed-message | 5 |
| tf-message | 5 |
| set-ran-query-formulator | 5 |
| sim-inject-session | 5 |
| fixture-get-access-types | 4 |
| set-human-intervened | 3 |
| Code in JavaScript | 3 |
| mock-parser-output | 2 |
| fixture-get-results | 2 |
| fixture-resolve-entity | 2 |
| fixture-check-access | 2 |
| sorento-sub-respond-findcontact-respond | 1 |
