import { STORAGE_KEYS } from '../config/constants.js';
import { saveQueueVisit, submitRating } from './connectorApi.js';

export function getOfflineQueue() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.OFFLINE_QUEUE);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

export function enqueueOfflineItem(item) {
  const queue = getOfflineQueue();
  queue.push({
    id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    created_at: new Date().toISOString(),
    ...item
  });
  localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(queue));
  return queue.length;
}

export async function flushOfflineQueue(tenantSession) {
  const queue = getOfflineQueue();
  if (!queue.length || !tenantSession?.api_url) {
    return { synced: 0, remaining: queue.length };
  }
  const remaining = [];
  let synced = 0;

  for (const item of queue) {
    try {
      if (item.kind === 'rating') {
        await submitRating(tenantSession, item.payload);
      } else {
        await saveQueueVisit(tenantSession, item.payload);
      }
      synced += 1;
    } catch (_) {
      remaining.push(item);
    }
  }

  localStorage.setItem(STORAGE_KEYS.OFFLINE_QUEUE, JSON.stringify(remaining));
  return { synced, remaining: remaining.length };
}
