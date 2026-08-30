-- Append-only, hash-chained decision log.
--
-- Every entry's hash covers the previous entry's hash, so editing any past row
-- breaks every entry_hash after it. verifyChain() detects exactly that.
CREATE TABLE IF NOT EXISTS audit_entries (
  seq             INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id        TEXT NOT NULL UNIQUE,
  transaction_id  TEXT NOT NULL,
  timestamp       TEXT NOT NULL,
  decision        TEXT NOT NULL CHECK (decision IN ('PASS', 'BLOCK')),
  failed_checks   TEXT NOT NULL,
  reason          TEXT NOT NULL,
  snapshot_hash   TEXT NOT NULL,
  prev_entry_hash TEXT NOT NULL,
  entry_hash      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_transaction ON audit_entries (transaction_id);

-- Every nonce ever seen. Backs Check 4 (replay prevention).
CREATE TABLE IF NOT EXISTS nonces (
  nonce          TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL,
  seen_at        TEXT NOT NULL
);
