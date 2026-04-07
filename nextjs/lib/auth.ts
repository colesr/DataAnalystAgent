import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { db } from "./db";
import {
  users,
  accounts,
  sessions,
  verificationTokens,
  workspaces,
} from "./schema";
import { eq } from "drizzle-orm";

const providers = [];
if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers,
  session: { strategy: "database" },
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        (session.user as any).id = user.id;
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      // Auto-create a default workspace for every new user
      if (user.id) {
        await db.insert(workspaces).values({ userId: user.id, name: "Default" });
      }
    },
  },
});

// Helper to get the current user's workspace (first one for now)
export async function currentWorkspace() {
  const session = await auth();
  if (!session?.user) return null;
  const userId = (session.user as any).id as string;
  const ws = await db.select().from(workspaces).where(eq(workspaces.userId, userId)).limit(1);
  return ws[0] ?? null;
}
