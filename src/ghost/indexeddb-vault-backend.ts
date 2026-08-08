import {
  GHOST_VAULT_DATABASE_VERSION,
  GHOST_VAULT_STORES,
  ghostVaultJournalLease,
  type GhostVaultBackend,
  type GhostVaultStore,
  type GhostVaultWrite,
} from "./capsule-vault";

function applyWrites(transaction: IDBTransaction, operations: readonly GhostVaultWrite[]): void {
  for (const operation of operations) {
    const store = transaction.objectStore(operation.store);
    if (operation.value === undefined) store.delete(operation.key);
    else store.put(operation.value, operation.key);
  }
}

/** Browser persistence adapter; journal guards and writes share one IndexedDB transaction. */
export async function createIndexedDbGhostVaultBackend(
  factory: IDBFactory,
  databaseName = "tear-ghost-v3",
): Promise<GhostVaultBackend> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open(databaseName, GHOST_VAULT_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      for (const store of GHOST_VAULT_STORES) {
        if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store);
      }
    };
    request.onsuccess = () => { resolve(request.result); };
    request.onerror = () => { reject(request.error ?? new Error("IndexedDB open failed")); };
  });
  const transaction = <T>(
    store: GhostVaultStore,
    mode: IDBTransactionMode,
    execute: (objectStore: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> => new Promise((resolve, reject) => {
    const tx = database.transaction(store, mode);
    const request = execute(tx.objectStore(store));
    request.onsuccess = () => { resolve(request.result); };
    request.onerror = () => { reject(request.error ?? new Error(`IndexedDB ${mode} failed`)); };
  });
  const commit = (operations: readonly GhostVaultWrite[]): Promise<void> => new Promise((resolve, reject) => {
    if (operations.length === 0) { resolve(); return; }
    const tx = database.transaction([...new Set(operations.map((operation) => operation.store))], "readwrite");
    applyWrites(tx, operations);
    tx.oncomplete = () => { resolve(); };
    tx.onerror = () => { reject(tx.error ?? new Error("IndexedDB recording commit failed")); };
    tx.onabort = () => { reject(tx.error ?? new Error("IndexedDB recording commit aborted")); };
  });
  return Object.freeze({
    async get(store, key) {
      const value = await transaction<unknown>(store, "readonly", (objectStore) => objectStore.get(key));
      return typeof value === "string" ? value : undefined;
    },
    async put(store, key, value) { await transaction<IDBValidKey>(store, "readwrite", (objectStore) => objectStore.put(value, key)); },
    async remove(store, key) { await transaction<undefined>(store, "readwrite", (objectStore) => objectStore.delete(key)); },
    async keys(store) {
      const keys = await transaction<IDBValidKey[]>(store, "readonly", (objectStore) => objectStore.getAllKeys());
      return Object.freeze(keys.map(String).sort());
    },
    commit,
    commitIfMatches(guards, operations) {
      return new Promise<void>((resolve, reject) => {
        const stores = [...new Set([...guards.map((guard) => guard.store), ...operations.map((operation) => operation.store)])];
        const tx = database.transaction(stores, "readwrite"); let error: Error | undefined; let remaining = guards.length;
        const apply = (): void => { if (remaining !== 0) return; applyWrites(tx, operations); };
        if (guards.length === 0) apply();
        for (const guard of guards) { const request = tx.objectStore(guard.store).get(guard.key); request.onerror = () => { error = request.error ?? new Error("Vault conditional read failed"); tx.abort(); }; request.onsuccess = () => { if ((typeof request.result === "string" ? request.result : undefined) !== guard.expected) { error = new Error("Vault conditional write no longer matches"); tx.abort(); return; } remaining -= 1; apply(); }; }
        tx.oncomplete = () => resolve(); tx.onerror = () => reject(error ?? tx.error ?? new Error("Vault conditional write failed")); tx.onabort = () => reject(error ?? tx.error ?? new Error("Vault conditional write aborted"));
      });
    },
    commitWhileJournalMatches(sessionId, leaseId, operations) {
      return new Promise<void>((resolve, reject) => {
        const stores = [...new Set(["journals" as const, ...operations.map((operation) => operation.store)])];
        const tx = database.transaction(stores, "readwrite");
        let guardError: Error | undefined;
        const guard = tx.objectStore("journals").get(sessionId);
        guard.onerror = () => { guardError = guard.error ?? new Error("IndexedDB recording journal read failed"); tx.abort(); };
        guard.onsuccess = () => {
          if (ghostVaultJournalLease(typeof guard.result === "string" ? guard.result : undefined) !== leaseId) {
            guardError = new Error(`recording journal is no longer active: ${sessionId}`);
            tx.abort();
            return;
          }
          applyWrites(tx, operations);
        };
        tx.oncomplete = () => { resolve(); };
        tx.onerror = () => { reject(guardError ?? tx.error ?? new Error("IndexedDB recording commit failed")); };
        tx.onabort = () => { reject(guardError ?? tx.error ?? new Error("IndexedDB recording commit aborted")); };
      });
    },
  } satisfies GhostVaultBackend);
}
