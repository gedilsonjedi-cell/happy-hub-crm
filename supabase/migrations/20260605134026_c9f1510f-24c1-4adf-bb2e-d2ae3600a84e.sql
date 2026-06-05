GRANT SELECT, INSERT, UPDATE, DELETE ON public.sectors TO authenticated;
GRANT ALL ON public.sectors TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_sectors TO authenticated;
GRANT ALL ON public.user_sectors TO service_role;