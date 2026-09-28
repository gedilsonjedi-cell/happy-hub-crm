GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT SELECT ON TABLE public.user_roles TO authenticated;
GRANT SELECT ON TABLE public.user_sectors TO authenticated;
GRANT SELECT ON TABLE public.sectors TO authenticated;

GRANT ALL ON TABLE public.profiles TO service_role;
GRANT ALL ON TABLE public.user_roles TO service_role;
GRANT ALL ON TABLE public.user_sectors TO service_role;
GRANT ALL ON TABLE public.sectors TO service_role;

NOTIFY pgrst, 'reload schema';