const LIMIT = 1800;
  let text = $('When Executed by Another Workflow').first().json.message
  if (text) {
    text = String(text).trim();
  }
  let resultSet = $('When Executed by Another Workflow').first().json.result_set
  if (!text) return [{ json: { message: '' } }];

  // generalized: N parts, split at newline/space before limit
  const parts = [];   
  let rest = text;
  while (rest.length > LIMIT) {
    let at = rest.lastIndexOf('\n', LIMIT);
    if (at < 800) at = rest.lastIndexOf(' ', LIMIT);
    if (at < 800) at = LIMIT;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  parts.push(rest);

  // match "1." / "1)" / "*1.*" at line starts → which items live in this part
  const idxIn = (part) =>
    [...part.matchAll(/(?:^|\n)\s*\*?(\d{1,3})[.)]/g)].map((m) => Number(m[1]));

  return parts.map((p, i) => {
    const ids = new Set(idxIn(p));
    const subset = resultSet?.filter((r) => ids.has(r.idx));
    return {
      json: {
        message: p,
        part: i + 1,
        total_parts: parts.length,
        // fallback: no numbered items detected in any part -> whole set rides part 1
        result: subset?.length ? subset : (i === 0 && parts.length === 1 ? resultSet : []),
      },    
    };
  });