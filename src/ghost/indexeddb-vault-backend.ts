import {
  GHOST_VAULT_DATABASE_VERSION,
  GHOST_VAULT_STORES,
  ghostVaultJournalLease,
  type GhostVaultBackend,
  type GhostVaultStore,
  type GhostVaultWrite,
} from "./capsule-vault-backend";

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
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB open failed"));
    };
  });
  const transaction = <T>(
    store: GhostVaultStore,
    mode: IDBTransactionMode,
    execute: (objectStore: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> =>
    new Promise((resolve, reject) => {
      const tx = database.transaction(store, mode);
      const request = execute(tx.objectStore(store));
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        reject(request.error ?? new Error(`IndexedDB ${mode} failed`));
      };
    });
  const commit = (operations: readonly GhostVaultWrite[]): Promise<void> =>
    new Promise((resolve, reject) => {
      if (operations.length === 0) {
        resolve();
        return;
      }
      const tx = database.transaction([...new Set(operations.map((operation) => operation.store))], "readwrite");
      applyWrites(tx, operations);
      tx.oncomplete = () => {
        resolve();
      };
      tx.onerror = () => {
        reject(tx.error ?? new Error("IndexedDB recording commit failed"));
      };
      tx.onabort = () => {
        reject(tx.error ?? new Error("IndexedDB recording commit aborted"));
      };
    });
  return Object.freeze({
    async get(store, key) {
      const value = await transaction<unknown>(store, "readonly", (objectStore) => objectStore.get(key));
      return typeof value === "string" ? value : undefined;
    },
    async put(store, key, value) {
      await transaction<IDBValidKey>(store, "readwrite", (objectStore) => objectStore.put(value, key));
    },
    async remove(store, key) {
      await transaction<undefined>(store, "readwrite", (objectStore) => objectStore.delete(key));
    },
    async keys(store) {
      const keys = await transaction<IDBValidKey[]>(store, "readonly", (objectStore) => objectStore.getAllKeys());
      return Object.freeze(keys.map(String).sort());
    },
    commit,
    commitIfMatches(guards, operations) {
      return new Promise<void>((resolve, reject) => {
        const stores = [
          ...new Set([...guards.map((guard) => guard.store), ...operations.map((operation) => operation.store)]),
        ];
        const tx = database.transaction(stores, "readwrite");
        let error: Error | undefined;
        let remaining = guards.length;
        const fail = (reason: Error): void => {
          if (error !== undefined) return;
          error = reason;
          tx.abort();
        };
        const apply = (): void => {
          if (error !== undefined || remaining !== 0) return;
          applyWrites(tx, operations);
        };
        if (guards.length === 0) apply();
        for (const guard of guards) {
          const request = tx.objectStore(guard.store).get(guard.key);
          request.onerror = () => {
            fail(request.error ?? new Error("Vault conditional read failed"));
          };
          request.onsuccess = () => {
            if (error !== undefined) return;
            if (request.result !== guard.expected) {
              fail(new Error("Vault conditional write no longer matches"));
              return;
            }
            remaining -= 1;
            apply();
          };
        }
        tx.oncomplete = () => {
          resolve();
        };
        tx.onerror = () => {
          reject(error ?? tx.error ?? new Error("Vault conditional write failed"));
        };
        tx.onabort = () => {
          reject(error ?? tx.error ?? new Error("Vault conditional write aborted"));
        };
      });
    },
    commitWhileJournalMatches(sessionId, leaseId, operations, guards = []) {
      return new Promise<void>((resolve, reject) => {
        const stores = [
          ...new Set([
            "journals" as const,
            ...operations.map((operation) => operation.store),
            ...guards.map((guard) => guard.store),
          ]),
        ];
        const tx = database.transaction(stores, "readwrite");
        let guardError: Error | undefined;
        let remaining = guards.length;
        let journalChecked = false;
        const fail = (reason: Error): void => {
          // Aborting cancels the remaining reads, which each dispatch onerror.
          // Keep the original conflict and never abort the same transaction twice.
          if (guardError !== undefined) return;
          guardError = reason;
          tx.abort();
        };
        const apply = (): void => {
          if (guardError !== undefined || !journalChecked || remaining !== 0) return;
          applyWrites(tx, operations);
        };
        const journal = tx.objectStore("journals").get(sessionId);
        journal.onerror = () => {
          fail(journal.error ?? new Error("IndexedDB recording journal read failed"));
        };
        journal.onsuccess = () => {
          if (guardError !== undefined) return;
          if (ghostVaultJournalLease(typeof journal.result === "string" ? journal.result : undefined) !== leaseId) {
            fail(new Error(`recording journal is no longer active: ${sessionId}`));
            return;
          }
          journalChecked = true;
          apply();
        };
        for (const expected of guards) {
          const request = tx.objectStore(expected.store).get(expected.key);
          request.onerror = () => {
            fail(request.error ?? new Error("IndexedDB recording guard read failed"));
          };
          request.onsuccess = () => {
            if (guardError !== undefined) return;
            if (request.result !== expected.expected) {
              fail(new Error("Vault conditional write no longer matches"));
              return;
            }
            remaining -= 1;
            apply();
          };
        }
        tx.oncomplete = () => {
          resolve();
        };
        tx.onerror = () => {
          reject(guardError ?? tx.error ?? new Error("IndexedDB recording commit failed"));
        };
        tx.onabort = () => {
          reject(guardError ?? tx.error ?? new Error("IndexedDB recording commit aborted"));
        };
      });
    },
  } satisfies GhostVaultBackend);
}
