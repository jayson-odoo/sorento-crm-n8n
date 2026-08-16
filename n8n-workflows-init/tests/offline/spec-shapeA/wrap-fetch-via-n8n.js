// Routes crm-probe.js's fetch() through the short-lived zz-crm-probe n8n webhook so the
// CRM credential (`crm-n8n-auth`) never leaves n8n. The webhook workflow POSTs the payload
// to /references/resolve with the real header and answers {statusCode, body}.
//
//   PROBE_WEBHOOK='https://automate-sorento.foundryx.my/webhook/zz-crm-probe-shapeA-x7q2m' \
//   CRM_BASE='https://fe-sorento.foundryx.my/api/v1/system' CRM_API_KEY='via-n8n' \
//   CRM_CONTACT_ID=437264483 CRM_SPACE_ID=364817 \
//   node -r ./wrap-fetch-via-n8n.js crm-probe.js
//
// Delete the helper workflow after the run — it is an authenticated proxy while it exists.
'use strict';
const WEBHOOK = process.env.PROBE_WEBHOOK;
if (!WEBHOOK) throw new Error('PROBE_WEBHOOK not set');
const real = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = new URL(url);
  const res = await real(WEBHOOK, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ qs: u.search.replace(/^\?/, ''), payload: JSON.parse(init.body) }),
  });
  const wrapped = await res.json(); // { statusCode, body }
  return {
    status: wrapped.statusCode,
    text: async () => (typeof wrapped.body === 'string' ? wrapped.body : JSON.stringify(wrapped.body)),
  };
};
