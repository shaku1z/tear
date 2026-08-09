-- Deletion must survive the boundary between D1 metadata and the R2 object.
-- `pending` is intentionally not externally readable: ghost_uploads is first
-- made deleting/private in the same D1 batch as this durable request.
CREATE TABLE ghost_capsule_deletions (
  capsule_id TEXT PRIMARY KEY REFERENCES ghost_uploads(capsule_id),
  owner_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('pending', 'purged')),
  attempts INTEGER NOT NULL DEFAULT 0,
  requested_at TEXT NOT NULL,
  purged_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX ghost_capsule_deletion_retry
  ON ghost_capsule_deletions(state, updated_at ASC);
