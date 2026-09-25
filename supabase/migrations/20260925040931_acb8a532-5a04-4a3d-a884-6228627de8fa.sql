DROP POLICY IF EXISTS "org_read_messages" ON public.whatsapp_messages;
CREATE POLICY "org_read_messages" ON public.whatsapp_messages
FOR SELECT TO authenticated
USING (organization_id = effective_org_id());

DROP POLICY IF EXISTS "org_read_contacts" ON public.whatsapp_contacts;
CREATE POLICY "org_read_contacts" ON public.whatsapp_contacts
FOR SELECT TO authenticated
USING (organization_id = effective_org_id());

DROP POLICY IF EXISTS "org_isolation_all" ON public.conversation_stats;
CREATE POLICY "org_isolation_all" ON public.conversation_stats
FOR ALL TO public
USING (organization_id::text = effective_org_id())
WITH CHECK (organization_id::text = effective_org_id());