$input.first().json.custom_fields.find(x => x.name == "is_human_intervened").value = "false"

return $input.first().json
