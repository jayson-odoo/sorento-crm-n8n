# Replay r0704 — capture results (golden_run 12)

- Total turns: **312** across **24** contacts
- §0 safety gate: **PASS (0 egress)** — non-test sends=[], non-test human-intervention=[], real-egress-node turns=[], get-results write tools=[]
- get-results tools seen (all READs): ['crm_forms_management_forms_list', 'crm_incoming_stock_list', 'crm_inventory_stock_balance_list', 'crm_inventory_warehouses_list', 'crm_marketing_promotions_list', 'crm_master_product_attachments_list', 'crm_master_products_list', 'crm_order_management_orders_list', 'crm_portal_link_get']

> **BASELINE PAIRING BUG:** `v_turns_r0704.expected_reply` is off-by-one for ~99.7% of turns (prod reply logged ~0.15s BEFORE its triggering incoming; the view forward-join `outgoing.sent_at >= incoming.sent_at` pairs each incoming with the NEXT turn reply). The **corrected** columns below use the nearest-in-time prod reply and are the real A/B signal.

- Flagged vs (broken) view baseline: **238** of 312
- Flagged vs corrected baseline: **111** of 312

## Flag counts (vs corrected baseline)
- branch_flip_corrected: 98
- code_dropped_corrected: 13

## Branch flip pairs (corrected_baseline -> new)
- not_found -> escalate_offer: 24
- not_found -> found: 23
- require_specific -> found: 6
- found -> clarify: 5
- found -> escalate_offer: 3
- not_found -> clarify: 3
- other -> casual: 3
- other -> escalate_assign: 3
- found -> not_found: 3
- casual -> other: 2
- escalate_assign -> other: 2
- clarify -> found: 2
- clarify -> not_found: 2
- not_found -> other: 2
- not_found -> require_specific: 2
- casual -> clarify: 1
- dissatisfied -> found: 1
- escalate_assign -> found: 1
- require_specific -> dissatisfied: 1
- other -> dissatisfied: 1
- other -> clarify: 1
- not_found -> escalate_assign: 1
- found -> require_specific: 1
- escalate_assign -> require_specific: 1
- not_found -> dissatisfied: 1
- other -> found: 1
- clarify -> other: 1
- found -> escalate_assign: 1

## Flag counts (vs raw view baseline — inflated by pairing bug, for reference)
- branch_flip: 192
- branch_flip_corrected: 98
- notfound_found_flip: 59
- code_dropped: 46
- no_baseline: 23
- not_supported_involved: 18
- code_dropped_corrected: 13

## New-branch distribution
- found: 147
- not_found: 55
- escalate_offer: 32
- require_specific: 24
- escalate_assign: 16
- clarify: 15
- other: 10
- casual: 9
- dissatisfied: 4

