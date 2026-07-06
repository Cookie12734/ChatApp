import { type SupabaseClient } from "@supabase/supabase-js";

export function getSupabaseRealtimeClient(): SupabaseClient | null {
  // ponytail: public broadcast channels are not per-user authorized here; polling stays safe.
  return null;
}

export function getDirectChatChannelName(userAId: string, userBId: string) {
  return `direct-chat:${[userAId, userBId].sort().join(":")}`;
}
