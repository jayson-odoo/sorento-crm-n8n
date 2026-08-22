# TOPOLOGY — sorento-consume-main  (`9qVyfUxmRQqrpGRMDLRuz`)

- versionId **57e70ce2-b586-498d-b9d4-cbc9990a06fd** · activeVersionId **57e70ce2-b586-498d-b9d4-cbc9990a06fd** · DRAFT == ACTIVE
- 127 nodes

## Edges
_152 edge groups_

```
Aggregate[0] -> tier-gate
Aggregate1[0] -> not-found-error-message
Basic LLM Chain[0] -> central-exchange
Basic LLM Chain[1] -> set-ran-query-formulator
Call 'sub-get-results'[0] -> validator
Call 'sub-get-results'[1] -> set-ran-query-formulator
Call 'sub-human-intervention'[0] -> Execution Data
Call 'sub-query-reformulator'[0] -> check-access
Call 'sub-query-reformulator'[1] -> set-ran-query-formulator
Code in JavaScript[0] -> Transcribe a recording
Edit Fields[0] -> Split Out
Edit Fields2[0] -> If8
Execute 'sub-get-rag'[0] -> tool-filter
If[0] -> get-access-types
If[1] -> If7
If-ideate[0] -> ideate-turn-http
If-ideate[1] -> If10
If-incoming-picker[0] -> probe-incoming
If-incoming-picker[1] -> not-found-error-message
If1[0] -> tag-clarify-menu
If1[1] -> not-supported-domain
If10[0] -> tag-escalate-offer
If10[1] -> is-escalation-declined
If2[0] -> divert-suggest-yes
If2[1] -> If-ideate
If3[0] -> If-incoming-picker
If3[1] -> Execute 'sub-get-rag'
If4[0] -> resolve-entity
If4[1] -> access-level-choice-message
If5[0] -> If2
If5[1] -> sorento-sub-respond-sendmsg-respond5
If6[0] -> central-exchange
If6[1] -> Aggregate1
If7[0] -> Edit Fields2
If7[1] -> resolve-entity
If8[0] -> tag-demand-qty
If8[1] -> resolve-entity
If9[0] -> resolve-entity-clarification
If9[1] -> If1
Loop Over Items1[1] -> get-presigned-url
Remove Duplicates[0] -> Loop Over Items1
Schedule Trigger[0] -> redis-pop-main-message-list
Split Out[0] -> Remove Duplicates
Switch[0] -> send-message-images
Switch[1] -> send-message-video
Switch[2] -> send-message-files
Transcribe a recording[0] -> sorento-sub-respond-sendmsg-respond-transcribed-message, transcribed-message
When Executed by Another Workflow[0] -> redis-pop-main-message-list
access-level-choice-message[0] -> tag-access-choice
annotate-incoming-picker[0] -> build-suggest-offer
attach-merge[0] -> if-got-attachments
build-cs-member-offer[0] -> compile-current-state
build-ideate-reply[0] -> compile-current-state
build-suggest-offer[0] -> tag-not-found
central-exchange[0] -> dym-transform-partial
check-access[0] -> If5
compile-current-state[0] -> crossdomain-compose
construct-user-prompt[0] -> Basic LLM Chain
crossdomain-compose[0] -> save-session-vars, sorento-sub-respond-sendmsg-respond2
crossdomain-gate[0] -> crossdomain-probe
crossdomain-gate[1] -> If6
crossdomain-probe[0] -> crossdomain-render
crossdomain-render[0] -> If6
crossdomain-zeroset[0] -> crossdomain-gate
cs-offer-gate[0] -> cs-roster-plan
cs-offer-gate[1] -> compile-current-state
cs-roster-plan[0] -> get-cs-members
disallowed-entity-gate[0] -> If3
divert-suggest-yes[0] -> tag-escalate-offer
divert-suggest-yes[1] -> escalation-context, tag-out-of-scope
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
escalation-context[0] -> Call 'sub-human-intervention'
family-fetch[0] -> sibling-transform
fetch-audio[0] -> whisper-transcribe
get-access-types[0] -> Aggregate
get-cs-members[0] -> build-cs-member-offer
get-presigned-url[0] -> Switch
get-session-vars[0] -> Call 'sub-query-reformulator'
ideate-turn-http[0] -> build-ideate-reply
if-audio-in[0] -> if-voice-allowed
if-audio-in[1] -> tf-message
if-got-attachments[0] -> Edit Fields
if-message-is-audio[1] -> Call 'sub-respond-save-message-redis'2, get-session-vars
if-promo-dym[0] -> promo-dym-plan
if-promo-dym[1] -> dym-probe
if-tier-ask[0] -> tier-probe-plan
if-tier-ask[1] -> Call 'sub-get-results'
if-tier-has-any[0] -> access-level-choice-message
if-tier-has-any[1] -> Call 'sub-get-results'
if-transcribed-confirm[0] -> send-transcript-confirm
if-voice-allowed[0] -> fetch-audio
if-voice-allowed[1] -> send-voice-not-allowed
is-escalation-declined[0] -> tag-escalation-declined
is-escalation-declined[1] -> If9
is-human-intervened[0] -> if-message-is-audio
is-human-intervened[1] -> update-human-intervened, set-human-intervened
not-found-error-message[0] -> sibling-gate
not-supported-domain[0] -> tag-not-supported
not-supported-domain[1] -> If
patch-transcript[0] -> tf-message
presign-fail-notice[0] -> sorento-sub-respond-sendmsg-presign-fail
probe-incoming[0] -> annotate-incoming-picker
promo-dym-plan[0] -> promo-dym-probe
promo-dym-probe[0] -> dym-annotate
promo-picker[0] -> crossdomain-zeroset
redis-pop-main-message-list[0] -> if-audio-in
resolve-entity[0] -> disallowed-entity-gate
resolve-entity-clarification[0] -> construct-user-prompt
send-message-files[0] -> Loop Over Items1
send-message-files[1] -> sorento-sub-respond-sendmsg-respond4
send-message-images[0] -> Loop Over Items1
send-message-images[1] -> sorento-sub-respond-sendmsg-respond4
send-message-video[0] -> Loop Over Items1
send-message-video[1] -> sorento-sub-respond-sendmsg-respond4
set-human-intervened[0] -> if-message-is-audio
set-ran-query-formulator[0] -> sorento-sub-respond-sendmsg-respond
sibling-gate[0] -> family-fetch
sibling-gate[1] -> dym-transform
sibling-probe[0] -> build-suggest-offer
sibling-transform[0] -> sibling-probe
sorento-sub-respond-findcontact-respond[0] -> is-human-intervened, if-transcribed-confirm
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
tag-out-of-scope[0] -> escalate-catalog
tf-message[0] -> sorento-sub-respond-findcontact-respond
tier-gate[0] -> If4
tier-probe[0] -> tier-probe-collect
tier-probe-collect[0] -> if-tier-has-any
tier-probe-plan[0] -> tier-probe
tool-filter[0] -> if-tier-ask
validator[0] -> promo-picker
whisper-transcribe[0] -> patch-transcript
```