## Flagged turns (vs CORRECTED baseline)
| conv | turn | tid | flags | corrBase→new | user_message | new_reply | corrected_baseline_reply |
|---|---|---|---|---|---|---|---|
| 404279734 | 1 | 38144 | branch_flip_corrected | found→clarify | Srtwc8504 | Could you please clarify what you need help with regarding the product… | https://cdn-sorento.com/promotion/f75e5acd-1540-42e8-8819-26738ea0f664… |
| 423729104 | 1 | 38101 | code_dropped_corrected | found→found | Purchase return | Here is your portal link.  1. *Portal Link:* https://fe-sorento.foundr… | Here is your portal link.  1. *Portal Link:* https://fe-sorento.foundr… |
| 437253667 | 5 | 38035 | branch_flip_corrected | casual→clarify | Will resubmit | Hi! Could you please clarify what kind of request you are trying to re… | Thanks for letting me know! Feel free to resubmit whenever you're read… |
| 437264483 | 1 | 37826 | branch_flip_corrected | found→escalate_offer | Do you have delivery to hanlim tmr | No delivery on 2026-07-09. hanlim has delivery on 2026-07-07 (DO 20260… | *Customer:* HANLIM TRADING SDN BHD [A/C I] *Order Date:* 23/06/2026 *A… |
| 437264483 | 7 | 37850 | code_dropped_corrected | found→found | do you have DO to hanlim last week? | Here are the orders I found.  1. *Order Number:* 202607-0453 *Customer… | *Products:* SRTWCFT003-OP (1.0000)  22. *Order Number:* REP202606-0190… |
| 437264483 | 9 | 37858 | branch_flip_corrected | not_found→escalate_offer | do you have deliveyr to hanlim today | No delivery on 2026-07-08. hanlim has delivery on 2026-07-07 (DO 20260… | Could not find order for customer Hanlim from 2026-06-29 to 2026-06-29… |
| 437264483 | 12 | 37867 | branch_flip_corrected | dissatisfied→found | any incoming for CKS315 | I have attached the file(s) below.  1. *Product Code:* CKS315 *Contain… | I am sorry the provided answer does not meet your requirements. Would … |
| 437264483 | 17 | 37960 | branch_flip_corrected | not_found→clarify | One siew srtkt72ss already delivered? | I captured "One siew srtkt72ss" but couldn't tell which part is which.… | Could not find order for One siew srtkt72ss. Would you like me to esca… |
| 437264483 | 19 | 37968 | branch_flip_corrected | found→clarify | One siew srtkt72ss already delivered? | I captured "one siew srtkt72ss" but couldn't tell which part is which.… | Here are the orders I found.  1. *Order Number:* 202606-4073 *Customer… |
| 437264483 | 21 | 37972 | branch_flip_corrected | found→clarify | One siew srtkt72ss already delivered? | I captured "one siew srtkt72ss" but couldn't tell which part is which.… | Here are the orders I found.  1. *Order Number:* 202606-4073 *Customer… |
| 437264483 | 25 | 37980 | branch_flip_corrected | other→casual | What’s the score of netherland vs morocco | Hi! I don't have live scores, but I can help direct you to where you m… | Are you looking for the latest score of the Netherlands vs Morocco mat… |
| 437264483 | 26 | 37982 | branch_flip_corrected | other→casual | Yes | Great! Let me know if you need any help moving forward. | Could you please confirm if you want the latest score of the Netherlan… |
| 437264483 | 34 | 38039 | branch_flip_corrected | not_found→escalate_offer | May I have the technical drawing for MWT5727SS-CR … | Here's what you want: • product: MWT5727SS-CR (+1 more) • attachment_t… | Could not find a technical drawing for product MWT5727SS-CR and M9713S… |
| 437264483 | 35 | 38043 | branch_flip_corrected | not_found→escalate_offer | May I have the technical drawing for MWT5727SS-CR … | Here's what you want: • product: MWT5727SS-CR (+1 more) • attachment_t… | Could not find a technical drawing for product MWT5727SS-CR and M9713S… |
| 437264483 | 38 | 38083 | branch_flip_corrected | not_found→escalate_offer | SRT61-CR technical drawing | Here's what you want: • product: SRT61-CR • attachment_type: Technical… | Could not find a technical drawing for product SRT61-CR. Would you lik… |
| 445239384 | 1 | 37886 | branch_flip_corrected | not_found→escalate_offer | Can check this d/o 2026-06-3640 already send out ? | Here's what you want: • customer_order: YI HONG TILING SDN BHD [A/C II… | Could not find order for 2026-06-3640. Would you like me to escalate t… |
| 445239384 | 2 | 37889 | branch_flip_corrected | other→escalate_assign | Ms tan |  | Hi! Are you looking for help with routing to Ms. Tan? Let me know how … |
| 445239384 | 3 | 37890 | branch_flip_corrected | casual→other | 1 | Could you please confirm what you mean by selecting option 1 in the es… | Got it! Let me know if you need any more help. |
| 445239384 | 4 | 37892 | branch_flip_corrected | not_found→found | Can check this d/o 2026-06-3640 already send out ? | Here are the orders I found.  1. *Order Number:* 202606-3640 *Customer… | Could not find order for 2026-06-3640. Would you like me to escalate t… |
| 445239384 | 5 | 37895 | branch_flip_corrected | escalate_assign→found | 1 | Here are the orders I found.  1. *Order Number:* 202606-3640 *Customer… | This inquiry has been routed to the respective person-in-charge (PIC) … |
| 445239384 | 8 | 37907 | branch_flip_corrected | not_found→escalate_offer | One siew srtkt72-ss already delivered? | Here's what you want: • customer: ONE SIEW ENTERPRISE SDN BHD [A/C I] … | Could not find order for srtkt72-ss SMC202606-0115. Would you like me … |
| 445239384 | 10 | 37925 | branch_flip_corrected | not_found→found | Can check stock balance srtkt71-ss | Stock details found for the requested products.  1. *Product Code:* SR… | Could not find inventory for srtkt71-ss. Would you like me to escalate… |
| 445239384 | 11 | 37927 | branch_flip_corrected | escalate_assign→other | Yes | Could you please confirm which product option you'd like to proceed wi… | This inquiry has been routed to the respective person-in-charge (PIC) … |
| 445239384 | 17 | 37956 | branch_flip_corrected | require_specific→found | Can check stock balance | Stock details found for the requested products.  1. *Product Code:* SR… | A inventory enquiry can't be answered with a general search — please s… |
| 445239384 | 20 | 38286 | branch_flip_corrected | other→escalate_assign | Inventory department |  | I see you're trying to specify the inventory department, Let me unders… |
| 445239385 | 4 | 37930 | branch_flip_corrected | not_found→found | Can check stock balance srtkt71-ss | Stock details found for the requested products.  1. *Product Code:* SR… | Could not find inventory for srtkt71-ss. Would you like me to escalate… |
| 445239390 | 1 | 38076 | branch_flip_corrected | found→escalate_offer | Hi, may i know delivery for hanlim today ? | No delivery on 2026-07-08. Hanlim has delivery on 2026-07-07 (DO 20260… | *Status:* Picked Up / In Transit *Pickup Time:* 10:08:00 *Transporter:… |
| 445239390 | 2 | 38079 | branch_flip_corrected | require_specific→dissatisfied | thankyou | I am sorry the provided answer does not meet your requirements. Would … | A order enquiry can't be answered with a general search — please speci… |
| 445239390 | 3 | 38081 | branch_flip_corrected | other→dissatisfied | i just say thankyou for the information | I am sorry the provided answer does not meet your requirements. Would … | You're very welcome! If you need anything else, just let me know. |
| 445239390 | 6 | 38386 | branch_flip_corrected | not_found→escalate_offer | MAY I KNOW CHIN CHUN HARDWARE GT DELIVERY YESTERDA… | No delivery on 2026-07-07. CHIN CHUN HARDWARE GT has delivery on 2026-… | Could not find order for customer CHIN CHUN HARDWARE GT from 2026-07-0… |
| 445239390 | 9 | 38464 | branch_flip_corrected | not_found→escalate_offer | may i know today got delivery by transporter law t… | Here's what you want: • transporter: LAW TRANSPORT  But no order from … | Could not find order for transporter law transport from 2026-07-03 to … |
| 445239405 | 1 | 38017 | branch_flip_corrected | not_found→found | SMC202605-0028 | Here are the orders I found.  1. *Order Number:* SMC202605-0028 *Custo… | Could not find master_products for SMC202605-0028. Would you like me t… |
| 445239405 | 7 | 38318 | code_dropped_corrected | found→found | i want to make a complaint | Here is your portal link.  1. *Portal Link:* https://fe-sorento.foundr… | Here is your portal link.  1. *Portal Link:* https://fe-sorento.foundr… |
| 445239405 | 11 | 38342 | branch_flip_corrected | clarify→found | PS202605-0020 | Here are the orders I found.  1. *Order Number:* PS202605-0020 *Custom… | Could you please clarify what you need help with regarding the portal … |
| 445239405 | 12 | 38346 | branch_flip_corrected | require_specific→found | PS202605-0020 | Here are the orders I found.  1. *Order Number:* PS202605-0020 *Custom… | Could you please specify what you need assistance with regarding the p… |
| 445239405 | 13 | 38455 | branch_flip_corrected | clarify→found | DO | Here are the orders I found.  1. *Order Number:* PS202605-0020 *Custom… | Could you please clarify what you need help with regarding the referen… |
| 445239405 | 14 | 38453 | branch_flip_corrected | clarify→not_found | PS202603-0066 | Couldn't find "PS202603-0066". Did you mean PS202605-0066, PS202607-00… | Could you please clarify what you need help with regarding the referen… |
| 445239409 | 2 | 38508 | branch_flip_corrected | found→not_found | I need the latest certificate WCM PC 000319 | Here's what you want: • attachment_type: Certification  Couldn't find:… | I have attached the file(s) below.  1. *Product Code:* SRTWC6405-SC *A… |
| 445239409 | 5 | 38515 | branch_flip_corrected | not_found→escalate_offer | MWT6906-CR certificate | Here's what you want: • product: MWT6906-CR • attachment_type: Certifi… | Could not find a certificate for product MWT6906-CR. Would you like me… |
| 445239409 | 6 | 38517 | branch_flip_corrected | not_found→escalate_offer | MHS1028 certificate | Here's what you want: • product: MHS1028 • attachment_type: Certificat… | Could not find a certificate for product MHS1028. Would you like me to… |
| 445239410 | 1 | 38003 | code_dropped_corrected | found→found | i wamt do product inquiry | Here is your portal link.  1. *Portal Link:* https://fe-sorento.foundr… | Here are the matching products.  1. *Product Code:* SRTWT6214-MBL *Des… |
| 445239410 | 2 | 38005 | code_dropped_corrected | found→found | how to do product inquiry? | Here is your portal link.  1. *Portal Link:* https://fe-sorento.foundr… | Here is your portal link.  1. *Portal Link:* https://fe-sorento.foundr… |
| 445239410 | 8 | 38025 | branch_flip_corrected | not_found→clarify | 2 | Could you please clarify what you need help with regarding option 2 fo… | Could not find a certificate. Would you like me to escalate to purchas… |
| 445239410 | 13 | 38037 | branch_flip_corrected | casual→other | thank you | You're very welcome! If you need anything else, just let me know. | You're welcome! If you need anything else, just let me know. |
| 445239410 | 14 | 38239 | branch_flip_corrected | not_found→found | srtwt2206 stock available? | Stock details found for the requested products.  1. *Product Code:* SR… | Could not find inventory for product srtwt2206. Would you like me to e… |
| 445239413 | 1 | 38049 | branch_flip_corrected | other→clarify | Can I know Eric Ng sales 2026 | I see you're trying to clarify what information is being requested abo… | I see you're trying to know Eric Ng sales for 2026, Let me understand … |
| 445239413 | 3 | 38053 | code_dropped_corrected | found→found | Delivery order | Here are the orders I found.  1. *Order Number:* PS202607-0058 *Custom… | *Order Date:* 18/06/2026 *Actual Delivery Date:* 18/06/2026 *Status:* … |
| 445239413 | 5 | 38061 | branch_flip_corrected | not_found→other | Incoming status | I see you're trying to clarify that they want incoming status, Let me … | Could not find incoming for product CB4709. Would you like me to escal… |
| 445239413 | 6 | 38063 | branch_flip_corrected | other→casual | Yes | Great! Let me know if you need any help finalizing your choice. | We have noted down your enquiries. We are outside of our working hours… |
| 445239413 | 9 | 38473 | branch_flip_corrected | found→clarify | other | I see you're trying to clarify what the user means by "other", Let me … | I have attached the file(s) below.  1. *Form Name:* DEALERS ANNUAL DIN… |
| 445239413 | 12 | 38478 | branch_flip_corrected | not_found→escalate_assign | Yes, I want the delivery status |  | Could not find order for Paramount PO-013741. Would you like me to esc… |
| 445239413 | 15 | 38496 | code_dropped_corrected | found→found | EXAMPLE DONATE TO PURCHASE A TICKET | I have attached the file(s) below.  1. *Form Name:* Mocha_-_Racking_an… | Here is your portal link.  1. *Portal Link:* https://fe-sorento.foundr… |
| 445239414 | 2 | 38095 | code_dropped_corrected | found→found | I want to issue product inquiry | Here is your portal link.  1. *Portal Link:* https://fe-sorento.foundr… | Here is your portal link.  1. *Portal Link:* https://fe-sorento.foundr… |
| 445239414 | 3 | 38406 | branch_flip_corrected | require_specific→found | Please send me SRTWT7301 product picture and list … | Here are the matching products.  1. *Product Code:* SRTWT7301-BL *Desc… | Please provide the attachment type for product SRTWT7301 — e.g. produc… |
| 445239414 | 9 | 38502 | branch_flip_corrected | not_found→found | SRTWT165-QT has stock? | Stock details found for the requested products.  1. *Product Code:* SR… | Could not find inventory for product SRTWT165-QT. Would you like me to… |
| 445239414 | 10 | 38504 | branch_flip_corrected | not_found→found | Stock quantity? | Stock details found for the requested products.  1. *Product Code:* SR… | Could not find inventory for product SRTWT165-QT. Would you like me to… |
| 447351879 | 1 | 37914 | branch_flip_corrected | require_specific→found | Can check (syntalun customer) order item cks319 de… | Here are the orders I found.  1. *Order Number:* 202606-3877 *Customer… | A order enquiry can't be answered with a general search — please speci… |
| 447351879 | 2 | 37918 | code_dropped_corrected | found→found | Please check for customer : syntalun | Here are the orders I found.  1. *Order Number:* 202607-0688 *Customer… | *Products:* SRTWCX8826-S (6.0000), SRTWCY8826 (6.0000), SRTWC8826-SC (… |
| 477071885 | 6 | 38294 | code_dropped_corrected | found→found | Srtub5202 got stock？ | I have attached the file(s) below.  1. *Product Code:* SRTUB5202 *Cont… | Stock details found for the requested products.  1. *Product Code:* SR… |
| 477071885 | 7 | 38316 | branch_flip_corrected | found→not_found | Srtks2405 got stock | No incoming stock (ETA) for SRTKS2405. Try: SRTKS2406, SRTKS2432, SRTK… | Stock details found for the requested products.  1. *Product Code:* SR… |
| 477071886 | 1 | 38103 | branch_flip_corrected | not_found→found | Living Portal got delivery today? | Here are the delivered orders I found.  1. *Order Number:* 202607-0874… | Could not find order for customer Living Portal from 2026-07-02 to 202… |
| 477071886 | 3 | 38117 | branch_flip_corrected | not_found→found | How much was SRTWT7438GM old list price? | Here are the matching products.  1. *Product Code:* SRTWT7438-GM *Desc… | Could not find master_products for SRTWT7438GM. Would you like me to e… |
| 477071886 | 4 | 38125 | branch_flip_corrected | not_found→require_specific | SRTFC2044 Installation guide | Please provide the attachment type for product SRTFC2044 — e.g. produc… | Could not find a installation guide for product SRTFC2044. Would you l… |
| 477071886 | 5 | 38131 | branch_flip_corrected | found→require_specific | Pls share tick Hong, Kbo, today plumbing and total… | Please provide the attachment type for product SRTFC2044 — e.g. produc… | Here is your portal link.  1. *Portal Link:* https://fe-sorento.foundr… |
| 477071886 | 8 | 38167 | branch_flip_corrected | found→escalate_offer | Popular Sanitary got delivery today? | No delivery on 2026-07-08. Popular Sanitary has delivery on 2026-07-06… | *Order Date:* 15/06/2026 *Actual Delivery Date:* 15/06/2026 *Status:* … |
| 477071886 | 13 | 38189 | branch_flip_corrected | not_found→found | Got SRTFC2044 guide? | I have attached the file(s) below.  1. *Product Code:* SRTFC2044 *Atta… | Could not find a guide for product SRTFC2044. Would you like me to esc… |
| 477071886 | 14 | 38191 | branch_flip_corrected | escalate_assign→require_specific | Yes | Could you please specify which product attachment result you'd like to… | This inquiry has been routed to the respective person-in-charge (PIC) … |
| 477071886 | 21 | 38288 | branch_flip_corrected | not_found→found | CWC8315 got eta? | I have attached the file(s) below.  1. *Product Code:* CWC8315 *Contai… | Could not find incoming for CWC8315. Would you like me to escalate to … |
| 477071886 | 22 | 38314 | branch_flip_corrected | not_found→found | SRTWT2634 got eta? | I have attached the file(s) below.  1. *Product Code:* SRTWT2634 *Cont… | Could not find incoming for SRTWT2634. Would you like me to escalate t… |
| 477071886 | 27 | 38348 | branch_flip_corrected | not_found→found | Pls share SRTWT7448-GM image with detail | I have attached the file(s) below.  1. *Product Code:* SRTWT7448-GM *A… | Could not find a image for product SRTWT7448-GM. Would you like me to … |
| 477071886 | 28 | 38351 | branch_flip_corrected | escalate_assign→other | Yes | Could you please confirm what details you'd like to check about the pr… | This inquiry has been routed to the respective person-in-charge (PIC) … |
| 477071886 | 29 | 38369 | branch_flip_corrected | not_found→escalate_offer | Chin Chun Hardware got delivery today? | No delivery on 2026-07-08. Chin Chun Hardware has delivery on 2026-07-… | Could not find order for customer Chin Chun Hardware from 2026-07-03 t… |
| 477071886 | 30 | 38370 | branch_flip_corrected | not_found→escalate_offer | Chin Chun hardware sdn Bhd got delivery today? | No delivery on 2026-07-08. Chin Chun hardware sdn Bhd has delivery on … | Could not find order for customer Chin Chun hardware sdn Bhd from 2026… |
| 477071886 | 31 | 38372 | branch_flip_corrected | not_found→dissatisfied | Pls show DO number 202607-0634 and 202607-0400 | I am sorry the provided answer does not meet your requirements. Would … | Could not find order for 202607-0634 202607-0400. Would you like me to… |
| 477071886 | 34 | 38421 | branch_flip_corrected | require_specific→found | Got description? | Here are the matching products.  1. *Product Code:* SRTWT5814 *Descrip… | Please provide the attachment type for product SRTWT7448-GM — e.g. pro… |
| 477071886 | 36 | 38451 | branch_flip_corrected | not_found→found | CB4924CR CB4931GY CB4930RG CB4933GM  got stock ? | Stock details found for the requested products.  1. *Product Code:* CB… | Could not find inventory for CB4924CR CB4931GY CB4930RG CB4933GM. Woul… |
| 477071886 | 37 | 38519 | branch_flip_corrected | not_found→escalate_offer | Living Portal ada hantar barang hari ini? | Here's what you want: • product: CB4924-CR (+3 more)  But no incoming … | Could not find incoming for CB4924CR CB4931GY CB4930RG CB4933GM. Would… |
| 477071886 | 38 | 38521 | branch_flip_corrected | not_found→escalate_offer | Living Portal got delivery today? | Here's what you want: • product: CB4924-CR (+3 more)  But no incoming … | Could not find incoming for Living Portal CB4924CR CB4931GY CB4930RG C… |
| 477071886 | 39 | 38523 | branch_flip_corrected | not_found→escalate_offer | Living Portal (m) Sdn Bhd got delivery today? | No delivery on 2026-07-08. Living Portal (m) Sdn Bhd has delivery on 2… | Could not find order for customer Living Portal (m) Sdn Bhd from 2026-… |
| 477071886 | 40 | 38525 | code_dropped_corrected | found→found | Living Portal (m) Sdn Bhd got delivery yesterday ? | Here are the orders I found.  1. *Order Number:* 202607-0874 *Customer… | Here are the orders I found.  1. *Order Number:* 202607-0503 *Customer… |
| 477071887 | 1 | 38107 | branch_flip_corrected | found→clarify | Check one siew deliy | I captured "one siew deliy" but couldn't tell which part is which. For… | *Transporter:* SORENTO *Driver:* SAMSUDIN *Lorry Plate:* VAR1678 *Ware… |
| 477071887 | 2 | 38112 | branch_flip_corrected | not_found→escalate_offer | Check one siew 2/07/2026 delivery | No delivery on 2026-07-02. one siew has delivery on 2026-07-01 (DO 202… | Could not find order for customer one siew from 2026-07-02 to 2026-07-… |
| 477071887 | 9 | 38148 | branch_flip_corrected | other→found | Check one siew srtwc286 price history | Here are the matching products.  1. *Product Code:* SRTWC286-SH *Descr… | _Data last updated: 30/06/2026 18:13:26_  P/S: if the spec you're afte… |
| 477071887 | 10 | 38153 | branch_flip_corrected | not_found→found | ETA SRTWC286-SH-NEW-P | I have attached the file(s) below.  1. *Product Code:* SRTWC286-SH-NEW… | Could not find incoming for product SRTWC286-SH-NEW-P. Would you like … |
| 477071887 | 11 | 38155 | branch_flip_corrected | not_found→found | Check stock SRTWC286-SH-NEW-P | Stock details found for the requested products.  1. *Product Code:* SR… | Could not find inventory for product SRTWC286-SH-NEW-P. Would you like… |
| 477071887 | 14 | 38224 | branch_flip_corrected | not_found→found | 8 | I have attached the file(s) below.  1. *Product Code:* SRTWCX7405-RL-S… | Could not find incoming for SRTWCX7405-RL-S-PJ. Would you like me to e… |
| 477071887 | 15 | 38226 | branch_flip_corrected | clarify→not_found | 5 | Could not find incoming for the requested item. Would you like me to e… | Could you please clarify what number you'd like to respond with or wha… |
| 477071887 | 17 | 38230 | branch_flip_corrected | not_found→clarify | This list | I see you're trying to clarify what the number refers to in this list,… | Could not find incoming for the requested item. Would you like me to e… |
| 477071887 | 20 | 38248 | code_dropped_corrected | found→found | Check one siew year 2026 outstanding order | Here are the outstanding orders I found.  1. *Order Number:* 202606-42… | *Lorry Plate:* PPS1678 *Warehouse:* BRW *Products:* SRTWC8354-SH (8.00… |
| 477071887 | 27 | 38310 | branch_flip_corrected | not_found→require_specific | Check estimate give PO | A order enquiry can't be answered with a general search — please speci… | Could not find incoming for the requested item. Would you like me to e… |
| 477071887 | 28 | 38312 | branch_flip_corrected | not_found→other | Check today maintenance service schedule | I see you're trying to check today's maintenance service schedule, Let… | Could not find master_products for maintenance service schedule. Would… |
| 477071887 | 34 | 38360 | branch_flip_corrected | other→escalate_assign | Yes |  | We have noted down your enquiries. We are outside of our working hours… |
| 477071887 | 35 | 38366 | branch_flip_corrected | not_found→escalate_offer | 3/07/2026 sin hong hung delivery | No delivery on 2026-07-03. Sin Hong Hung has delivery on 2026-07-07 (D… | Could not find order for customer Sin Hong Hung from 2026-07-03 to 202… |
| 477071887 | 36 | 38377 | branch_flip_corrected | not_found→escalate_offer | 3/07/2026 sin hong hung delivery | No delivery on 2026-07-03. Sin Hong Hung has delivery on 2026-07-07 (D… | Could not find order for customer sin hong hung from 2026-07-03 to 202… |
| 477071887 | 39 | 38384 | branch_flip_corrected | clarify→other | Cancel | I understand you want to cancel the escalation. Could you please provi… | Hi! Could you please confirm what escalation you’d like to cancel? |
| 477071887 | 41 | 38392 | branch_flip_corrected | not_found→escalate_offer | Check sin hong hung  srtwc8518-SH DELIVERY IN JULY | No delivery on 2026-07-01 to 2026-07-31. Sin Hong Hung has delivery on… | Could not find order for sin hong hung srtwc8518-SH from 2026-07-01 to… |
| 477071887 | 42 | 38394 | branch_flip_corrected | found→escalate_assign | Nur |  | *Products:* SRTWC8518-SH (11.0000), WESERP10B (11.0000), SRTWB7109 (11… |
| 477071887 | 47 | 38424 | branch_flip_corrected | found→not_found | Srtwc8517 promotion | Here's what you want: • product: SRTWC8517-SH-UF-150 (+7 more)  But no… | I have attached the file(s) below.  1. *Promotion:* FOCUS ITEM SORENTO… |
| 477071887 | 49 | 38482 | branch_flip_corrected | require_specific→found | All | I have attached the file(s) below.  1. *Product Code:* SRTWC8518-SH-20… | Please provide the attachment type for the requested product — e.g. pr… |
| 477071887 | 50 | 38485 | branch_flip_corrected | not_found→found | Certificates | I have attached the file(s) below.  1. *Product Code:* SRTWC8518-SH-20… | Could not find a Certificates. Would you like me to escalate to purcha… |
| 477071887 | 51 | 38486 | branch_flip_corrected | not_found→escalate_offer | Srtwc8518- SH Ikram | Here's what you want: • attachment_type: Certification  But no certifi… | Could not find a Ikram for product Srtwc8518- SH Ikram. Would you like… |
| 477071888 | 4 | 38142 | branch_flip_corrected | not_found→found | check stock cwc7601-s-rl | Stock details found for the requested products.  1. *Product Code:* CW… | Could not find inventory for product cwc7601-s-rl. Would you like me t… |
| 477071888 | 8 | 38200 | branch_flip_corrected | not_found→escalate_offer | Srtkt1962ss-gm-diy | Here's what you want: • product: SRTKT1962SS-GM-DIY  But no incoming m… | Could not find incoming for Srtkt1962ss-gm-diy. Would you like me to e… |
| 477071888 | 11 | 38206 | branch_flip_corrected | not_found→found | Check stock or eta sRTKT1962SS-GM-DIY | Stock details found for the requested products.  1. *Product Code:* SR… | Could not find inventory for product sRTKT1962SS-GM-DIY. Would you lik… |
| 477071888 | 12 | 38208 | branch_flip_corrected | not_found→escalate_offer | Check eta srtkt1962ss-gm-diy | Here's what you want: • product: SRTKT1962SS-GM-DIY  But no incoming m… | Could not find incoming for srtkt1962ss-gm-diy. Would you like me to e… |
| 477071888 | 18 | 38276 | branch_flip_corrected | not_found→found | Check eta srt79-ss | I have attached the file(s) below.  1. *Product Code:* SRT79-SS *Conta… | Could not find incoming for product srt79-ss. Would you like me to esc… |
| 477071888 | 19 | 38296 | branch_flip_corrected | not_found→found | CHECK ETA SRT768-GM | I have attached the file(s) below.  1. *Product Code:* SRT768-GM *Cont… | Could not find incoming for SRT768-GM. Would you like me to escalate t… |
| 477071888 | 20 | 38298 | branch_flip_corrected | not_found→found | stock srt768-gm | Stock details found for the requested products.  1. *Product Code:* SR… | Could not find inventory for product SRT768-GM. Would you like me to e… |
| 477071888 | 26 | 38435 | code_dropped_corrected | found→found | Delivery for jian hwa | Here are the orders I found.  1. *Order Number:* 202607-0820 *Customer… | *Status:* New Order *Pickup Time:* 10:07:00 *Transporter:* LAW TRANSPO… |
| 477071888 | 28 | 38447 | branch_flip_corrected | not_found→escalate_offer | Eta srtsh2626-bl | Here's what you want: • product: SRTSH2626-BL  But no incoming matched… | Could not find incoming for SRTSH2626-BL. Would you like me to escalat… |
| 480184379 | 7 | 38427 | branch_flip_corrected | not_found→escalate_offer | 3 | Here's what you want: • product: SRTSC07 • attachment_type: Certificat… | Could not find a Certificate. Would you like me to escalate to purchas… |
