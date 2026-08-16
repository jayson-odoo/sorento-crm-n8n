// Loop over input items and add a new field called 'myNewField' to the JSON of each one
let is_valid = false
let output = $input.first().json
let semantic_parser = $('Call \'sub-query-reformulator\'').first().json
let domain_hint = semantic_parser.output.domain_hint
output.is_valid = true
if ($('Edit Fields2').isExecuted && $('Edit Fields2').first().json.not_allowed_check_stock) {
  const resultNode = $input.first().json;
  const formulatorNode = $('Call \'sub-query-reformulator\'').first().json;
  const parserOutput = formulatorNode.output ?? formulatorNode;
  const demandQty = Number(parserOutput.demand_qty ?? 0);
  
  // handle answer records from get-result
  const answers = Array.isArray(resultNode.answers) ? resultNode.answers : [];
  
  // group by product and sum stock_qty
  const grouped = {};
  
  for (const item of answers) {
    const product = item.product || 'UNKNOWN_PRODUCT';
    const stockQty = Number(item.stock_qty ?? 0);
  
    if (!grouped[product]) {
      grouped[product] = {
        product,
        total_stock_qty: 0,
        rows: [],
      };
    }
  
    grouped[product].total_stock_qty += stockQty;
    grouped[product].rows.push(item);
  }
  
  // build response_intro lines
  const introLines = Object.values(grouped).map(group => {
    const canFulfill = demandQty <= group.total_stock_qty;
    if (canFulfill) {
      return `Quantity of ${demandQty} for product ${group.product} can be fulfilled.`;
    }
    return `Quantity of ${demandQty} for product ${group.product} cannot be fulfilled. Total available quantity is ${group.total_stock_qty}.`;
  });
  output.response = introLines.join("\n")
  
}
return output