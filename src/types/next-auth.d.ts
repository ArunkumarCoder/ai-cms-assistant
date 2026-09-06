import type { DefaultSession } from "next-auth";

// Augments Auth.js's built-in types with the one field this app actually
// needs on a session: our own User.id (see src/auth.ts's callbacks). Without
// this, `session.user.id`/`token.userId` type as `any`/missing everywhere
// they're read (resolveAdapter.ts, Server Actions, the DAL).
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
  }
}
