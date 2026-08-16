# Spec search is an entity-resolution fallback, not a new domain

Customers describe products by spec ("kitchen sink 1.2mm double bowl, give me the
code") instead of by code/name. We resolve this as a **fallback inside the
existing resolve-entity → did-you-mean picker path**, triggered only on a
*description miss*, rather than as a new parser domain or a multi-intent parser
rework. The confirmed candidate re-enters whichever domain the customer already
intended (master-products/product-info or stock-check), so no cross-domain routing
seam is introduced.

## Considered Options

- **New `find-product` domain** — rejected: duplicates resolve/stock plumbing and
  forces a hand-off back to stock/order (the very cross-domain seam we wanted to avoid).
- **Multi-intent parser** (emit find+stock+order together) — rejected for now:
  large blast radius on a single-domain parser; own project.

## Consequences

- A **miss discriminator** is required: parser tags the unresolved input as
  code-attempt vs descriptive, backstopped by a deterministic code-shape regex.
  A *code miss* keeps the existing alternative/sibling-picker path; only a
  *description miss* triggers spec search.
