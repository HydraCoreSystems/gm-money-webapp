-- Emergency restoration of the pre-reset Financial Center backup.
-- Run only if the production reset must be reversed.
BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'fc_backup') THEN
    RAISE EXCEPTION 'fc_backup does not exist; restoration cannot continue.';
  END IF;
  IF (SELECT count(*) FROM fc_backup.accounts) != 3 THEN
    RAISE EXCEPTION 'Backup account count is not 3.';
  END IF;
  IF (SELECT count(*) FROM fc_backup.transactions) != 26 THEN
    RAISE EXCEPTION 'Backup transaction count is not the audited 26.';
  END IF;
END $$;

DELETE FROM transaction_attachments;
DELETE FROM transaction_splits;
DELETE FROM reconciliations;
DELETE FROM import_history;
DELETE FROM transactions;

UPDATE accounts AS target
SET name = source.name,
    institution = source.institution,
    type = source.type,
    opening_balance = source.opening_balance,
    current_balance = source.current_balance,
    active = source.active,
    notes = source.notes,
    created_at = source.created_at,
    updated_at = source.updated_at
FROM fc_backup.accounts AS source
WHERE target.id = source.id;

INSERT INTO transactions (
  id, account_id, date, posted_date, payee, original_description, amount, transaction_type,
  category_id, subcategory_id, memo, payment_method, reference_num, cleared_status,
  review_status, transfer_account_id, transfer_transaction_id, created_at, updated_at,
  fingerprint, import_id
)
OVERRIDING SYSTEM VALUE
SELECT id, account_id, date, posted_date, payee, original_description, amount, transaction_type,
       category_id, subcategory_id, memo, payment_method, reference_num, cleared_status,
       review_status, transfer_account_id, transfer_transaction_id, created_at, updated_at,
       fingerprint, import_id
FROM fc_backup.transactions;

INSERT INTO transaction_splits (id, transaction_id, category_id, subcategory_id, amount, memo, created_at)
OVERRIDING SYSTEM VALUE
SELECT id, transaction_id, category_id, subcategory_id, amount, memo, created_at
FROM fc_backup.transaction_splits;

INSERT INTO transaction_attachments (id, transaction_id, filename, original_name, mime_type, file_size, created_at)
OVERRIDING SYSTEM VALUE
SELECT id, transaction_id, filename, original_name, mime_type, file_size, created_at
FROM fc_backup.transaction_attachments;

INSERT INTO reconciliations (id, account_id, statement_date, statement_balance, cleared_balance, difference, status, completed_at)
OVERRIDING SYSTEM VALUE
SELECT id, account_id, statement_date, statement_balance, cleared_balance, difference, status, completed_at
FROM fc_backup.reconciliations;

SELECT setval(pg_get_serial_sequence('transactions', 'id'), COALESCE((SELECT max(id) FROM transactions), 1), EXISTS (SELECT 1 FROM transactions));
SELECT setval(pg_get_serial_sequence('transaction_splits', 'id'), COALESCE((SELECT max(id) FROM transaction_splits), 1), EXISTS (SELECT 1 FROM transaction_splits));
SELECT setval(pg_get_serial_sequence('transaction_attachments', 'id'), COALESCE((SELECT max(id) FROM transaction_attachments), 1), EXISTS (SELECT 1 FROM transaction_attachments));
SELECT setval(pg_get_serial_sequence('reconciliations', 'id'), COALESCE((SELECT max(id) FROM reconciliations), 1), EXISTS (SELECT 1 FROM reconciliations));

DO $$
BEGIN
  IF (SELECT count(*) FROM transactions) != 26 THEN
    RAISE EXCEPTION 'Restoration verification failed: expected 26 transactions.';
  END IF;
  IF (SELECT count(*) FROM accounts) != 3 THEN
    RAISE EXCEPTION 'Restoration verification failed: expected 3 accounts.';
  END IF;
END $$;

COMMIT;
SELECT 'RESTORATION SUCCESSFUL — fc_backup retained for verification' AS restoration_status;
