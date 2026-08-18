-- A resumable upload has one immutable, bounded topology.  Existing rows are
-- legacy and cannot be resumed through the V2 Worker contract.
ALTER TABLE ghost_uploads ADD COLUMN part_count INTEGER NOT NULL DEFAULT 0;
