-- Keep database-level uniqueness aligned with normalizeEmailAddress(email),
-- which trims and lowercases before auth lookups and writes.
DO $$
DECLARE
  collision_count bigint;
  collision_examples text;
BEGIN
  SELECT COUNT(*)
  INTO collision_count
  FROM (
    SELECT lower(btrim("email")) AS normalized_email
    FROM "User"
    WHERE "email" IS NOT NULL
    GROUP BY lower(btrim("email"))
    HAVING COUNT(*) > 1
  ) collisions;

  IF collision_count > 0 THEN
    SELECT string_agg(
      normalized_email || ' [ids: ' || ids || ']',
      '; ' ORDER BY normalized_email
    )
    INTO collision_examples
    FROM (
      SELECT
        lower(btrim("email")) AS normalized_email,
        string_agg("id", ', ' ORDER BY "id") AS ids
      FROM "User"
      WHERE "email" IS NOT NULL
      GROUP BY lower(btrim("email"))
      HAVING COUNT(*) > 1
      ORDER BY normalized_email
      LIMIT 10
    ) examples;

    RAISE EXCEPTION
      'Cannot add normalized User.email uniqueness: % normalized email value(s) have duplicates. Resolve duplicate User rows before rerunning this migration. Examples: %',
      collision_count,
      collision_examples;
  END IF;
END $$;

UPDATE "User"
SET "email" = lower(btrim("email"))
WHERE "email" IS NOT NULL
  AND "email" <> lower(btrim("email"));

CREATE UNIQUE INDEX "User_email_normalized_key"
ON "User" (lower(btrim("email")))
WHERE "email" IS NOT NULL;
