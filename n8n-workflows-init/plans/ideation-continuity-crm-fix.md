# Bug + Fix Handoff — Ideation turn endpoint loses draft continuity

**To:** Sorento CRM backend team
**From:** n8n integration (chatbot spine)
**Date:** 2026-07-24
**Component:** `POST /api/v1/external/ideation/turn`
**Severity:** High — the ideation feature never accumulates. Every follow-up turn starts a brand-new draft, so no idea is ever collected end-to-end.

---

## 1. Symptom

When a user submits an idea over WhatsApp and the bot asks a follow-up question ("Still need: Department."), the user's answer does **not** continue the existing draft. Instead:

- a **new `draft_id`** is minted every turn;
- the running **transcript is reset** to just the current message;
- the follow-up answer is **re-parsed as a fresh idea's problem statement**.

The collection loop can therefore never complete — it restarts on each message.

### Observed (live, contact `437264483`)

Turn 1 — user sends the full idea in one message. CRM correctly creates a draft:

```
draft_id   : 94a75411-f679-4146-a87f-cb4b7cf4658c
status     : collecting
missing    : ["department"]
transcript : ["I have an idea, I want to send the escalation ticket even during
              off working hours ... giving them a peace of mind"]
```

Turn 2 — user answers `"departmetn is for general"`. Expected: fill `department`, keep the same draft. Actual CRM response:

```
draft_id   : 4090aeb1-9cb6-4be9-8f53-92ecae4cd819   ← NEW draft
status     : collecting
missing    : ["proposed_solution","impact"]          ← reset
transcript : ["departmetn is for general"]           ← reset (original idea dropped)
reply      : "Problem statement: departmetn is for general / Department: general /
              Still need: Proposed solution, Impact."
```

Evidence: n8n spine execution `9806315` (parser sub `9806316`) on
`https://automate-sorento.foundryx.my`.

---

## 2. Root cause

The endpoint **ignores the session state n8n sends it**, and the state in the CRM's own DB is not in the shape the endpoint reads.

Two independent defects combine:

### 2a. The request schema drops `session_vars`

n8n's request body includes the prior ideation pointer:

```json
{
  "respond_io_id": "437264483",
  "message_text": "departmetn is for general",
  "session_vars": { "ideation": { "draft_id": "94a75411-...", "status": "collecting",
                                   "missing": ["department"], "transcript": ["..."] } },
  "submitter_name": "..."
}
```

But `IdeationTurnRequest` (`app/schemas/external/ideation.py`) declares no
`session_vars` field. Pydantic silently discards it at parse time. The endpoint
never sees the pointer n8n hands it.

### 2b. `handle_turn` re-reads its own DB copy, which is in a different shape

Because the request pointer is gone, `handle_turn`
(`app/services/ideation_turn_service.py`) falls back to reading the draft from the
contact's stored `session_vars`:

```python
session_vars   = contact.session_vars
ideation_state = session_vars.get("ideation")   # TOP-LEVEL key
draft_id       = ideation_state.get("draft_id")
```

That read looks at **top-level** `session_vars["ideation"]`. But n8n — the owner of
`session_vars` and the **last writer each turn** — persists the whole blob **nested
under `variables`**:

```
session_vars = { "variables": { "ideation": {...}, ...all other keys }, "user_response": ... }
```

n8n's end-of-turn `PUT /conversation-variables/{id}` overwrites the entire
`respond_contacts.session_vars` column with this nested shape. Any top-level
`ideation` the endpoint wrote mid-turn is gone. So on the next turn,
`session_vars.get("ideation")` is `None` → `draft_id` is `None` → the endpoint treats
the turn as turn 1 → new draft.

### Why n8n's own view looks fine (but isn't)

n8n reads back with `sv.variables.ideation || sv.ideation`, so its state *appears*
continuous — it just mirrors whatever fresh draft the endpoint returns each turn.
The `draft_id` keeps changing and fields never accumulate.

---

## 3. What n8n already does correctly (no n8n change needed)

- **Sends the pointer.** `ideate-turn-http` builds `session_vars.ideation` from the
  loaded state (shape-tolerant: `(sv.variables && sv.variables.ideation) || sv.ideation`).
- **Reads the reply back shape-tolerantly.** `build-ideate-reply` accepts the
  returned `ideation` whether it is top-level or under `variables`.
- **Is the single session_vars writer.** n8n owns persistence via
  `PUT /conversation-variables/{id}` (the "centralized save" design).

