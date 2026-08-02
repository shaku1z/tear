/**
 * Test-build browser storage selection. The production composition continues
 * to receive the page's default IndexedDB factory; an explicit storage bucket
 * lets a browser journey exercise the same adapter under a real bounded quota.
 */
interface BrowserStorageBucket {
  readonly indexedDB: IDBFactory;
}

interface BrowserStorageBuckets {
  open(name: string, options: Readonly<{ quota: number; durability: "strict" }>): Promise<BrowserStorageBucket>;
}

interface StorageBucketNavigator extends Navigator {
  readonly storageBuckets?: BrowserStorageBuckets;
}

const PHYSICAL_QUOTA_BUCKET = "tear-c28-physical-quota";
const PHYSICAL_QUOTA_BYTES = 50 * 1024;

/**
 * Opens a deliberately small, browser-enforced bucket only for the C28
 * evidence journey. This is a storage configuration, not a write-failure
 * injection: every operation still goes through the normal IndexedDB adapter.
 */
export async function browserIndexedDbForTestStorage(): Promise<IDBFactory | undefined> {
  if (!__TEAR_TEST_BUILD__) return undefined;
  if (new URLSearchParams(window.location.search).get("ghost-vault-storage") !== "physical-quota") return undefined;
  const buckets = (navigator as StorageBucketNavigator).storageBuckets;
  if (buckets === undefined) throw new Error("C28 physical quota evidence requires the browser Storage Buckets API");
  return (await buckets.open(PHYSICAL_QUOTA_BUCKET, { quota: PHYSICAL_QUOTA_BYTES, durability: "strict" })).indexedDB;
}

export const c28PhysicalQuotaBucket = Object.freeze({ name: PHYSICAL_QUOTA_BUCKET, quotaBytes: PHYSICAL_QUOTA_BYTES });
