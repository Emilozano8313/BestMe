/**
 * BestMe — Offline Store
 * =========================
 * Two jobs, both backed by AsyncStorage so they survive an app restart:
 *
 *   1. Response cache — the last successful body for each GET path, so a
 *      screen still has something to show with no connection.
 *   2. Mutation queue — POST/PUT/PATCH/DELETE calls made while offline,
 *      replayed in order once the connection comes back.
 *
 * Deliberately not a general sync engine: this is a single-user app, so
 * "replay the queue in order, stop at the first failure" is enough —
 * there's no other client that could have raced a conflicting write.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = 'bestme.cache.';
const QUEUE_KEY = 'bestme.mutationQueue';

// ── Response cache ───────────────────────────────────────────────

export interface CacheEntry<T> {
  data: T;
  cachedAt: string;
}

export async function getCached<T>(path: string): Promise<CacheEntry<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + path);
    return raw ? (JSON.parse(raw) as CacheEntry<T>) : null;
  } catch {
    return null;
  }
}

export async function setCached<T>(path: string, data: T): Promise<void> {
  try {
    const entry: CacheEntry<T> = { data, cachedAt: new Date().toISOString() };
    await AsyncStorage.setItem(CACHE_PREFIX + path, JSON.stringify(entry));
  } catch {
    // Cache writes are best-effort — a full disk shouldn't break the request.
  }
}

// ── Mutation queue ───────────────────────────────────────────────

export interface QueuedMutation {
  id: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  body: unknown;
  createdAt: string;
  /** Shown in the UI so a queued item reads like what it is, e.g. "Comida registrada". */
  description: string;
}

export async function getQueue(): Promise<QueuedMutation[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedMutation[]) : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueuedMutation[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueueMutation(
  mutation: Omit<QueuedMutation, 'id' | 'createdAt'>,
): Promise<QueuedMutation> {
  const queue = await getQueue();
  const entry: QueuedMutation = {
    ...mutation,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  queue.push(entry);
  await saveQueue(queue);
  return entry;
}

export async function removeFromQueue(id: string): Promise<void> {
  const queue = await getQueue();
  await saveQueue(queue.filter((item) => item.id !== id));
}

export async function queueLength(): Promise<number> {
  return (await getQueue()).length;
}

/**
 * Wipes the cache and any pending queue — called on logout so a second
 * account signing in on the same device never inherits stale reads or
 * replays the previous account's queued writes under the new session.
 */
export async function clearAllOfflineData(): Promise<void> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const ours = keys.filter((k) => k.startsWith(CACHE_PREFIX) || k === QUEUE_KEY);
    if (ours.length) await AsyncStorage.multiRemove(ours);
  } catch {
    // Best-effort cleanup — a failure here shouldn't block logout.
  }
}