## Read BY NAME (`$('x')` / `$("x")`)

> Rewiring alone does NOT redirect these. Repoint the expression too.

- **Aggregate** ← crossdomain-probe, disallowed-entity-gate, dym-probe, dym-probe-partial, not-found-error-message, probe-incoming, promo-dym-probe, resolve-entity-clarification, sibling-probe
- **Edit Fields2** ← validator
- **Loop Over Items1** ← send-message-video
- **Remove Duplicates** ← presign-fail-notice
- **Split Out** ← Switch
- **Switch** ← send-message-files, sorento-sub-respond-sendmsg-respond4
- **access-level-choice-message** ← compile-current-state, escalate-catalog
- **annotate-incoming-picker** ← escalate-catalog
- **build-cs-member-offer** ← compile-current-state
- **build-ideate-reply** ← compile-current-state
- **build-suggest-offer** ← compile-current-state, escalate-catalog
- **central-exchange** ← attach-merge, compile-current-state, dym-transform, dym-transform-partial
- **check-access** ← If5
- **construct-user-prompt** ← Basic LLM Chain
- **crossdomain-compose** ← Call 'sub-respond-save-message-redis'2, attach-merge, presign-fail-notice, sorento-sub-respond-sendmsg-presign-fail, sorento-sub-respond-sendmsg-respond2
- **crossdomain-render** ← attach-merge, crossdomain-compose
- **crossdomain-zeroset** ← compile-current-state, crossdomain-render
- **cs-roster-plan** ← build-cs-member-offer, compile-current-state
- **disallowed-entity-gate** ← Call 'sub-get-results', If-incoming-picker, If3, annotate-incoming-picker, build-suggest-offer, compile-current-state, cs-roster-plan, dym-transform, dym-transform-partial, escalate-catalog, family-fetch, not-found-error-message, probe-incoming, promo-picker, sibling-gate, sibling-transform, tier-probe, tool-filter
- **dym-annotate** ← build-suggest-offer
- **dym-transform** ← dym-probe, promo-dym-plan, promo-dym-probe
- **dym-transform-partial** ← dym-probe-partial
- **escalate-catalog** ← build-cs-member-offer, compile-current-state, cs-offer-gate
- **escalation-context** ← Call 'sub-human-intervention'
- **get-cs-members** ← build-cs-member-offer
- **get-session-vars** ← Call 'sub-query-reformulator', Call 'sub-respond-save-message-redis'2, compile-current-state, construct-user-prompt, crossdomain-zeroset, escalation-context, ideate-turn-http
- **ideate-turn-http** ← build-ideate-reply
- **is-human-intervened** ← transcribed-message
- **not-found-error-message** ← escalate-catalog
- **patch-transcript** ← send-transcript-confirm
- **probe-incoming** ← annotate-incoming-picker
- **promo-picker** ← compile-current-state
- **redis-pop-main-message-list** ← fetch-audio, if-transcribed-confirm, if-voice-allowed, patch-transcript, send-voice-not-allowed, sorento-sub-respond-findcontact-respond, sorento-sub-respond-sendmsg-presign-fail
- **resolve-entity** ← If3, build-suggest-offer, compile-current-state, crossdomain-zeroset, disallowed-entity-gate, dym-transform, dym-transform-partial, not-found-error-message, promo-picker
- **resolve-entity-clarification** ← construct-user-prompt
- **set-ran-query-formulator** ← sorento-sub-respond-sendmsg-respond
- **sibling-probe** ← build-suggest-offer
- **sibling-transform** ← build-suggest-offer, sibling-probe
- **sorento-sub-respond-findcontact-respond** ← Call 'sub-get-results', Call 'sub-human-intervention', Call 'sub-query-reformulator', Call 'sub-respond-save-message-redis'2, Execution Data, If7, check-access, compile-current-state, crossdomain-probe, dym-probe, dym-probe-partial, get-access-types, get-cs-members, get-session-vars, ideate-turn-http, is-human-intervened, probe-incoming, promo-dym-probe, resolve-entity, resolve-entity-clarification, save-session-vars, send-message-files, send-message-images, send-message-video, send-transcript-confirm, sibling-probe, sorento-sub-respond-sendmsg-presign-fail, sorento-sub-respond-sendmsg-respond, sorento-sub-respond-sendmsg-respond2, sorento-sub-respond-sendmsg-respond3, sorento-sub-respond-sendmsg-respond4, sorento-sub-respond-sendmsg-respond5, tier-probe
- **tf-message** ← Call 'sub-human-intervention', Call 'sub-query-reformulator', Call 'sub-respond-save-message-redis'2, Code in JavaScript, Transcribe a recording, construct-user-prompt, get-session-vars, ideate-turn-http, if-message-is-audio, patch-transcript, sorento-sub-respond-sendmsg-respond, sorento-sub-respond-sendmsg-respond-transcribed-message, sorento-sub-respond-sendmsg-respond2, sorento-sub-respond-sendmsg-respond4, sorento-sub-respond-sendmsg-respond5
- **tier-gate** ← Call 'sub-get-results', disallowed-entity-gate, if-tier-ask, tier-probe-collect, tier-probe-plan
- **tier-probe-collect** ← access-level-choice-message
- **tier-probe-plan** ← tier-probe-collect
- **tool-filter** ← Call 'sub-get-results', tier-probe
- **validator** ← If6, compile-current-state, crossdomain-render, sibling-gate
- **x** ← dym-transform, dym-transform-partial  ⚠️ TARGET NOT IN THIS WORKFLOW

