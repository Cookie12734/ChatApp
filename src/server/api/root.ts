import { chatRouter } from "~/features/chat/server/router";
import { friendRouter } from "~/features/friend/server/router";
import { groupRouter } from "~/features/group/server/router";
import { moderationRouter } from "~/features/moderation/server/router";
import { notificationRouter } from "~/features/notification/server/router";
import { profileRouter } from "~/features/profile/server/router";
import { serverRouter } from "~/features/server/server/router";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * This is the primary router for your server.
 *
 * All feature routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  chat: chatRouter,
  friend: friendRouter,
  group: groupRouter,
  moderation: moderationRouter,
  notification: notificationRouter,
  profile: profileRouter,
  server: serverRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const res = await trpc.profile.getMine();
 *       ^? User profile
 */
export const createCaller = createCallerFactory(appRouter);
