# UAC §V0b

> ⚠️ **`00-SAFETY-always-read.md` (§0) applies to every case here.**

## §V0b. `domain_signal` LLM validation (real reformulator, plan §C6 V-P0b)
Across a sample of the mined chains + the A/B triggers, assert the LLM sets `output.output.domain_signal`
correctly per turn: **`explicit`** on decisive-term turns (eta, list price, delivery-for-customer, stock,
GRN, dimension, selling price), **`inferred`** on bare-code-no-purpose-word turns (a bare "SRTWC286-SH"),
**`none`** when `domain_hint` is null. A systematically wrong signal (e.g. a bare code marked `explicit`,
or a decisive "list price" marked `inferred`) defeats the carry — **FLAG loudly** (the whole fix depends
on this signal being right; a wrong signal is a prompt-1c regression, triaged not silently passed).
- **Safety:** §0 all (real reformulator on the clone, zero egress).
