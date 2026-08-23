let output = {};
output = {
  "variables": {
    "response": $input.first().json.message.message.type
  },
  "user_response": $input.first().json.message.message.type
};
return output;