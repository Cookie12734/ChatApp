import { randomUUID } from "crypto";

import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import { type Adapter, type AdapterUser } from "next-auth/adapters";
import Credentials from "next-auth/providers/credentials";
import DiscordProvider from "next-auth/providers/discord";

import { normalizeEmailAddress } from "~/features/auth/lib/email-normalization";
import { findUserByNormalizedEmail } from "~/features/auth/lib/email-user";
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

type AdapterUserRecord = {
  email: string | null;
  emailVerified: Date | null;
  id: string;
  image: string | null;
  name: string | null;
};

function toAdapterUser(user: AdapterUserRecord) {
  if (!user.email) {
    throw new Error("Adapter user is missing an email address.");
  }

  return {
    email: user.email,
    emailVerified: user.emailVerified,
    id: user.id,
    image: user.image,
    name: user.name,
  } satisfies AdapterUser;
}

const adapter = {
  ...PrismaAdapter(db),
  async createUser({ id: _id, ...user }: AdapterUser) {
    const email = normalizeEmailAddress(user.email);
    const created = await db.user.create({
      data: {
        email,
        emailVerified: user.emailVerified ?? null,
        image: user.image ?? null,
        name: user.name ?? null,
        userId: await createUniqueOAuthUserId(email.split("@")[0] ?? user.name),
      },
    });

    return toAdapterUser(created);
  },
  async getUserByEmail(email: string) {
    const { isAmbiguous, user } = await findUserByNormalizedEmail(email);

    if (isAmbiguous) {
      throw new Error("Multiple users match the normalized email address.");
    }

    return user ? toAdapterUser(user) : null;
  },
  async updateUser({ id, ...user }) {
    const updated = await db.user.update({
      where: { id },
      data: {
        ...user,
        ...(user.email === undefined
          ? {}
          : { email: normalizeEmailAddress(user.email) }),
      },
    });

    return toAdapterUser(updated);
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

        const { isAmbiguous, normalizedEmail, user } =
          await findUserByNormalizedEmail(email);

        if (isAmbiguous || !user?.passwordHash || !user.emailVerified) {
          return null;
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
          return null;
        }

        const authenticatedUser =
          user.email === normalizedEmail
            ? user
            : await db.user.update({
                where: { id: user.id },
                data: { email: normalizedEmail },
              });

        return {
          id: authenticatedUser.id,
          name: authenticatedUser.name,
          email: authenticatedUser.email,
          image: authenticatedUser.image,
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
