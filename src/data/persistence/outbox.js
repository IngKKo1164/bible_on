const DB_NAME = 'bibleon-sync-v1';
const DB_VERSION = 1;
const STORE_NAME = 'mutations';
const listeners = new Set();
const memoryFallback = new Map();

function hasIndexedDb() {
  return typeof indexedDB !== 'undefined';
}

function openDatabase() {
  if (!hasIndexedDb()) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact(mode, operation) {
  const database = await openDatabase();
  if (!database) return operation(null);
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let result;
    try {
      result = operation(store);
    } catch (error) {
      database.close();
      reject(error);
      return;
    }
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

function mutationId(userId, key, operation = 'put') {
  return `${userId}:${operation}:${key}`;
}

function notify() {
  for (const listener of listeners) listener();
}

export function createMutation(input, previous = null) {
  const now = new Date().toISOString();
  return {
    id: input.id ?? mutationId(input.userId, input.key, input.operation),
    userId: input.userId,
    authority: input.authority,
    domain: input.domain ?? input.authority,
    resource: input.resource ?? input.key,
    key: input.key,
    operation: input.operation ?? 'put',
    payload: input.payload,
    status: 'pending',
    attempts: previous?.attempts ?? 0,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    lastError: null,
  };
}

export async function enqueueOutboxMutation(input) {
  if (!input.userId) return null;
  const id = input.id ?? mutationId(input.userId, input.key, input.operation);
  const previous = await getOutboxMutation(id);
  const mutation = createMutation({ ...input, id }, previous);
  if (!hasIndexedDb()) {
    memoryFallback.set(id, mutation);
  } else {
    await transact('readwrite', (store) => store.put(mutation));
  }
  notify();
  return mutation;
}

export async function getOutboxMutation(id) {
  if (!hasIndexedDb()) return memoryFallback.get(id) ?? null;
  const database = await openDatabase();
  if (!database) return null;
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => database.close();
  });
}

export async function listOutboxMutations(userId = null) {
  let values;
  if (!hasIndexedDb()) {
    values = [...memoryFallback.values()];
  } else {
    const database = await openDatabase();
    if (!database) return [];
    values = await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => database.close();
    });
  }
  return values
    .filter((mutation) => !userId || mutation.userId === userId)
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
}

async function updateMutation(id, updater) {
  const mutation = await getOutboxMutation(id);
  if (!mutation) return null;
  const next = updater(mutation);
  if (!hasIndexedDb()) memoryFallback.set(id, next);
  else await transact('readwrite', (store) => store.put(next));
  notify();
  return next;
}

export async function markOutboxMutationSyncing(id) {
  return updateMutation(id, (mutation) => ({
    ...mutation,
    status: 'syncing',
    attempts: mutation.attempts + 1,
    updatedAt: new Date().toISOString(),
    lastError: null,
  }));
}

export async function failOutboxMutation(id, error) {
  return updateMutation(id, (mutation) => ({
    ...mutation,
    status: 'failed',
    updatedAt: new Date().toISOString(),
    lastError: error instanceof Error ? error.message : String(error),
  }));
}

export async function completeOutboxMutation(id) {
  if (!hasIndexedDb()) memoryFallback.delete(id);
  else await transact('readwrite', (store) => store.delete(id));
  notify();
}

export async function clearOutboxForUser(userId) {
  const mutations = await listOutboxMutations(userId);
  if (!hasIndexedDb()) {
    for (const mutation of mutations) memoryFallback.delete(mutation.id);
  } else {
    await transact('readwrite', (store) => {
      for (const mutation of mutations) store.delete(mutation.id);
    });
  }
  notify();
}

export async function getOutboxSummary(userId) {
  const mutations = await listOutboxMutations(userId);
  return {
    total: mutations.length,
    pending: mutations.filter((item) => item.status === 'pending').length,
    syncing: mutations.filter((item) => item.status === 'syncing').length,
    failed: mutations.filter((item) => item.status === 'failed').length,
  };
}

export function subscribeOutbox(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function outboxMutationId(userId, key, operation = 'put') {
  return mutationId(userId, key, operation);
}
