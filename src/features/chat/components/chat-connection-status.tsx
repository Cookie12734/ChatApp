export function ChatConnectionStatus({
  isReconnecting,
}: {
  isReconnecting: boolean;
}) {
  return (
    <div
      role="status"
      aria-label="接続状態"
      aria-live="polite"
      className="shrink-0"
    >
      {isReconnecting && (
        <p className="border-connect-ink/15 bg-connect-highlight text-connect-muted shrink-0 border-b px-4 py-2 text-xs">
          再接続中 · メッセージは定期的に更新します
        </p>
      )}
    </div>
  );
}
