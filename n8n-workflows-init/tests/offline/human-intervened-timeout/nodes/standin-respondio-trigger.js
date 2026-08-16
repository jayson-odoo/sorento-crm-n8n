// The fork's entry point, carrying the name `Respond.io Trigger` so that every downstream
// `$('Respond.io Trigger')` read — including the live `compile-current-state` body, kept verbatim —
// resolves exactly as it does on live (LESSONS 4/5: refs are plain strings, untouched by rewiring).
return [{ json: $('harness-envelope').first().json }];
