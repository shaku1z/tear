-- Reviewer action is deliberately separate from the immutable verifier receipt.
-- A hold stores the exact verifier and original public intent that it froze.
CREATE TABLE ghost_moderation_state (
  capsule_id TEXT PRIMARY KEY REFERENCES ghost_uploads(capsule_id),
  source_verdict_id TEXT NOT NULL REFERENCES ghost_verdict_receipts(verdict_id),
  original_visibility TEXT NOT NULL CHECK (original_visibility IN ('public', 'unlisted')),
  state TEXT NOT NULL CHECK (state = 'held'),
  held_decision_id TEXT NOT NULL UNIQUE,
  held_at TEXT NOT NULL
);
CREATE TABLE ghost_moderation_decisions (
  decision_id TEXT PRIMARY KEY,
  capsule_id TEXT NOT NULL REFERENCES ghost_uploads(capsule_id),
  reviewer_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('hold', 'release')),
  source_verdict_id TEXT NOT NULL REFERENCES ghost_verdict_receipts(verdict_id),
  policy_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX ghost_moderation_decisions_capsule ON ghost_moderation_decisions(capsule_id, created_at DESC);
