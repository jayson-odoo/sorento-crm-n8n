const m = $('redis-pop-main-message-list').first().json.message;
return [{ json: (m.fixtures || {}).check_access }];