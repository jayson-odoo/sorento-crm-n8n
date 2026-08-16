# P-BASE — pre-change baseline for `tool-loop-removal` (UAC §TL)

Captured 2026-08-03 on clone `txiPzSxy3Pclsz6v` at **pre-change version `6d479172-50e4-4be3-9e88-895a86b2701b`**
(both `Split Out1` and `Loop Over Items` still present — verified immediately before AND after capture).
Driver: `tests/harness/drive-clone.py`, mode `uac`, contact 437264483. §0 clean: 3 `would_*` guards per run, no real egress.

UAC §TL marks P-BASE **blocking, run BEFORE the edit**. §TL-AGG and §TL-M-BYTE diff against these values.
Post-change the loop is gone, so `Loop Over Items` runs go 2 → 0 and `If6` out1 feeds `Aggregate1` directly;
everything below must be **byte-identical** anyway.

---

## §TL-M1 inventory miss — exec `11067200`

Input: `check stock SRTWC286-SH-NEW-200`

| field | value |
|---|---|
| startedAt | 2026-08-03T12:26:25.296Z |
| tool selected | `crm_inventory_stock_balance_list` |
| validator runs | 1 |
| Loop Over Items runs | 2 |
| Aggregate1 runs | 1 |
| not-found-error-message runs | 1 |
| crossdomain-probe runs | 1 |

### `Aggregate1` output json (§TL-AGG gate)
```json
{
  "response_intro": [
    "No matching results found."
  ]
}
```

### `user_response` (§TL-M-BYTE gate) — exact, trailing whitespace significant
```
No stock for SRTWC286-SH-NEW-200.
But there is INCOMING stock (ETA) for the requested products:

- *Product Code:* SRTWC286-SH-NEW-200
*Container:* FFAU3176932
*Estimated Arrival Date:* 2026-07-22
*Incoming Quantity:* 200
🚩  *(PENDING ALLOCATION)*

Try: SRTWC286-SH-NEW, SRTWC286-SH-NEW-P, SRTWC286-SH-NEW-150. Reply with a code to continue, or would you like me to escalate to warehouse team?
```

sha256 of user_response: `a138e89b4b0b8445599c21f0602bf58836e6820f1f95c364d6cb98c7219fe6a6`

---

## §TL-M2 incoming miss — exec `11067219`

Input: `check eta SRTWT5800`

| field | value |
|---|---|
| startedAt | 2026-08-03T12:26:34.318Z |
| tool selected | `crm_incoming_stock_list` |
| validator runs | 1 |
| Loop Over Items runs | 2 |
| Aggregate1 runs | 1 |
| not-found-error-message runs | 1 |
| crossdomain-probe runs | 1 |

### `Aggregate1` output json (§TL-AGG gate)
```json
{
  "response_intro": [
    "No matching results found."
  ]
}
```

### `user_response` (§TL-M-BYTE gate) — exact, trailing whitespace significant
```
No incoming stock (ETA) found for SRTWT5800.
But there is stock ON HAND for the requested products:

- *Product Code:* SRTWT5800
*Warehouse:* BUKIT RAJA
*System Location:* BRW
*Quantity On Hand:* 316

- *Product Code:* SRTWT5800
*Warehouse:* BUKIT RAJA
*System Location:* BRW-NTC
*Quantity On Hand:* 236

- *Product Code:* SRTWT5800
*Warehouse:* BUKIT RAJA
*System Location:* BRW-AM
*Quantity On Hand:* 7

- *Product Code:* SRTWT5800
*Warehouse:* BUKIT RAJA
*System Location:* BRW-IR
*Quantity On Hand:* 4

- *Product Code:* SRTWT5800
*Warehouse:* BUKIT RAJA
*System Location:* BRW-RSV
*Quantity On Hand:* 0

- *Product Code:* SRTWT5800
*Warehouse:* BUKIT RAJA
*System Location:* BRW-BB
*Quantity On Hand:* 0

Related products:
1. SRTWT5800 — no incoming
2. SRTWT5800-FH — no incoming
3. SRTWT5800-HEAD — no incoming
Reply with a number to check its incoming, or reply 'yes' to escalate to purchasing team.
```

sha256 of user_response: `f5b200cd6ac2685fe83490feb2b3fd14b8933593d7bd52654da7ef5eca971092`
