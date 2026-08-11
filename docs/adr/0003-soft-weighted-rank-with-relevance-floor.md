# Spec search uses soft weighted rank + relevance floor, not hard filters

The CRM spec-search endpoint treats every extracted spec as a **scoring boost, not
a WHERE filter** (enumerated = exact-match boost; numeric = closeness score reusing
the ±5 mm-on-hedge convention; free-terms = trigram over description). It sorts by
total score and returns top-N. A reader would expect hard `WHERE` filters; we
deliberately avoid them because the output is a recall-oriented did-you-mean picker
and one over-extracted enum would otherwise empty the picker.

To stop a never-empty ranker from surfacing confidently-wrong candidates, a tuned
**relevance floor** gates the result: below it, the bot shows no candidates and
falls through to the existing escalate/clarify path ("share a code, model name, or
photo").

## Consequences

- Weights and the floor need tuning against a **spec-search eval baseline**
  (`phrase → expected code(s)` fixtures, modeled on
  `eval_assistant_routing.baseline.json`) so they can be tuned CRM-side before n8n
  is wired — this is what makes the CRM-complete-first build order safe.
- Anti-hallucination is enforced upstream by an **evidence-span deterministic
  gate**: the parser must cite the customer substring that triggered each spec, and
  a deterministic node drops any spec whose evidence isn't literally in the message.
