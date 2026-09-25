DO $$ BEGIN
IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='campaigns') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.campaigns; END IF;
IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='campaign_recipients') THEN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_recipients; END IF;
END $$;