## Zero inbound (orphaned / triggers)

- Code in JavaScript
- OpenAI Chat Model
- Schedule Trigger
- When Executed by Another Workflow
- presign-fail-notice
- sorento-sub-respond-sendmsg-respond3

## Sub-workflow calls

| node | workflowId | name |
|---|---|---|
| Call 'sub-get-results' | `rysSPgUssLDf6xJc` | sub-get-results TEST |
| Call 'sub-human-intervention' | `rrYXzE61gCNUck_zmXe-G` | sub-human-intervention |
| Call 'sub-query-reformulator' | `XTODTw-dJcV0uRdC056hG` | sub-semantic-parser |
| Call 'sub-respond-save-message-redis'2 | `UrETd-jm46tFj3Xw7w8vL` | sub-respond-save-message-redis |
| Execute 'sub-get-rag' | `tWP33QOFT7SxThfT` | sub-get-rag |
| crossdomain-probe | `Fss5aAaXthJSWpZCgKiKR` | sub-get-results |
| dym-probe | `Fss5aAaXthJSWpZCgKiKR` | sub-get-results |
| dym-probe-partial | `Fss5aAaXthJSWpZCgKiKR` | sub-get-results |
| probe-incoming | `rysSPgUssLDf6xJc` | sub-get-results TEST |
| promo-dym-probe | `Fss5aAaXthJSWpZCgKiKR` | sub-get-results |
| send-transcript-confirm | `aoydkG1dbItXR5jXFEQsP` | sorento-sub-respond-sendmsg-respond |
| send-voice-not-allowed | `aoydkG1dbItXR5jXFEQsP` | sorento-sub-respond-sendmsg-respond |
| sibling-probe | `Fss5aAaXthJSWpZCgKiKR` | sub-get-results |
| sorento-sub-respond-sendmsg-presign-fail | `aoydkG1dbItXR5jXFEQsP` | sorento-sub-respond-sendmsg-respond |
| sorento-sub-respond-sendmsg-respond | `aoydkG1dbItXR5jXFEQsP` | sorento-sub-respond-sendmsg-respond |
| sorento-sub-respond-sendmsg-respond-transcribed-message | `aoydkG1dbItXR5jXFEQsP` | sorento-sub-respond-sendmsg-respond |
| sorento-sub-respond-sendmsg-respond2 | `aoydkG1dbItXR5jXFEQsP` | sorento-sub-respond-sendmsg-respond |
| sorento-sub-respond-sendmsg-respond3 | `aoydkG1dbItXR5jXFEQsP` | sorento-sub-respond-sendmsg-respond |
| sorento-sub-respond-sendmsg-respond4 | `aoydkG1dbItXR5jXFEQsP` | sorento-sub-respond-sendmsg-respond |
| sorento-sub-respond-sendmsg-respond5 | `aoydkG1dbItXR5jXFEQsP` | sorento-sub-respond-sendmsg-respond |
| tier-probe | `rysSPgUssLDf6xJc` | sub-get-results TEST |

