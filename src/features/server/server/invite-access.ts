export function getAccessibleServerInviteWhere(
  inviteCode: string,
  userId: string,
) {
  return {
    inviteCode,
    OR: [
      {
        members: {
          some: { userId },
        },
      },
      {
        members: {
          none: {
            user: {
              OR: [
                {
                  blockedUsers: {
                    some: { blockedId: userId },
                  },
                },
                {
                  blockedBy: {
                    some: { blockerId: userId },
                  },
                },
              ],
            },
          },
        },
      },
    ],
  };
}
