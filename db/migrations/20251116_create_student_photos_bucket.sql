-- Create Supabase Storage bucket for student photos (private)
-- Idempotent: ignore if already exists
DO $$
BEGIN
  PERFORM storage.create_bucket(
    bucket_id => 'student-photos',
    public => false,
    file_size_limit => '1048576' -- 1 MB
  );
EXCEPTION WHEN duplicate_object THEN
  -- bucket already exists, ensure it stays private and limit is set
  PERFORM storage.set_bucket_public('student-photos', false);
END $$;

-- NOTE: Policies for storage.objects are intentionally deferred.
-- We will add fine-grained policies allowing only authenticated admins/registry to upload
-- and read via signed URLs when we wire the upload flow.
-- Example skeleton (do NOT enable yet):
--
-- CREATE POLICY "allow_admin_registry_upload_student_photos" ON storage.objects
--   FOR INSERT TO authenticated
--   WITH CHECK (
--     bucket_id = 'student-photos'
--     AND (auth.role() = 'authenticated') -- replace with proper function checks when available
--   );
--
-- CREATE POLICY "allow_read_via_signed_urls_only" ON storage.objects
--   FOR SELECT TO authenticated
--   USING (
--     bucket_id = 'student-photos'
--   );
