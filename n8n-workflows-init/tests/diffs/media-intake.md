# Node diff — media intake (clone `txiPzSxy3Pclsz6v` ONLY; live untouched)

Plan `../../plans/media-intake-plan.md` · UAC `../media-intake-UAC.md` · bodies `media-intake/` · builder
`../media-intake/build-clone.py` (fresh GET → refuse unless `versionId == --expect-version` → one REST PUT of
`{name,nodes,connections,settings:{executionOrder}}` → PUT auto-activates → sha-verify every jsCode vs repo file).

| | before | after |
|---|---|---|
| clone versionId | `6380c2ac-d310-48b7-b077-38ac003412a4` (171 nodes; `updatedAt 2026-08-19T00:32:38Z`) | `2f36a7f4-e497-4a67-b5a7-969229df9a00` (183 nodes; activeVersionId == versionId) |
| backup | `../backups/media-intake/CLONE-txiPzSxy3Pclsz6v-6380c2ac-PRE.json` (full GET, byte-exact) | `../backups/media-intake/CLONE-txiPzSxy3Pclsz6v-2f36a7f4-POST-payload.json` (the PUT payload) |
| live spine `9qVyfUxmRQqrpGRMDLRuz` | `3058796a-eee5-4d25-aa76-13ce97bd47e9` (127 nodes, read-only reference) | **unchanged** |

Concurrent-edit guard: the PUT was made against the exact `6380c2ac` bytes fetched minutes earlier (builder refuses
otherwise). Rollback = PUT the PRE backup back (one call).

## Removed (5) — the legacy Whisper voice lane (kept in the PRE backup)

`if-audio-in` (If: attachment.type=="audio"), `if-voice-allowed` (If: respond.io `is_allowed_voice` custom field),
`if-audio-mock` (clone mock gate for `mock_transcript`), `fetch-audio` (HTTP GET of the respond CDN url → binary),
`send-voice-not-allowed` (sendmsg "Voice messages aren't supported for your account yet — please type your message instead.").

`whisper-transcribe` (OpenAI audio.transcribe, `sorento-openai`) is KEPT but now reachable ONLY from the zz-chat
console lane (`if-audio-b64` → `decode-audio-b64` → `whisper-transcribe` → `console-whisper-adapter`). Not promoted.

## Added (17)

| node | type | role | promotes? |
|---|---|---|---|
| `detect-media` | Code (`detect-media.js` `544ff66d`) | classify modality, media_url, mime, caption, bytes, duration_ms(+source), ids; item passthrough + `_media` | yes |
| `if-media-in` | If `={{ $json._media && $json._media.modality ? true : false }}` | media vs text | yes |
| `media-egress-gate` | If `test_run_id && scope!=='chat-ui'` | harness: mock vs real CRM call | **no** (clone-only) |
| `media-extract-mock` | Code (`41c1b7cd`) | fail-closed mock of POST /media/process (`mock_media_response` / default) | **no** |
| `media-extract-http` | HTTP POST `https://fe-sorento.foundryx.my/api/v1/external/media/process`, cred `crm-n8n-auth`, body `media-extract-http.jsonBody.expr.txt` (`c015774a`), timeout 40000, retryOnFail maxTries 2 wait 1000, onError continueRegularOutput | the real call | yes |
| `media-extract` | NoOp | join (mock/real) → one name | yes |
| `media-route` | Code (`media-route.js` `69d00cfc`) | decision/status/notice → action continue/reply/poll/silent; CRM fallback copy | yes |
| `if-media-poll` | If `$json.action === 'poll'` | | yes |
| `wait-media-poll` | Wait v1.1 `amount = {{ $json.poll_wait_s }}` s | 6 s between polls; 0 s for the failed-notice fetch | yes |
| `media-poll-gate` | If (same expr as egress gate) | harness | **no** |
| `media-poll-mock` | Code (`2f2716ec`) | `mock_media_poll[$runIndex]` | **no** |
| `media-poll-http` | HTTP GET `…/media/jobs/{{ $json.job_id }}`, 15000, continueRegularOutput | the poll | yes |
| `media-poll-merge` | Code (`8d9daaf8`) | job body → response shape, `_poll_n = $runIndex+1`, absorbs a failed poll; loops to `media-route` | yes |
| `if-media-ok` | If `$json.action === 'continue'` | | yes |
| `if-media-reply` | If `$json.action === 'reply'` (FALSE = silent, explicitly empty) | | yes |
| `send-media-reply` | executeWorkflow → clone sendmsg fork `aQUmwMVplmNcyUVc`, `is_test:true`, `test_run_id`, message `={{ $json.reply_text }}`, input_message `[voice note|image] {messageId}` | the refusal/clarification/failure reply | yes — live: `aoydkG1dbItXR5jXFEQsP`, **strip `is_test`/`test_run_id`** |
| `console-whisper-adapter` | Code (`7852413a`) | Whisper `{text}` → media-route item shape (console lane) | **no** |

## Changed (3)

| node | what | file |
|---|---|---|
| `patch-transcript` (Code, same id/name/position) | body rewritten: reads `$json.rendered_text`/`confirmation_text` (media-route item) instead of Whisper `$json.text`; folds into E.text, flips `E.type`/`attachment.type` to `text`, keeps `source_url`+`source_type`, sets `message._transcribed/_transcript/_media` | `media-intake/patch-transcript.js` `7fbdcbe4` |
| `if-transcribed-confirm` (If) | leftValue `attachment.type == 'audio'` → `={{ $('patch-transcript').isExecuted && ((…json.message._media || {}).confirmation_text ? true : false) }}` (boolean/true, loose) — fires for voice AND image, only when the CRM gave a confirmation; evaluates clean when patch-transcript did not run (MI-13) | `if-transcribed-confirm.expr.txt` `0cf84d99` |
| `send-transcript-confirm` (executeWorkflow) | `message` `'🎤 Here is what I heard:\n\n"' + _transcript + '"'` → `={{ $('patch-transcript').first().json.message._media.confirmation_text }}` (CRM text + appended notices); other inputs unchanged | `send-transcript-confirm.message.expr.txt` `827cadea` |

## Connections

Rewired: `redis-pop-main-message-list → detect-media` (was `→ if-audio-in`); `if-audio-b64[1] → tf-message` (was
`→ fetch-audio`); `whisper-transcribe → console-whisper-adapter` (was `→ patch-transcript`). New edges as in the plan §2
diagram. Unchanged: `patch-transcript → tf-message`; `sorento-sub-respond-findcontact-respond → if-transcribed-confirm →
send-transcript-confirm`.

## Not touched

`if-message-is-audio`, `Transcribe a recording`, `transcribed-message`, `sorento-sub-respond-sendmsg-respond-transcribed-message`
(dead TRUE arm, as before), all 5 orphaned egress nodes, every sub fork, the parser fork, `tf-message` and everything
downstream. Validation warnings: the same pre-existing set (LESSONS #13) plus new `DISCONNECTED_NODE`-free graph.

## Live promotion payload (to be assembled at promote time from a FRESH live GET — captain-gated)

= Added(yes) + Changed(3) + Removed(5 minus `if-audio-mock` which live never had) + edges, with `send-media-reply`
re-pointed to `aoydkG1dbItXR5jXFEQsP` and its `is_test`/`test_run_id` inputs dropped, `if-media-in[1] → tf-message`
directly (no console lane). See plan §6.
