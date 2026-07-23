CREATE TABLE ghost_uploads (
  capsule_id TEXT PRIMARY KEY,
  upload_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  owner_id TEXT NOT NULL,
  build_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  byte_length INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  result_hash TEXT NOT NULL,
  title TEXT NOT NULL,
  tags_json TEXT NOT NULL,
  privacy_class TEXT NOT NULL,
  eligibility_json TEXT NOT NULL,
  visibility TEXT NOT NULL CHECK (visibility IN ('private', 'unlisted', 'public')),
  training_consent INTEGER NOT NULL CHECK (training_consent IN (0, 1)),
  status TEXT NOT NULL CHECK (status IN ('uploading', 'finalized', 'deleted', 'quarantined')),
  verdict_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE ghost_upload_parts (
  capsule_id TEXT NOT NULL REFERENCES ghost_uploads(capsule_id) ON DELETE CASCADE,
  part_number INTEGER NOT NULL,
  etag TEXT NOT NULL,
  PRIMARY KEY (capsule_id, part_number)
);

CREATE TABLE ghost_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  capsule_id TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX ghost_public_feed
  ON ghost_uploads(status, visibility, updated_at DESC);

CREATE INDEX ghost_owner_sync
  ON ghost_uploads(owner_id, updated_at DESC);
