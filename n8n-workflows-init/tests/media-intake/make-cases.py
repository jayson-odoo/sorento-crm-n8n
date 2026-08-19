#!/usr/bin/env python3
"""Emit the media-intake UAC case files (tests/media-intake/cases/MI-*.json).

Every item is the zz-canary-seed shape (deep nesting message.message.message.{text,type,
attachment} — LESSONS #12) with the harness controls at the item root:
  test_run_id / scope / mode            -> clone routing (uac: egress blocked, real CRM reads)
  mock_reformulator_output              -> 0-token parser bypass (deterministic tier)
  mock_media_response                   -> media-extract-mock body (the CRM POST response)
  mock_media_poll                       -> media-poll-mock bodies, one per poll (GET /jobs/{id})
Omit mock_reformulator_output for the parser-tier case (real fork run, is_test=true).
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "cases")
DATE = sys.argv[1] if len(sys.argv) > 1 else "20260819"

CONTACT = {"id": "437264483", "phone": "60100000000", "firstName": "Jayson", "lastName": "Canary",
           "custom_fields": [{"name": "is_human_intervened", "value": "false"}, {"name": "is_allowed_stock", "value": "true"}],
           "assignee": {"id": None}}

VOICE_ATT = {"type": "audio", "url": "https://cdn.chatapi.net/whatsapp_business/453209/505042987/uac-voice-note.ogg",
             "isPending": False, "fileName": "uac-voice-note.ogg", "mimeType": "audio/ogg; codecs=opus", "ext": "ogg",
             "size": 40000, "mime": "audio/ogg"}
IMAGE_ATT = {"type": "image", "url": "https://cdn.chatapi.net/whatsapp_business/453209/505042987/0d61c8b1460da0da9eb75bf946a34e9bimage1787030003532",
             "isPending": False, "fileName": "image1787030003532", "mimeType": "image/jpeg", "ext": "jpg", "size": 153739, "mime": "image/jpeg"}
FILE_ATT = {"type": "file", "url": "https://cdn.chatapi.net/whatsapp_business/453209/505043295/e35b441b2120a37e980d2ee7ec3ee30bMAP5045C-NG.pdf",
            "isPending": False, "fileName": "MAP5045C-NG.pdf", "mimeType": "application/pdf", "ext": "pdf", "size": 985325, "mime": "application/pdf"}

ORDER_MOCK = {"message_type": "business_query", "domain_hint": "order", "intent_hint": "check_order", "user_goal": "any order for MUB6201",
              "entities": [{"raw": "MUB6201", "hint": "product", "current_message": True}], "access_levels": [],
              "routing": {"suggested_team": "customer_service", "suggested_agent": "order_enquiries"},
              "escalation": {"is_escalation_confirmation": False}, "correction": False, "date_mode": None, "query_scope": None,
              "match_mode": None, "contains_flyer": False, "date_filter_start": None, "date_filter_end": None}
STOCK_MOCK = dict(ORDER_MOCK, domain_hint="inventory", intent_hint="check_stock", user_goal="check stock for these: MUB6201",
                  routing={"suggested_team": "warehouse", "suggested_agent": "general_enquiries"})
NSD_MOCK = {"message_type": "business_query", "intent_hint": "goods_receive_status", "domain_hint": "goods_receive",
            "user_goal": "What is the weather in KL today", "access_levels": [], "entities": [],
            "escalation": {"is_escalation_confirmation": False}, "correction": False,
            "routing": {"suggested_team": "purchasing", "suggested_agent": "general_enquiries"}, "date_mode": None,
            "query_scope": None, "match_mode": None, "contains_flyer": False, "date_filter_start": None, "date_filter_end": None}

QUOTA = {"used": 41, "limit": 50, "remaining": 9, "period_key": "2026-08", "resets_on": "1 September"}
W = {  # CRM wording.py, byte-exact
    "not_enabled_voice": "I cannot listen to voice notes on this number yet. Type your message instead and I will help straight away.",
    "not_enabled_image": "I cannot read photos on this number yet. Type the codes instead and I will look them up straight away.",
    "too_long_120": "That voice note is longer than 120 seconds. Please send a shorter one and I will listen to it.",
    "burst": "That is a lot at once - give me a moment to catch up, then send the rest.",
    "quota_image": "You have used all 50 of this month's photo reads, so I have not read this one. The allowance resets on 1 September. Type the codes and I will look them up straight away.",
    "warn_image": "You have 9 of 50 photo reads left this month. The allowance resets on 1 September.",
    "degraded_image": "I am reading this one with a simpler model and may get it wrong, so typing the codes is exact. This month's full-accuracy photo reads are used up and the allowance resets on 1 September.",
    "voice_unclear": "I could not make out that voice note. Please send it again or type your message and I will help straight away.",
    "nothing_read": "I could not read anything from that photo. Type the codes and I will look them up straight away.",
}


def resp(decision="accepted", status="completed", job_id="mock-job-1", tier="standard", notices=None, result=None, error=None, replay=False, voice=True):
    return {"job_id": job_id if decision == "accepted" else None, "decision": decision, "status": status if decision == "accepted" else None,
            "idempotent_replay": replay, "tier": tier if decision == "accepted" else None, "quota": QUOTA, "notices": notices or [],
            "language_strategy": {"mode": "pinned", "language": "en"} if voice else None, "result": result, "error": error, "_mock": True}


def voice_result(text):
    return {"entities": [], "attributes": [], "conflicts": [], "image_kind": None, "caption_intent": None, "notes": None,
            "needs_clarification": False, "truncated": False, "rendered_text": text,
            "confirmation_message": 'Here is what I heard: "%s"' % text, "clarification_message": None,
            "transcript": text, "languages_detected": ["en"]}


def image_result(caption, raws, conf):
    return {"entities": [{"raw": r, "hint": "product", "current_message": True, "confident": True} for r in raws], "attributes": [],
            "conflicts": [], "image_kind": "label", "caption_intent": caption, "notes": None, "needs_clarification": False,
            "truncated": False, "rendered_text": ("%s: %s" % (caption, ", ".join(raws))) if raws else caption,
            "confirmation_message": conf, "clarification_message": None, "transcript": None, "languages_detected": None}


def item(run, E, media=None, poll=None, parser=NSD_MOCK, mode="uac", extra=None):
    it = {"message": {"message": {"message": E}, "replyTo": {}}, "contact": CONTACT,
          "messageId": "178391878600%04d" % (abs(hash(run)) % 10000), "replyTo": None,
          "test_run_id": run, "scope": "deterministic", "mode": mode}
    if parser is not None:
        it["mock_reformulator_output"] = parser
    if media is not None:
        it["mock_media_response"] = media
    if poll is not None:
        it["mock_media_poll"] = poll
    if extra:
        it.update(extra)
    return it


def E_voice():
    return {"type": "attachment", "text": None, "attachment": dict(VOICE_ATT)}


def E_image(caption=None):
    return {"type": "attachment", "text": caption, "attachment": dict(IMAGE_ATT)}


def E_text(text):
    return {"text": text, "type": "text", "attachment": {"type": "text", "description": ""}}


TRANSCRIPT = "any order for MUB6201"
CASES = {}

def add(code, title, E, expect, **kw):
    run = "UAC-MI-%s-%s" % (code, DATE)
    CASES[code] = {"_case": "MI-%s %s" % (code, title), "_expect": expect, "item": item(run, E, **kw)}

add("01", "voice happy — transcript enters the intent pipeline (orders, real CRM read)", E_voice(),
    {"route": "continue/completed", "tf_text": TRANSCRIPT, "confirm": 'Here is what I heard: "%s"' % TRANSCRIPT, "reply": "orders answer for MUB6201 (sendmsg would_send)", "egress": "would_send only"},
    media=resp(result=voice_result(TRANSCRIPT)), parser=ORDER_MOCK)
add("02", "image + caption happy, warn_80 appended to the confirmation (stock, real CRM read)", E_image("check stock for these"),
    {"route": "continue/completed", "tf_text": "check stock for these: MUB6201", "confirm": "I read MUB6201 from that photo. Is that right?\n\n" + W["warn_image"], "reply": "stock answer for MUB6201"},
    media=resp(notices=[{"kind": "warn_80", "text": W["warn_image"], "append": True}], result=image_result("check stock for these", ["MUB6201"], "I read MUB6201 from that photo. Is that right?"), voice=False),
    parser=STOCK_MOCK)
add("03", "captionless image -> needs_clarification -> CRM question, turn ENDS before the pipeline", E_image(None),
    {"route": "reply/needs_clarification", "reply_text": "I read MUB6201 and batch number YG2539 from that photo. What would you like me to do with it?", "tf_message": "NOT executed"},
    media=resp(result=dict(image_result(None, ["MUB6201"], None), rendered_text=None, needs_clarification=True, clarification_message="I read MUB6201 and batch number YG2539 from that photo. What would you like me to do with it?"), voice=False))
add("04", "denied_gate voice (media access not enabled for the contact) -> not_enabled notice", E_voice(),
    {"route": "reply/denied_gate", "reply_text": W["not_enabled_voice"]},
    media=resp(decision="denied_gate", notices=[{"kind": "not_enabled", "text": W["not_enabled_voice"], "append": True}]))
add("05", "denied_quota image (no degraded model configured) -> quota_exhausted notice", E_image("stock?"),
    {"route": "reply/denied_quota", "reply_text": W["quota_image"]},
    media=resp(decision="denied_quota", notices=[{"kind": "quota_exhausted", "text": W["quota_image"], "append": True}], voice=False))
add("06", "denied_duration voice (clip over the cap by the duration_ms hint) -> too_long notice", E_voice(),
    {"route": "reply/denied_duration", "reply_text": W["too_long_120"]},
    media=resp(decision="denied_duration", notices=[{"kind": "too_long", "text": W["too_long_120"], "append": True}]))
add("07a", "denied_burst first-in-window -> pacing notice", E_image("a"),
    {"route": "reply/denied_burst", "reply_text": W["burst"]},
    media=resp(decision="denied_burst", notices=[{"kind": "burst", "text": W["burst"], "append": True}], voice=False))
add("07b", "denied_burst suppressed (notice already shown this window) -> SILENT, nothing sent", E_image("b"),
    {"route": "silent/denied_burst_suppressed", "sendmsg": "NONE"},
    media=resp(decision="denied_burst", notices=[], voice=False))
add("08", "transport failure (HTTP node error / timeout, no decision) -> CRM fallback copy, turn never wedges", E_voice(),
    {"route": "reply/transport", "reply_text": W["voice_unclear"]},
    media={"error": {"message": "The connection timed out", "name": "NodeApiError", "description": "mock of onError=continueRegularOutput"}})
add("09", "status pending -> poll(6s) pending -> poll(6s) completed -> continue", E_voice(),
    {"route": ["poll/pending", "poll/pending", "continue/completed"], "tf_text": TRANSCRIPT},
    media=resp(status="pending", result=None),
    poll=[{"job_id": "mock-job-1", "status": "pending", "result": None, "notices": [], "error": None},
          {"job_id": "mock-job-1", "status": "completed", "tier": "standard", "result": voice_result(TRANSCRIPT), "notices": [], "error": None}],
    parser=ORDER_MOCK)
add("10", "status pending exhausted (2 polls still pending) -> fallback reply", E_voice(),
    {"route": ["poll/pending", "poll/pending", "reply/pending_exhausted"], "reply_text": W["voice_unclear"]},
    media=resp(status="pending", result=None),
    poll=[{"job_id": "mock-job-1", "status": "pending"}, {"job_id": "mock-job-1", "status": "pending"}])
add("11", "status failed (worker measured clip over cap) -> immediate poll fetches the ledger too_long notice; internal error NOT leaked", E_voice(),
    {"route": ["poll/failed", "reply/failed"], "reply_text": W["too_long_120"], "must_not_contain": "151 seconds"},
    media=resp(status="failed", result=None, error="The voice note is 151 seconds, over the 120 second limit."),
    poll=[{"job_id": "mock-job-1", "status": "failed", "result": None, "notices": [{"kind": "too_long", "text": W["too_long_120"], "append": True}], "error": "The voice note is 151 seconds, over the 120 second limit."}])
add("11b", "status failed (provider failure, no refusal notice) -> CRM fallback, internal error NOT leaked", E_image("stock?"),
    {"route": ["poll/failed", "reply/failed"], "reply_text": W["nothing_read"], "must_not_contain": "502"},
    media=resp(status="failed", result=None, error="The vision model call failed: 502", voice=False),
    poll=[{"job_id": "mock-job-1", "status": "failed", "result": None, "notices": [], "error": "The vision model call failed: 502"}])
add("12", "degraded tier (at quota, degraded model configured) -> continue, degraded notice appended to the confirmation", E_image("check stock for these"),
    {"route": "continue/completed", "tf_text": "check stock for these: MUB6201", "confirm": "I read MUB6201 from that photo. Is that right?\n\n" + W["degraded_image"]},
    media=resp(tier="degraded", notices=[{"kind": "degraded", "text": W["degraded_image"], "append": True}], result=image_result("check stock for these", ["MUB6201"], "I read MUB6201 from that photo. Is that right?"), voice=False),
    parser=STOCK_MOCK)
add("13", "REGRESSION: plain text turn -> modality null -> tf-message -> not-supported reply byte-identical to today", E_text("What is the weather in KL today"),
    {"route": "n/a (if-media-in FALSE)", "tf_text": "What is the weather in KL today", "reply": "not-supported canned reply"})
add("14", "REGRESSION: pdf/file attachment is NOT media for this lane -> falls through exactly as today", {"type": "attachment", "text": None, "attachment": dict(FILE_ATT)},
    {"route": "n/a (if-media-in FALSE)", "media_lane": "not executed"})
add("15", "PARSER TIER: voice transcript through the REAL parser fork (no reformulator mock) -> answered as if typed", E_voice(),
    {"route": "continue/completed", "tf_text": TRANSCRIPT, "reformulator": "real fork run; domain order/check_order expected", "reply": "orders answer for MUB6201"},
    media=resp(result=voice_result(TRANSCRIPT)), parser=None)

os.makedirs(OUT, exist_ok=True)
for code, c in CASES.items():
    p = os.path.join(OUT, "MI-%s.json" % code)
    with open(p, "w", encoding="utf-8") as fh:
        json.dump(c, fh, ensure_ascii=False, indent=1)
print("wrote %d cases to %s" % (len(CASES), OUT))
