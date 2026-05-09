CREATE TABLE IF NOT EXISTS public.media_migration_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  migrated bigint NOT NULL DEFAULT 0,
  skipped bigint NOT NULL DEFAULT 0,
  failed bigint NOT NULL DEFAULT 0,
  urls_updated bigint NOT NULL DEFAULT 0,
  last_folder text,
  last_error text,
  delete_after boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.media_migration_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin reads progress" ON public.media_migration_progress;
CREATE POLICY "super_admin reads progress"
ON public.media_migration_progress FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));