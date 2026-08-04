const m = $('redis-pop-main-message-list').first().json.message;
return [{ json: { output: m.mock_parser_output } }];