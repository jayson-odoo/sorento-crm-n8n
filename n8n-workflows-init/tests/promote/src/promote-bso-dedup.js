    // customer rows arrive multiply-coded (same account as debtor NAME, debtor CODE and a DBR-hash
    // canonical_code — measured, exec 13186947), so code-keyed dedup rendered one customer as three
    // "codes". Key customers on their display name instead; resolver similarity order keeps the
    // name-coded row first, so the kept candidate labels as the name.
    const _custKey = (x) => {
      const d = (x && x.display) || {};
      return 'cust:' + String(d.debtor_name || d.customer_name || x.canonical_code || '').trim().toLowerCase();
    };
    const key = String(m.entity_type || '').toLowerCase() === 'customer' ? _custKey(m) : code;
    if (seen.has(key)) continue;
    seen.add(key); keep.push(m);
