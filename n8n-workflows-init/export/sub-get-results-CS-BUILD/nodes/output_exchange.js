// =============================================================================
  // n8n Code node: output_exchange
  // Mode: Run Once for All Items
  // Parses AI Agent JSON output, sanitizes it, and stitches a single response
  // string for the messaging channel.
  // =============================================================================
function cleanDescription(text) {
    const UUID_RE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
    const ID_LABEL_LINE = /^\s*\*+\s*[A-Za-z ]*\bid\b\s*:\s*\*+\s*\S.*$/i;

    return String(text || '')
      .replace(/\n?\*?(?:Is )?Discontinued:\*?\s*(true|false)\s*/gi, '')
      .replace(/\n?\*?(?:Is )?Expired:\*?\s*(true|false)\s*/gi, '')
      .split('\n')
      .filter(line =>
        !ID_LABEL_LINE.test(line) &&
        !new RegExp(UUID_RE, 'i').test(line)
      )
      .join('\n')
      .replace(new RegExp(UUID_RE, 'gi'), '')
      .replace(/\n{3,}/g, '\n\n')
      .trim(); 
  }
  
  let output;

  // 1. Parse the JSON safely
  if ($json.output && typeof $json.output === 'object') {
    output = $json.output;
  } else {  
    let raw = String($json.output || '');

    // Strip markdown code fences if present.
    raw = raw.replace(/```[\s\S]*?```/g, match =>
      match.replace(/```json?|```/g, '')
    );

    const idx = raw.indexOf('{');
    if (idx === -1) { 
      output = { response: raw };
      output.quick_reply = $json.quick_reply;
    } else {
      const startSlice = raw.slice(idx);
      const last = startSlice.lastIndexOf('}');
      let cleanSlice = last !== -1 ? startSlice.slice(0, last + 1) : startSlice;

      let prev;
      do {
        prev = cleanSlice;
        cleanSlice = cleanSlice.replace(/"\s*\+\s*"/g, '');
      } while (cleanSlice !== prev);

      try {
        output = JSON.parse(cleanSlice);
      } catch (e) {
        output = { response: cleanSlice };
      }
    }
  }

  // ── De-dupe identical answers (same description + same discontinued & expired flag) ──
  if (output && Array.isArray(output.answers)) {
    const seen = new Set();
    output.answers = output.answers.filter(ans => {
      const sig = `${String(ans.description || '').trim()}||${ans.is_discontinued === true || ans.is_discontinued === 'true'}||${ans.is_expired === true || ans.is_expired === 'true'}`;
      if (seen.has(sig)) return false;
      seen.add(sig);
      return true;
    });
  }

  // Helper: remove discontinued & expired line from description
  function cleanDescription(text) {
    return String(text || '')
      .replace(/\n?\*?(?:Is )?Discontinued:\*?\s*(true|false)\s*/gi, '')
      .replace(/\n?\*?(?:Is )?Expired:\*?\s*(true|false)\s*/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  // Helper: format timestamp to dd/MM/yyyy HH:mm:ss
  function formatTimestamp(isoString) {
    if (!isoString) return null;
    const date = new Date(isoString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
  }

  // Optional: clean answers in the structured output itself
  if (output && Array.isArray(output.answers)) {
    output.answers = output.answers.map(ans => ({
      ...ans,
      description: cleanDescription(ans.description),
    }));
  }

  // 2. Stitch the new structured components into a single 'response' string
  if (output && output.response_intro) {
    let finalMessage = output.response_intro.trim() + '\n\n';

    if (output.query_used) {
      finalMessage += `_Query: ${String(output.query_used).trim()}_\n\n`;
    }
  
    if (Array.isArray(output.action_links) && output.action_links.length > 0) {
      output.action_links.forEach((link, index) => {
        finalMessage += `${index + 1}. *${link.label || 'Link'}:* ${link.url}\n`;
      });   
      finalMessage += '\n';
    }
  
    if (Array.isArray(output.answers) && output.answers.length > 0) {
        output.answers.forEach((ans, index) => {
        let desc = cleanDescription(ans.description);
        let extra = '';
    
        if (ans.product) {
          extra += `\n*Product:* ${ans.product}`;
        }
    
        if (ans.stock_qty !== undefined && ans.stock_qty !== null && ans.stock_qty !== '') {
          extra += `\n*Quantity:* ${ans.stock_qty}`;
        }
    
        let line = `${index + 1}. ${desc}${extra}`;
    
        if (ans.is_discontinued === true || ans.is_discontinued === 'true') {
          line += '  ⚠️  *(PRODUCT DISCONTINUED)*';
        }
          
        if (ans.is_expired === true || ans.is_expired === 'true') {
          line += '  ⚠️  *(PROMO EXPIRED)*';
        }
    
        finalMessage += line + '\n';
      });
    
      finalMessage += '\n';
    }

    if (output.suggested_next_action) {
      finalMessage += output.suggested_next_action.trim() + '\n\n';
    }

    const timestamp = output?.last_updated_at;
    if (timestamp) {
      const formatted = formatTimestamp(timestamp);
      if (formatted) {
        finalMessage += `_Data last updated: ${formatted}_`;
      }
    }

    output.response = cleanDescription(finalMessage.trim());
  }

// in output_exchange, after parsing — repair agent-mangled attachment URLs.
// The agent corrupts the FILENAME segment (spaces→underscores) but gets the base
// path right. Keep the base from its url, swap the last segment for the real filename.
if (output && Array.isArray(output.attachments)) {
  output.attachments = output.attachments.map(a => {
    if (a.url && a.filename) {
      const lastSlash = a.url.lastIndexOf('/');
      if (lastSlash !== -1) {
        const base = a.url.slice(0, lastSlash + 1);   // keep whatever folder it used
        return { ...a, url: base + a.filename };       // trustworthy filename, spaces intact
      }
    }
    return a;
  });
}

  return output;