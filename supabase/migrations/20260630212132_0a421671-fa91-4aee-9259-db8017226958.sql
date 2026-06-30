
-- Enable pg_trgm so phone ilike '%suffix' filters can use a GIN index
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Leads: trigram on phone supports ilike %suffix and %middle% lookups
CREATE INDEX IF NOT EXISTS idx_leads_phone_trgm
  ON public.leads USING gin (phone gin_trgm_ops);

-- WhatsApp messages: trigram on sender_phone for inbound ilike lookups
CREATE INDEX IF NOT EXISTS idx_wm_sender_phone_trgm
  ON public.whatsapp_messages USING gin (sender_phone gin_trgm_ops);

-- conversation_assignments: trigram on conversation_phone for ilike %suffix
CREATE INDEX IF NOT EXISTS idx_ca_phone_trgm
  ON public.conversation_assignments USING gin (conversation_phone gin_trgm_ops);

-- campaign_recipients: trigram on phone for like '%suffix' campaign lookups
CREATE INDEX IF NOT EXISTS idx_cr_phone_trgm
  ON public.campaign_recipients USING gin (phone gin_trgm_ops);

-- whatsapp_messages: metadata->>destination as text already has expression
-- indexes, but add a composite for the inbound is_read scans that show up
-- frequently in slow query log
CREATE INDEX IF NOT EXISTS idx_wm_inbound_unread_created
  ON public.whatsapp_messages (channel_id, created_at DESC)
  WHERE direction = 'inbound' AND is_read = false;

-- Refresh planner statistics so the new indexes are picked up immediately
ANALYZE public.leads;
ANALYZE public.whatsapp_messages;
ANALYZE public.conversation_assignments;
ANALYZE public.campaign_recipients;
