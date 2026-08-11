if ($input.first().json.message?.message) {
  return $input.first().json.message.message
} else {
  return null
}
