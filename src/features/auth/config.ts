import { randomUUID } from "crypto";

import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import { type Adapter, type AdapterUser } from "next-auth/adapters";
import Credentials from "next-auth/providers/credentials";
import DiscordProvider from "next-auth/providers/discord";

import {
  getOAuthUserIdCandidate,
  withOAuthUserIdSuffix,
} from "~/features/auth/lib/oauth-user-id";
import { db } from "~/server/db";

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

async function createUniqueOAuthUserId(seed: string | null | undefined) {
  const candidate = getOAuthUserIdCandidate(seed);

  for (let attempt = 0; attempt < 6; attempt++) {
    const userId =
      attempt === 0
        ? candidate
        : withOAuthUserIdSuffix(candidate, randomUUID());
    const existing = await db.user.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!existing) {
      return userId;
    }
  }

  return withOAuthUserIdSuffix("user", randomUUID());
}

const adapter = {
  ...PrismaAdapter(db),
  async createUser({ id: _id, ...user }: AdapterUser) {
    const created = await db.user.create({
      data: {
        email: user.email,
        emailVerified: user.emailVerified ?? null,
        image: user.image ?? null,
        name: user.name ?? null,
        userId: await createUniqueOAuthUserId(
          user.email?.split("@")[0] ?? user.name,
        ),
      },
    });

    return {
      email: user.email,
      emailVerified: created.emailVerified,
      id: created.id,
      image: created.image,
      name: created.name,
    } satisfies AdapterUser;
  },
} satisfies Adapter;

export const authConfig = {
  session: { strategy: "jwt" },
  providers: [
    DiscordProvider,
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;

        if (typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const user = await db.user.findUnique({
          where: { email: email.trim() },
        });

        if (!user?.passwordHash || !user.emailVerified) {
          return null;
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
          return null;
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],
  pages: {
    signIn: "/auth/login",
  },
  adapter,
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
