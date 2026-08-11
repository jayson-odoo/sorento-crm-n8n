const m = $('redis-pop-main-message-list').first().json.message;
const fx = (m.fixtures || {}).get_access_types;
if (Array.isArray(fx)) return fx.map(j => ({ json: j }));
return [{ json: fx || {} }];