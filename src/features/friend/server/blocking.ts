import { TRPCError } from "@trpc/server";

type BlockEdge = {
  blockedId: string;
  blockerId: string;
};

type BlockReader = {
  userBlock: {
    findFirst(args: {
      where: { OR: Array<{ blockedId: string; blockerId: string }> };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
};

export function getBlockedPeerIds(currentUserId: string, blocks: BlockEdge[]) {
  return [
    ...new Set(
      blocks.map((block) =>
        block.blockerId === currentUserId ? block.blockedId : block.blockerId,
      ),
    ),
  ];
}

export async function assertNotBlocked(
  db: BlockReader,
  userAId: string,
  userBId: string,
) {
  const block = await db.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: userAId, blockedId: userBId },
        { blockerId: userBId, blockedId: userAId },
      ],
    },
    select: { id: true },
  });

  if (block) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "ブロック中のユーザーとは操作できません",
    });
  }
}
