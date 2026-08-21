-- ================================================================
-- phase: enroll
-- Atomically enrolls both Phil and Crystal into fc_members.
-- Runs after the migration creates the fc_members table.
-- Both UUIDs were already validated in preflight.
-- ================================================================

\echo '--- Enrolling Phil and Crystal ---'

INSERT INTO fc_members (user_id, role) VALUES
    ('{{PHIL_UUID}}'::uuid,    'owner'),
    ('{{CRYSTAL_UUID}}'::uuid, 'owner')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
    member_count integer;
BEGIN
    SELECT count(*) INTO member_count FROM fc_members;
    IF member_count != 2 THEN
        RAISE EXCEPTION 'FAIL: expected exactly 2 fc_members rows after enrollment, found %', member_count;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM fc_members WHERE user_id = '{{PHIL_UUID}}'::uuid) THEN
        RAISE EXCEPTION 'FAIL: Phil not found in fc_members after enrollment';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM fc_members WHERE user_id = '{{CRYSTAL_UUID}}'::uuid) THEN
        RAISE EXCEPTION 'FAIL: Crystal not found in fc_members after enrollment';
    END IF;

    RAISE NOTICE 'Both owners enrolled in fc_members.';
END $$;
