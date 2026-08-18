-- R2 has already completed when a capsule enters `verifying`; it must never
-- remain resumable merely because the isolated verifier is temporarily down.
PRAGMA foreign_keys = OFF;
CREATE TABLE ghost_uploads_v4 (
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
  part_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('uploading', 'verifying', 'finalized', 'deleting', 'deleted', 'quarantined')),
  verdict_json TEXT,
  active_verdict_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
INSERT INTO ghost_uploads_v4 (
  capsule_id, upload_id, object_key, owner_id, build_id, schema_version, byte_length,
  content_hash, result_hash, title, tags_json, privacy_class, eligibility_json,
  visibility, training_consent, part_count, status, verdict_json, active_verdict_id,
  created_at, updated_at
) SELECT capsule_id, upload_id, object_key, owner_id, build_id, schema_version, byte_length,
  content_hash, result_hash, title, tags_json, privacy_class, eligibility_json,
  'private', training_consent, part_count,
  CASE WHEN status = 'finalized' THEN 'quarantined' ELSE status END,
  NULL, NULL, created_at, updated_at FROM ghost_uploads;
DROP TABLE ghost_uploads;
ALTER TABLE ghost_uploads_v4 RENAME TO ghost_uploads;
CREATE INDEX ghost_public_feed ON ghost_uploads(status, visibility, updated_at DESC);
CREATE INDEX ghost_owner_sync ON ghost_uploads(owner_id, updated_at DESC);
CREATE TABLE ghost_verdict_receipts (
  verdict_id TEXT PRIMARY KEY,
  capsule_id TEXT NOT NULL REFERENCES ghost_uploads(capsule_id),
  verifier_id TEXT NOT NULL,
  verification_version TEXT NOT NULL,
  issued_at TEXT NOT NULL,
  verdict_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX ghost_active_verdict_per_capsule ON ghost_verdict_receipts(capsule_id, verification_version);
CREATE TABLE ghost_capsule_reports (
  capsule_id TEXT NOT NULL REFERENCES ghost_uploads(capsule_id),
  reporter_id TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('exploit', 'privacy', 'abuse', 'copyright', 'other')),
  created_at TEXT NOT NULL,
  PRIMARY KEY (capsule_id, reporter_id)
);
CREATE INDEX ghost_report_intake ON ghost_capsule_reports(capsule_id, created_at DESC);
PRAGMA foreign_keys = ON;
