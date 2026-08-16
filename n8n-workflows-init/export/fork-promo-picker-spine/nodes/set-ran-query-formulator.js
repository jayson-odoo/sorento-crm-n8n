let output = {};

output.response = `There is some error encountered by the AI: ${$input.first().json.error}`

return output;