// ─── S8 STAND-IN for the credentialed httpRequest `get-working-days` ───
// Real node: GET https://fe-sorento.foundryx.my/api/v1/external/work-calendar
// (credential `crm-n8n-auth`). A READ, but S8 bans the node TYPE, not the verb: no
// HTTP Request node of any kind may exist in a graph run at is_test:false.
//
// Output shape mirrors what the out-of-hours reply actually consumes in
// `sorento-sub-respond-sendmsg-respond-routed-to-pic1`:
//   {{ $json.working_day_ranges[0].start_weekday }} - {{ $json.working_day_ranges[0].end_weekday }}
//   {{ $json.working_hours_start }} - {{ $json.working_hours_end }}

return {
  json: {
    working_day_ranges: [
      { start_weekday: 'Tuesday', end_weekday: 'Friday' }
    ],
    working_hours_start: '08:00',
    working_hours_end: '23:59'
  }
};
