let output = {};
let input = $input.first().json
if (input.output && typeof input.output === 'object') {
  output = input.output;
} else {
  let raw = String(input.output || input.text || '');
  if (raw) {
    // Remove Markdown code fences like ```json ... ```
    raw = raw.replace(/```[\s\S]*?```/g, match =>
      match.replace(/```json?|\```/g, '')
    );
  
    const idx = raw.indexOf('{');
    if (idx === -1) {
      output = raw;
      output.quick_reply = input.quick_reply
    } else {
      const startSlice = raw.slice(idx);
      const last = startSlice.lastIndexOf('}');
      const cleanSlice = last !== -1 ? startSlice.slice(0, last + 1) : startSlice;
      output = JSON.parse(cleanSlice);
    }
  } else {
    output = input
  }
}

return output;
