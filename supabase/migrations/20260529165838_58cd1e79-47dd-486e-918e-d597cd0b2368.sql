GRANT SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;
GRANT ALL ON public.leads TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_tags TO authenticated;
GRANT ALL ON public.lead_tags TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lead_custom_field_definitions TO authenticated;
GRANT ALL ON public.lead_custom_field_definitions TO service_role;