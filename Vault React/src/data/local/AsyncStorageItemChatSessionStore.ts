import type { ItemChatSessionStore } from "@src/domain/contracts";
import type { ChatMessage } from "@src/domain/models";

import { readJSON, STORAGE_KEYS, writeJSON } from "./storage";

type ChatStoreState = Record<string, ChatMessage[]>;

export class AsyncStorageItemChatSessionStore implements ItemChatSessionStore {
  async load(itemID: string): Promise<ChatMessage[]> {
    const store = await readJSON<ChatStoreState>(STORAGE_KEYS.chatSessions, {});
    return store[itemID] ?? [];
  }

  async save(itemID: string, messages: ChatMessage[]): Promise<void> {
    const store = await readJSON<ChatStoreState>(STORAGE_KEYS.chatSessions, {});
    store[itemID] = messages;
    await writeJSON(STORAGE_KEYS.chatSessions, store);
  }
}
