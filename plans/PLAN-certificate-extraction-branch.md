# PLAN - a dedicated certificate branch in system-upload-attachments

**Status: PROMOTED to live 2026-08-05, user-gated.** Backup taken first:
`backups/system-upload-attachments-20260805-124222.pre-certificate-branch.json`.

Promotion diff on live, verified after the PUT: 49 -> 53 nodes, the four
certificate nodes added, **zero** pre-existing nodes changed, **zero**
pre-existing credentials lost or altered, the live webhook path unchanged, and
`Switch out[2]` repointed from `switch-attachment-type` to
`switch-certificate-type`. The product path is byte-identical.

| | |
|---|---|
| Live workflow | `_NbFU3cCoEQwPSbvn14vV` (`system-upload-attachments`, ACTIVE, 49 nodes) |
| Fork | `OsLg5BgN908UsmqK` (`system-upload-attachments FORK certificates`, INACTIVE, 53 nodes) |
| CRM branch | `feat/certificate-register` (PR #84) |
| CRM contract | `POST /api/v1/external/product-attachments/` |

## Why

The CRM now has a certificate register: a certification upload can become a
`certificates` row with a revision history, coverage, derived validity and
expiry reminders. It only does so when the payload carries certificate fields
AND the attachment's type has `is_certificate` (the guard is server-side, so a
prompt change can never mint a certificate off a spec sheet).

Today it never happens, because Certification shares a branch with Technical
Specifications and Product Photos:

```
Switch out[2] "Certification"
  -> switch-attachment-type            (mime split)
       -> analyze-product-document / -image / -video
            -> analyze_document_output_parser1     (ONE shared parser)
                 -> technical-attachments-create
```

That prompt asks for products only, so a certificate PDF returns
`{"products": [...]}`, `has_certificate_fields()` is false on the CRM side, and
no certificate is created.

## Why a dedicated branch, not a wider shared prompt

The CRM guard already makes a shared prompt *safe*. The argument is accuracy and
cost: asking a spec sheet for a certificate number is how a hallucinated one
appears, and it would spend tokens on all 951 Technical Specifications for
nothing. A separate branch also means a future certificate-prompt change can
never regress the product path.

## Shape on the fork

```
Switch out[2] "Certification"
  -> switch-certificate-type           (NEW: mime contains image | pdf)
       out[0] image    -> analyze-certificate-image     (NEW, Gemini image)
       out[1] document -> analyze-certificate-document  (NEW, Gemini document)
            -> analyze_certificate_output_parser        (NEW)
                 -> technical-attachments-create        (EXISTING - one place
                                                         for the URL and creds)
```

Both certificate Gemini nodes carry `googlePalmApi` / `sorento-gemini`, the same
credential the product nodes use.

**The product path is untouched.** `switch-attachment-type`,
`analyze-product-document/-image/-video` and `analyze_document_output_parser1`
have connections byte-identical to live; only `Switch out[2]` was repointed.

## The prompt

`analyze-certificate-{document,image}` ask for the identity, the validity window
and the covered products, and return this exact JSON:

```json
{
  "products": ["WC8038", "WC8040"],
  "scheme": "PPS",
  "certifying_body": "IKRAM",
  "certificate_number": "04424FC",
  "issuer": "IKRAM QA Services Sdn Bhd",
  "title": "Product Certification Scheme - sanitary ware",
  "issued_at": "2024-12-24",
  "valid_from": "2024-12-24",
  "valid_until": "2026-12-23"
}
```

Rules that matter, and why:

- **Dates ISO or null, never guessed.** A guessed expiry silently changes when a
  certificate is reported as expiring.
- **`scheme` is the approval scheme (PPS / SPAN / SIRIM), never the certifying
  body.** The CRM identity key is scheme + number: `04124FC` exists under BOTH
  PPS and SPAN with different expiries, so getting this wrong merges two
  certificates and loses one expiry.
- **`certificate_number` excludes the scheme prefix.** "PPS - IKRAM 04424FC" has
  the number `04424FC`.
- **Anything the document does not state is null.** The CRM flags a missing
  required field for review; an invented value passes silently.

## The parser, and the trap it avoids

`analyze_document_output_parser1` appends the FILE NAME to `products`:

```js
if (filename && !products.includes(filename)) products.push(filename);
```

For a certificate the file name is `PPS - IKRAM 04424FC - EXP 23 DEC 2026`,
which is not a product code. Pushing it lands the whole file name in
`unmatched_products` and flags EVERY certificate as needing review.
`analyze_certificate_output_parser` deliberately does not do this.

It also maps blank strings to `null`, so the stored `extracted_json` stays
faithful to what the reader actually said.

## Verification done so far

1. **Clone is lossless.** REST `GET` then `POST`: 49/49 nodes, all names match,
   every node's parameters hash-identical except `Webhook` (deliberate, below),
   30/30 credential bindings identical, connections identical, `active:false`.
2. **The fork cannot receive live traffic.** Its webhook path was regenerated to
   a fresh UUID, so it does not share the live path. It is also inactive.
3. **Parser unit-tested offline** against clean JSON, markdown-fenced JSON,
   JSON surrounded by prose, all-null fields, blank strings and unparseable
   prose. No case leaks the file name into `products`; `attachment_id` survives
   every case.
4. **Parser output accepted by the real CRM endpoint**, creating a certificate
   with the scheme, number, body, issuer, title, all three dates, coverage 1,
   `source=ai` and `needs_review=false`. Test row deleted afterwards.

## Why promoting ahead of UAC was acceptable

The change is **inert against production as it stands today**, verified rather
than assumed:

- Production's `ProductAttachmentLinkRequestAny` (on `main`) declares no
  certificate fields and sets no `extra` policy, so Pydantic's default
  `extra='ignore'` silently drops `scheme` / `certificate_number` / the dates.
  Instantiating the real production model with the new payload keeps only
  `attachment_id` and `products`. No 422, no behaviour change.
- Every other attachment type keeps its existing path untouched.
- The certificate register is not deployed yet (CRM PR #84 unmerged, migration
  311 not run), so no certificate can be created either way.

The one real behaviour change for a Certification upload on current production:
the file name is no longer appended to `products` unconditionally, only when the
reader found none. Today that appended name is always skipped as an unknown
product code, so the links created are identical - one fewer entry in
`skipped_product_codes`.

**A bug caught by checking this rather than trusting it:** the first version of
the parser dropped the file-name fallback entirely. A certificate whose reader
finds no product codes then posts `products: []`, which the endpoint rejects
with 422 ("Either product_code or products must be provided") - and live
`PPS 04224FC` genuinely has zero product links, so this was not hypothetical.
The fallback now fires only when the list is empty.

## Still to do

- [ ] UAC per `tests/uac/00-SAFETY-always-read.md` plus a new certificate family
      file. Cases: PDF certificate, image certificate, a Technical
      Specifications upload (must be byte-identical to live), a Product Photo,
      an unreadable document, a renewal of an existing number.
- [ ] Confirm the Gemini reading against the 9 real certificate PDFs already in
      the CRM, comparing the extracted dates with the file names the backfill
      parsed (they should agree; where they disagree the PDF wins).
- [ ] Promotion diff: `Switch out[2]` repointed, plus 4 new nodes. Nothing else.
- [ ] **User-gated promotion.** Never edit `_NbFU3cCoEQwPSbvn14vV` directly.

## Nit worth folding into the same promotion

`technical-attachments-create` posts to
`https://72.62.195.20/api/v1/external/product-attachments` with **no trailing
slash**, which costs a 307 redirect on every upload. The collection route is
mounted at `/product-attachments/`.