The fix is CRM-side only.

---

## 4. Fix — trust the caller-supplied ideation pointer

Make the endpoint read the prior draft from the `session_vars` n8n sends, instead of
re-reading (and mis-shaping) the DB copy. Three small hunks.

### Hunk 1 — accept the field · `app/schemas/external/ideation.py`

```python
class IdeationTurnRequest(BaseModel):
    ...
    session_vars: dict[str, Any] | None = Field(
        None,
        description=(
            "Caller-supplied session state. The ideation pointer is read from "
            "session_vars.ideation (or session_vars.variables.ideation). n8n is the "
            "owner/writer of session_vars; the endpoint should trust this over its DB copy."
        ),
    )
```

### Hunk 2 — pass it through · `app/api/v1/external/ideation.py`

```python
result = handle_turn(
    db,
    respond_io_id=payload.respond_io_id,
    message_text=payload.message_text,
    submitter_name=payload.submitter_name,
    media_selection=payload.media_selection,
    is_new_idea=payload.is_new_idea,
    session_vars_in=payload.session_vars,   # NEW
)
```

### Hunk 3 — derive the draft from the caller first · `app/services/ideation_turn_service.py`

```python
def handle_turn(
    db, *, respond_io_id, message_text, submitter_name=None,
    media_selection=None, is_new_idea=None,
    session_vars_in=None,                    # NEW
    media_clients=None, fetch_recent_messages=None,
) -> dict[str, Any]:
    contact = _get_contact_row(db, respond_io_id)   # keep: phone + display_name only

    caller_sv = session_vars_in or {}
    ideation_state = (
        caller_sv.get("ideation")
        or (caller_sv.get("variables") or {}).get("ideation")   # shape-tolerant
        or contact.session_vars.get("ideation")                 # legacy fallback
        or {}
    )

    draft_id        = ideation_state.get("draft_id")
    prior_status    = ideation_state.get("status")
    prior_missing   = ideation_state.get("missing") or []
    prior_transcript = ideation_state.get("transcript") or []
    pending_media   = ideation_state.get("pending_media") or None
    seen_media_ids  = set(ideation_state.get("seen_media_ids") or [])
    ...
```

Everything downstream already derives from these locals — no further change.

### Optional Hunk 4 — make n8n the single writer

The endpoint currently also does its own `overwrite_for_contact(...)` write of a
top-level `ideation`. Once the read trusts the caller, that write is redundant (n8n's
`PUT /conversation-variables` is authoritative and runs after). Recommend dropping the
endpoint's own ideation write to avoid two writers competing on the same column. Not
required for correctness — the read fix alone resolves the bug.

---

## 5. Note on `is_new_idea` (currently dead)

`is_new_idea` is wired end-to-end in the CRM (schema → `handle_turn` DC-10 restart),
but n8n **never sends it** — the parser has no such field yet. So the "start a fresh
draft" path is unreachable today. Out of scope for this fix; flagging so it isn't
assumed live. If/when new-idea-mid-draft detection is wanted, it needs a parser signal
on the n8n side first.

---

## 6. Acceptance test

Two-turn WhatsApp (or chat-console) conversation on one contact:

1. **Turn 1** — send a full idea. Assert response `status:"collecting"`, a `draft_id`
   `D1`, `missing` non-empty (e.g. `["department"]`), `transcript` length 1.
2. **Turn 2** — answer the outstanding question (e.g. `"department is general"`).
   Assert:
   - `draft_id == D1` (unchanged — **the core assertion**);
   - the answered field is no longer in `missing`;
   - `transcript` length 2 (original idea + this answer, accumulated);
   - the reply reflects the **combined** draft, not a re-parsed fresh idea.
3. Complete the remaining fields → `status:"complete"` with the same `D1` and a link.

Regression guard: the request now carries `session_vars`; confirm a request **without**
`session_vars` still works via the `contact.session_vars` fallback (Hunk 3, last
`or`), so older callers don't break.

---

## 7. Contacts / references

- n8n spine (live): `sorento-consume-main` `9qVyfUxmRQqrpGRMDLRuz`
- Nodes involved: `get-session-vars`, `ideate-turn-http`, `build-ideate-reply`,
  `compile-current-state`, `save-session-vars`
- Live evidence execution: `9806315` (2026-07-24)
- CRM files: `app/schemas/external/ideation.py`,
  `app/api/v1/external/ideation.py`, `app/services/ideation_turn_service.py`
