// logPageActivity is deliberately not called directly from client code —
// see its own top comment. getPageActivity is read-only and safe to call
// from any Server Component.
export { getPageActivity, logPageActivity } from "./pageActivity";
export type { LogPageActivityInput } from "./pageActivity";
