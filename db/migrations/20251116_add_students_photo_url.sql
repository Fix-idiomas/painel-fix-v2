-- Add photo_url column to students table (nullable)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'photo_url'
  ) THEN
    ALTER TABLE public.students ADD COLUMN photo_url text NULL;
  END IF;
END $$;

-- Optional: no index required now; we read by id and just store a path.
-- RLS policies remain the same; this is a regular column.