## Credentials (references only — no secrets)

| node | type | credential |
|---|---|---|
| OpenAI Chat Model | openAiApi | sorento-openai |
| Transcribe a recording | openAiApi | sorento-openai |
| check-access | httpHeaderAuth | crm-n8n-auth |
| family-fetch | httpHeaderAuth | crm-n8n-auth |
| get-access-types | httpHeaderAuth | crm-n8n-auth |
| get-cs-members | httpHeaderAuth | crm-n8n-auth |
| get-presigned-url | httpHeaderAuth | crm-n8n-auth |
| get-session-vars | httpHeaderAuth | crm-n8n-auth |
| ideate-turn-http | httpHeaderAuth | crm-n8n-auth |
| redis-pop-main-message-list | redis | sorento-redis |
| resolve-entity | httpHeaderAuth | crm-n8n-auth |
| resolve-entity-clarification | httpHeaderAuth | crm-n8n-auth |
| save-session-vars | httpHeaderAuth | crm-n8n-auth |
| send-message-files | respondIoApi | sorento-api |
| send-message-images | respondIoApi | sorento-api |
| send-message-video | respondIoApi | sorento-api |
| update-human-intervened | respondIoApi | sorento-api |
| whisper-transcribe | openAiApi | sorento-openai |

## Code nodes (bodies exported to `nodes/`)

| node | lines |
|---|---|
| compile-current-state | 684 |
| promo-picker | 575 |
| build-suggest-offer | 557 |
| disallowed-entity-gate | 496 |
| dym-transform | 417 |
| dym-transform-partial | 410 |
| not-found-error-message | 403 |
| tier-gate | 195 |
| crossdomain-render | 181 |
| dym-annotate | 169 |
| dym-annotate-partial | 144 |
| crossdomain-zeroset | 143 |
| build-cs-member-offer | 107 |
| access-level-choice-message | 95 |
| escalate-catalog | 89 |
| crossdomain-compose | 86 |
| presign-fail-notice | 62 |
| tool-filter | 59 |
| attach-merge | 51 |
| escalation-context | 51 |
| sibling-transform | 47 |
| tier-probe-collect | 47 |
| validator | 46 |
| promo-dym-plan | 37 |
| annotate-incoming-picker | 35 |
| tier-probe-plan | 33 |
| patch-transcript | 29 |
| central-exchange | 28 |
| construct-user-prompt | 25 |
| cs-roster-plan | 21 |
| build-ideate-reply | 15 |
| transcribed-message | 5 |
| tf-message | 5 |
| set-ran-query-formulator | 5 |
| set-human-intervened | 3 |
| Code in JavaScript | 3 |
| sorento-sub-respond-findcontact-respond | 1 |
