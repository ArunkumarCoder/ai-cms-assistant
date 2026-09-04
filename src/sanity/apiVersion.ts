// Hard-coded to today's date per next-sanity convention — bump when the API
// contract needs a newer version, don't compute it dynamically. Split out of
// client.ts so it can be imported (by writeClient.ts) without also running
// client.ts's env-var check as a side effect.
export const apiVersion = "2026-09-03";
