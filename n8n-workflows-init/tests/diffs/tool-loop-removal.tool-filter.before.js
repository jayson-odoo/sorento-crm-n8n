// pick incoming tool by scope: product present → by_product; else → shipments (date/general)
const entities = $('disallowed-entity-gate').first().json.compatible_entities
const hasProduct = entities.some(e => e.entity_type === 'product');
var raw_tools = $("Execute 'sub-get-rag'").first().json.tools;


return {
  "tools": raw_tools
}
