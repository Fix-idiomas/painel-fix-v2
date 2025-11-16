-- Storage policies for student-photos bucket (temporary permissive for validation)
-- Allow authenticated users to insert/update/select objects in this bucket.
-- Tighten later to admin/registry if needed.

DO $$
BEGIN
  -- INSERT policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'allow_student_photos_insert'
  ) THEN
    CREATE POLICY "allow_student_photos_insert" ON storage.objects
      FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'student-photos');
  END IF;

  -- UPDATE policy (for upsert/replace)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'allow_student_photos_update'
  ) THEN
    CREATE POLICY "allow_student_photos_update" ON storage.objects
      FOR UPDATE TO authenticated
      USING (bucket_id = 'student-photos')
      WITH CHECK (bucket_id = 'student-photos');
  END IF;

  -- SELECT policy (to allow createSignedUrl)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'allow_student_photos_select'
  ) THEN
    CREATE POLICY "allow_student_photos_select" ON storage.objects
      FOR SELECT TO authenticated
      USING (bucket_id = 'student-photos');
  END IF;
END $$;
