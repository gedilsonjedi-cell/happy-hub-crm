
-- ============================================================
-- FIX #1: CACHED AUTH CONTEXT FUNCTIONS
-- Eliminates billions of sequential scans on user_roles/profiles
-- Each function resolves ONCE per transaction, then reads from cache
-- ============================================================

-- 1a. Cached get_user_organization_id
CREATE OR REPLACE FUNCTION public.get_user_organization_id(_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _org_id uuid;
  _cached text;
BEGIN
  IF _user_id = auth.uid() THEN
    _cached := current_setting('app.auth_org_id', true);
    IF _cached IS NOT NULL AND _cached != '' THEN
      RETURN _cached::uuid;
    END IF;
  END IF;

  SELECT organization_id INTO _org_id
  FROM profiles WHERE user_id = _user_id LIMIT 1;

  IF _user_id = auth.uid() THEN
    PERFORM set_config('app.auth_org_id', COALESCE(_org_id::text, ''), true);
  END IF;

  RETURN _org_id;
END;
$$;

-- 1b. Internal helper: resolve and cache role
CREATE OR REPLACE FUNCTION public._resolve_auth_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role text;
  _cached text;
BEGIN
  _cached := current_setting('app.auth_role', true);
  IF _cached IS NOT NULL AND _cached != '' THEN
    RETURN _cached;
  END IF;

  SELECT role::text INTO _role
  FROM user_roles WHERE user_id = auth.uid();

  _role := COALESCE(_role, 'user');
  PERFORM set_config('app.auth_role', _role, true);
  RETURN _role;
END;
$$;

-- 1c. Cached is_super_admin
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id = auth.uid() THEN
    RETURN _resolve_auth_role() = 'super_admin';
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = 'super_admin'
  );
END;
$$;

-- 1d. Cached is_admin
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id = auth.uid() THEN
    RETURN _resolve_auth_role() IN ('admin', 'super_admin');
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = 'admin'
  );
END;
$$;

-- 1e. Cached is_admin_or_supervisor
CREATE OR REPLACE FUNCTION public.is_admin_or_supervisor(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id = auth.uid() THEN
    RETURN _resolve_auth_role() IN ('admin', 'supervisor', 'super_admin');
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = _user_id AND role IN ('admin', 'supervisor')
  );
END;
$$;

-- 1f. Cached has_role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id = auth.uid() THEN
    RETURN _resolve_auth_role() = _role::text;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM user_roles WHERE user_id = _user_id AND role = _role
  );
END;
$$;

-- 1g. Optimized user_can_access_conversation (uses cached functions)
CREATE OR REPLACE FUNCTION public.user_can_access_conversation(conversation_sector_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF conversation_sector_id IS NULL THEN RETURN TRUE; END IF;
  IF is_super_admin(auth.uid()) THEN RETURN TRUE; END IF;
  IF is_admin_or_supervisor(auth.uid()) THEN RETURN TRUE; END IF;
  RETURN EXISTS (
    SELECT 1 FROM user_sectors
    WHERE user_id = auth.uid() AND sector_id = conversation_sector_id
  );
END;
$$;

-- 1h. Optimized user_can_access_campaign (uses cached functions)
CREATE OR REPLACE FUNCTION public.user_can_access_campaign(campaign_sector_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF campaign_sector_id IS NULL THEN RETURN TRUE; END IF;
  IF is_super_admin(auth.uid()) THEN RETURN TRUE; END IF;
  IF is_admin_or_supervisor(auth.uid()) THEN RETURN TRUE; END IF;
  RETURN EXISTS (
    SELECT 1 FROM user_sectors
    WHERE user_id = auth.uid() AND sector_id = campaign_sector_id
  );
END;
$$;

-- ============================================================
-- FIX #1b: REWRITE HIGH-VOLUME TABLE POLICIES
-- Replace inline profiles subqueries with cached function calls
-- ============================================================

-- ── whatsapp_messages ──
DROP POLICY IF EXISTS "Users can view messages from their organization channels" ON whatsapp_messages;
DROP POLICY IF EXISTS "Users can mark messages as read" ON whatsapp_messages;

CREATE POLICY "Users can view messages from their organization channels" ON whatsapp_messages
FOR SELECT USING (
  is_super_admin(auth.uid())
  OR channel_id IN (SELECT id FROM channels WHERE organization_id = get_user_organization_id(auth.uid()))
);

CREATE POLICY "Users can mark messages as read" ON whatsapp_messages
FOR UPDATE USING (
  is_super_admin(auth.uid())
  OR channel_id IN (SELECT id FROM channels WHERE organization_id = get_user_organization_id(auth.uid()))
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR channel_id IN (SELECT id FROM channels WHERE organization_id = get_user_organization_id(auth.uid()))
);

-- ── channels ──
DROP POLICY IF EXISTS "Organization members can view channels" ON channels;
DROP POLICY IF EXISTS "Organization members can create channels" ON channels;
DROP POLICY IF EXISTS "Organization admins can update channels" ON channels;
DROP POLICY IF EXISTS "Organization admins can delete channels" ON channels;

CREATE POLICY "Organization members can view channels" ON channels
FOR SELECT USING (
  organization_id = get_user_organization_id(auth.uid())
  OR is_super_admin(auth.uid())
);

CREATE POLICY "Organization members can create channels" ON channels
FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND (is_super_admin(auth.uid()) OR organization_id = get_user_organization_id(auth.uid()))
);

CREATE POLICY "Organization admins can update channels" ON channels
FOR UPDATE USING (
  is_super_admin(auth.uid())
  OR (
    organization_id = get_user_organization_id(auth.uid())
    AND (auth.uid() = user_id OR is_admin_or_supervisor(auth.uid()))
  )
);

CREATE POLICY "Organization admins can delete channels" ON channels
FOR DELETE USING (
  is_super_admin(auth.uid())
  OR (
    organization_id = get_user_organization_id(auth.uid())
    AND (auth.uid() = user_id OR is_admin_or_supervisor(auth.uid()))
  )
);

-- ── conversation_assignments ──
DROP POLICY IF EXISTS "Users can view conversations in their sectors" ON conversation_assignments;
DROP POLICY IF EXISTS "Organization members can insert conversation assignments" ON conversation_assignments;
DROP POLICY IF EXISTS "Organization members can update conversation assignments" ON conversation_assignments;

CREATE POLICY "Users can view conversations in their sectors" ON conversation_assignments
FOR SELECT USING (
  (
    is_super_admin(auth.uid())
    OR channel_id IN (SELECT id FROM channels WHERE organization_id = get_user_organization_id(auth.uid()))
    OR (channel_id IS NULL AND assigned_to IN (SELECT user_id FROM profiles WHERE organization_id = get_user_organization_id(auth.uid())))
  )
  AND user_can_access_conversation(sector_id)
);

CREATE POLICY "Organization members can insert conversation assignments" ON conversation_assignments
FOR INSERT WITH CHECK (
  is_super_admin(auth.uid())
  OR channel_id IN (SELECT id FROM channels WHERE organization_id = get_user_organization_id(auth.uid()))
);

CREATE POLICY "Organization members can update conversation assignments" ON conversation_assignments
FOR UPDATE USING (
  is_super_admin(auth.uid())
  OR channel_id IN (SELECT id FROM channels WHERE organization_id = get_user_organization_id(auth.uid()))
  OR (channel_id IS NULL AND assigned_to IN (SELECT user_id FROM profiles WHERE organization_id = get_user_organization_id(auth.uid())))
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR channel_id IN (SELECT id FROM channels WHERE organization_id = get_user_organization_id(auth.uid()))
  OR (channel_id IS NULL AND assigned_to IN (SELECT user_id FROM profiles WHERE organization_id = get_user_organization_id(auth.uid())))
);

-- ── campaign_recipients (high volume - 58K rows) ──
DROP POLICY IF EXISTS "Users can view their organization recipients" ON campaign_recipients;
DROP POLICY IF EXISTS "Users can update recipients for their campaigns" ON campaign_recipients;
DROP POLICY IF EXISTS "Users can insert recipients for their campaigns" ON campaign_recipients;

CREATE POLICY "Users can view their organization recipients" ON campaign_recipients
FOR SELECT USING (
  is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM campaigns c
    WHERE c.id = campaign_recipients.campaign_id
    AND c.organization_id = get_user_organization_id(auth.uid())
  )
);

CREATE POLICY "Users can update recipients for their campaigns" ON campaign_recipients
FOR UPDATE USING (
  is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM campaigns c
    WHERE c.id = campaign_recipients.campaign_id
    AND c.organization_id = get_user_organization_id(auth.uid())
  )
);

CREATE POLICY "Users can insert recipients for their campaigns" ON campaign_recipients
FOR INSERT WITH CHECK (
  is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM campaigns c
    WHERE c.id = campaign_recipients.campaign_id
    AND c.organization_id = get_user_organization_id(auth.uid())
  )
);

-- ── conversation_metrics ──
DROP POLICY IF EXISTS "Users can view metrics for their organization" ON conversation_metrics;
CREATE POLICY "Users can view metrics for their organization" ON conversation_metrics
FOR SELECT USING (
  organization_id = get_user_organization_id(auth.uid())
);

-- ── conversation_notes ──
DROP POLICY IF EXISTS "Users can view notes from their organization" ON conversation_notes;
DROP POLICY IF EXISTS "Users can create notes for their organization" ON conversation_notes;

CREATE POLICY "Users can view notes from their organization" ON conversation_notes
FOR SELECT USING (
  organization_id = get_user_organization_id(auth.uid())
);

CREATE POLICY "Users can create notes for their organization" ON conversation_notes
FOR INSERT WITH CHECK (
  organization_id = get_user_organization_id(auth.uid())
);

-- ── conversation_memory ──
DROP POLICY IF EXISTS "Organization members can manage conversation memory" ON conversation_memory;
CREATE POLICY "Organization members can manage conversation memory" ON conversation_memory
FOR ALL USING (
  organization_id = get_user_organization_id(auth.uid())
);

-- ── client_portfolios ──
DROP POLICY IF EXISTS "Users can view portfolios in their organization" ON client_portfolios;
DROP POLICY IF EXISTS "Users can manage their own portfolio" ON client_portfolios;
DROP POLICY IF EXISTS "Admins and supervisors can manage portfolios" ON client_portfolios;

CREATE POLICY "Users can view portfolios in their organization" ON client_portfolios
FOR SELECT USING (
  organization_id = get_user_organization_id(auth.uid())
);

CREATE POLICY "Users can manage their own portfolio" ON client_portfolios
FOR ALL USING (
  user_id = auth.uid()
  AND organization_id = get_user_organization_id(auth.uid())
);

CREATE POLICY "Admins and supervisors can manage portfolios" ON client_portfolios
FOR ALL USING (
  organization_id = get_user_organization_id(auth.uid())
  AND is_admin_or_supervisor(auth.uid())
);

-- ── follow_up_instances ──
DROP POLICY IF EXISTS "Users can manage instances" ON follow_up_instances;
DROP POLICY IF EXISTS "Users can view their organization instances" ON follow_up_instances;

CREATE POLICY "Users can manage instances" ON follow_up_instances
FOR ALL USING (
  organization_id = get_user_organization_id(auth.uid())
);

CREATE POLICY "Users can view their organization instances" ON follow_up_instances
FOR SELECT USING (
  organization_id = get_user_organization_id(auth.uid())
);

-- ── follow_up_sequences ──
DROP POLICY IF EXISTS "Admins can view sequences" ON follow_up_sequences;
DROP POLICY IF EXISTS "Users can view their organization sequences" ON follow_up_sequences;
DROP POLICY IF EXISTS "Admins can insert sequences" ON follow_up_sequences;
DROP POLICY IF EXISTS "Admins can update sequences" ON follow_up_sequences;
DROP POLICY IF EXISTS "Admins can delete sequences" ON follow_up_sequences;

CREATE POLICY "Users can view their organization sequences" ON follow_up_sequences
FOR SELECT USING (
  organization_id = get_user_organization_id(auth.uid())
);

CREATE POLICY "Admins can insert sequences" ON follow_up_sequences
FOR INSERT WITH CHECK (
  organization_id = get_user_organization_id(auth.uid())
  AND (is_admin_or_supervisor(auth.uid()) OR is_super_admin(auth.uid()))
);

CREATE POLICY "Admins can update sequences" ON follow_up_sequences
FOR UPDATE USING (
  organization_id = get_user_organization_id(auth.uid())
  AND (is_admin_or_supervisor(auth.uid()) OR is_super_admin(auth.uid()))
);

CREATE POLICY "Admins can delete sequences" ON follow_up_sequences
FOR DELETE USING (
  organization_id = get_user_organization_id(auth.uid())
  AND (is_admin_or_supervisor(auth.uid()) OR is_super_admin(auth.uid()))
);

-- ── follow_up_messages ──
DROP POLICY IF EXISTS "Users can view messages" ON follow_up_messages;
DROP POLICY IF EXISTS "Users can view messages of their organization sequences" ON follow_up_messages;
DROP POLICY IF EXISTS "Admins can insert messages" ON follow_up_messages;
DROP POLICY IF EXISTS "Admins can update messages" ON follow_up_messages;
DROP POLICY IF EXISTS "Admins can delete messages" ON follow_up_messages;

CREATE POLICY "Users can view messages of their organization sequences" ON follow_up_messages
FOR SELECT USING (
  sequence_id IN (
    SELECT id FROM follow_up_sequences WHERE organization_id = get_user_organization_id(auth.uid())
  )
);

CREATE POLICY "Admins can insert messages" ON follow_up_messages
FOR INSERT WITH CHECK (
  sequence_id IN (
    SELECT id FROM follow_up_sequences WHERE organization_id = get_user_organization_id(auth.uid())
  )
  AND (is_admin_or_supervisor(auth.uid()) OR is_super_admin(auth.uid()))
);

CREATE POLICY "Admins can update messages" ON follow_up_messages
FOR UPDATE USING (
  sequence_id IN (
    SELECT id FROM follow_up_sequences WHERE organization_id = get_user_organization_id(auth.uid())
  )
  AND (is_admin_or_supervisor(auth.uid()) OR is_super_admin(auth.uid()))
);

CREATE POLICY "Admins can delete messages" ON follow_up_messages
FOR DELETE USING (
  sequence_id IN (
    SELECT id FROM follow_up_sequences WHERE organization_id = get_user_organization_id(auth.uid())
  )
  AND (is_admin_or_supervisor(auth.uid()) OR is_super_admin(auth.uid()))
);

-- ── follow_up_logs ──
DROP POLICY IF EXISTS "Users can view their organization logs" ON follow_up_logs;
CREATE POLICY "Users can view their organization logs" ON follow_up_logs
FOR SELECT USING (
  instance_id IN (
    SELECT id FROM follow_up_instances WHERE organization_id = get_user_organization_id(auth.uid())
  )
);

-- ── lead_activity_log ──
DROP POLICY IF EXISTS "Users can view activity for their organization" ON lead_activity_log;
DROP POLICY IF EXISTS "Users can insert activity for their organization" ON lead_activity_log;

CREATE POLICY "Users can view activity for their organization" ON lead_activity_log
FOR SELECT USING (
  organization_id = get_user_organization_id(auth.uid())
);

CREATE POLICY "Users can insert activity for their organization" ON lead_activity_log
FOR INSERT WITH CHECK (
  organization_id = get_user_organization_id(auth.uid())
);

-- ── lead_custom_field_definitions ──
DROP POLICY IF EXISTS "Users can view custom field definitions of their organization" ON lead_custom_field_definitions;
CREATE POLICY "Users can view custom field definitions of their organization" ON lead_custom_field_definitions
FOR SELECT USING (
  organization_id = get_user_organization_id(auth.uid())
  OR is_super_admin(auth.uid())
);

-- ── hygiene_history ──
DROP POLICY IF EXISTS "Users can view their organization hygiene history" ON hygiene_history;
DROP POLICY IF EXISTS "Users can insert hygiene history for their organization" ON hygiene_history;

CREATE POLICY "Users can view their organization hygiene history" ON hygiene_history
FOR SELECT USING (
  organization_id = get_user_organization_id(auth.uid())
);

CREATE POLICY "Users can insert hygiene history for their organization" ON hygiene_history
FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND organization_id = get_user_organization_id(auth.uid())
);

-- ── pix_payments ──
DROP POLICY IF EXISTS "Users can view their organization payments" ON pix_payments;
DROP POLICY IF EXISTS "Users can create payments for their organization" ON pix_payments;

CREATE POLICY "Users can view their organization payments" ON pix_payments
FOR SELECT USING (
  organization_id = get_user_organization_id(auth.uid())
);

CREATE POLICY "Users can create payments for their organization" ON pix_payments
FOR INSERT WITH CHECK (
  organization_id = get_user_organization_id(auth.uid())
);

-- ── profiles (fix the org-level view) ──
DROP POLICY IF EXISTS "Organization members can view organization profiles" ON profiles;
CREATE POLICY "Organization members can view organization profiles" ON profiles
FOR SELECT USING (
  organization_id = get_user_organization_id(auth.uid())
);

-- ── pipelines ──
DROP POLICY IF EXISTS "Users can view default pipelines" ON pipelines;
DROP POLICY IF EXISTS "Users can update their organization pipelines" ON pipelines;
DROP POLICY IF EXISTS "Users can delete their organization pipelines" ON pipelines;
DROP POLICY IF EXISTS "Users can create pipelines for their organization" ON pipelines;

CREATE POLICY "Users can view default pipelines" ON pipelines
FOR SELECT USING (
  is_default = true OR organization_id = get_user_organization_id(auth.uid())
);

CREATE POLICY "Users can create pipelines for their organization" ON pipelines
FOR INSERT WITH CHECK (
  organization_id = get_user_organization_id(auth.uid())
);

CREATE POLICY "Users can update their organization pipelines" ON pipelines
FOR UPDATE USING (
  organization_id = get_user_organization_id(auth.uid())
);

CREATE POLICY "Users can delete their organization pipelines" ON pipelines
FOR DELETE USING (
  is_default = false AND organization_id = get_user_organization_id(auth.uid())
);

-- ── quick_responses ──
DROP POLICY IF EXISTS "Users can view their own and global quick responses" ON quick_responses;
CREATE POLICY "Users can view their own and global quick responses" ON quick_responses
FOR SELECT USING (
  auth.uid() = user_id
  OR is_global = true
  OR organization_id = get_user_organization_id(auth.uid())
);

-- ── redirect_links ──
DROP POLICY IF EXISTS "Users can view own org links" ON redirect_links;
DROP POLICY IF EXISTS "Users can insert own org links" ON redirect_links;
DROP POLICY IF EXISTS "Users can update own org links" ON redirect_links;
DROP POLICY IF EXISTS "Users can delete own org links" ON redirect_links;

CREATE POLICY "Users can view own org links" ON redirect_links
FOR SELECT USING (
  organization_id = get_user_organization_id(auth.uid())
);

CREATE POLICY "Users can insert own org links" ON redirect_links
FOR INSERT WITH CHECK (
  organization_id = get_user_organization_id(auth.uid())
);

CREATE POLICY "Users can update own org links" ON redirect_links
FOR UPDATE USING (
  organization_id = get_user_organization_id(auth.uid())
);

CREATE POLICY "Users can delete own org links" ON redirect_links
FOR DELETE USING (
  organization_id = get_user_organization_id(auth.uid())
);

-- ── referral_codes ──
DROP POLICY IF EXISTS "Users can view their organization referral code" ON referral_codes;
DROP POLICY IF EXISTS "Users can create referral code for their organization" ON referral_codes;

CREATE POLICY "Users can view their organization referral code" ON referral_codes
FOR SELECT USING (
  organization_id = get_user_organization_id(auth.uid())
);

CREATE POLICY "Users can create referral code for their organization" ON referral_codes
FOR INSERT WITH CHECK (
  organization_id = get_user_organization_id(auth.uid())
);

-- ── referrals ──
DROP POLICY IF EXISTS "Users can view referrals where they are the referrer" ON referrals;
CREATE POLICY "Users can view referrals where they are the referrer" ON referrals
FOR SELECT USING (
  referrer_organization_id = get_user_organization_id(auth.uid())
);

-- ── auto_recharge_config ──
DROP POLICY IF EXISTS "Admins can manage their organization's auto recharge config" ON auto_recharge_config;
DROP POLICY IF EXISTS "Admins can view their organization's auto recharge config" ON auto_recharge_config;

CREATE POLICY "Admins can manage their organization's auto recharge config" ON auto_recharge_config
FOR ALL USING (
  organization_id = get_user_organization_id(auth.uid())
  AND is_admin(auth.uid())
);

CREATE POLICY "Admins can view their organization's auto recharge config" ON auto_recharge_config
FOR SELECT USING (
  organization_id = get_user_organization_id(auth.uid())
  AND (is_admin(auth.uid()) OR is_super_admin(auth.uid()))
);

-- ── channel_templates ──
DROP POLICY IF EXISTS "Organization members can view channel templates" ON channel_templates;
DROP POLICY IF EXISTS "Organization members can insert channel templates" ON channel_templates;
DROP POLICY IF EXISTS "Organization members can update channel templates" ON channel_templates;
DROP POLICY IF EXISTS "Organization members can delete channel templates" ON channel_templates;

CREATE POLICY "Organization members can view channel templates" ON channel_templates
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM channels
    WHERE channels.id = channel_templates.channel_id
    AND (channels.organization_id = get_user_organization_id(auth.uid()) OR is_super_admin(auth.uid()))
  )
);

CREATE POLICY "Organization members can insert channel templates" ON channel_templates
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM channels
    WHERE channels.id = channel_templates.channel_id
    AND (channels.organization_id = get_user_organization_id(auth.uid()) OR is_super_admin(auth.uid()))
  )
);

CREATE POLICY "Organization members can update channel templates" ON channel_templates
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM channels
    WHERE channels.id = channel_templates.channel_id
    AND (channels.organization_id = get_user_organization_id(auth.uid()) OR is_super_admin(auth.uid()))
  )
);

CREATE POLICY "Organization members can delete channel templates" ON channel_templates
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM channels
    WHERE channels.id = channel_templates.channel_id
    AND (channels.organization_id = get_user_organization_id(auth.uid()) OR is_super_admin(auth.uid()))
  )
);

-- ── webhooks ──
DROP POLICY IF EXISTS "Users can view webhooks from their organization" ON webhooks;
DROP POLICY IF EXISTS "Users can create webhooks for their organization" ON webhooks;
DROP POLICY IF EXISTS "Users can update webhooks from their organization" ON webhooks;
DROP POLICY IF EXISTS "Users can delete webhooks from their organization" ON webhooks;

CREATE POLICY "Users can view webhooks from their organization" ON webhooks
FOR SELECT USING (
  organization_id = get_user_organization_id(auth.uid())
  OR is_super_admin(auth.uid())
);

CREATE POLICY "Users can create webhooks for their organization" ON webhooks
FOR INSERT WITH CHECK (
  organization_id = get_user_organization_id(auth.uid())
  OR is_super_admin(auth.uid())
);

CREATE POLICY "Users can update webhooks from their organization" ON webhooks
FOR UPDATE USING (
  organization_id = get_user_organization_id(auth.uid())
  OR is_super_admin(auth.uid())
);

CREATE POLICY "Users can delete webhooks from their organization" ON webhooks
FOR DELETE USING (
  organization_id = get_user_organization_id(auth.uid())
  OR is_super_admin(auth.uid())
);

-- ============================================================
-- FIX #3: INDEXES FOR get_conversations_summary LATERAL JOINS
-- ============================================================

-- Index for unread count (channel + inbound + unread + phone suffix)
CREATE INDEX IF NOT EXISTS idx_wm_unread_by_channel_phone
ON whatsapp_messages (channel_id, "right"(sender_phone, 8))
WHERE direction = 'inbound' AND is_read = false;

-- Index for last outbound message by destination
CREATE INDEX IF NOT EXISTS idx_wm_outbound_dest_created
ON whatsapp_messages (channel_id, (metadata->>'destination'), created_at DESC)
WHERE direction = 'outbound';

-- Index for channels by organization (used heavily in RLS subqueries)
CREATE INDEX IF NOT EXISTS idx_channels_org_id
ON channels (organization_id, id);

-- Index for profiles user_id (ensure fast lookup for cached function)
CREATE INDEX IF NOT EXISTS idx_profiles_user_id_org
ON profiles (user_id, organization_id);

-- Index for user_roles user_id (ensure fast lookup for cached function)
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id_role
ON user_roles (user_id, role);

-- ============================================================
-- FIX #3b: OPTIMIZED get_conversations_summary
-- Replaces heavy LATERAL joins with more efficient subqueries
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_conversations_summary(p_channel_ids uuid[], p_organization_id uuid)
RETURNS TABLE(
  assignment_id uuid,
  conversation_phone text,
  channel_id uuid,
  assigned_to uuid,
  status text,
  sector_id uuid,
  lead_id uuid,
  updated_at timestamp with time zone,
  last_message text,
  last_message_at timestamp with time zone,
  last_inbound_at timestamp with time zone,
  unread_count bigint,
  sender_name text,
  lead_name text,
  lead_tags text[],
  assigned_to_name text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH active_assignments AS (
    SELECT ca.*
    FROM conversation_assignments ca
    WHERE ca.status != 'archived'
      AND (ca.channel_id = ANY(p_channel_ids) OR ca.channel_id IS NULL)
  )
  SELECT
    ca.id AS assignment_id,
    ca.conversation_phone,
    ca.channel_id,
    ca.assigned_to,
    ca.status,
    ca.sector_id,
    ca.lead_id,
    ca.updated_at,
    lm.content AS last_message,
    lm.created_at AS last_message_at,
    li.created_at AS last_inbound_at,
    COALESCE(uc.cnt, 0)::bigint AS unread_count,
    li.sender_name,
    CASE
      WHEN l.name IS NOT NULL AND l.name NOT LIKE 'LeadWhats-%' AND l.name NOT LIKE 'WhatsApp %'
      THEN l.name
      ELSE NULL
    END AS lead_name,
    l.tags AS lead_tags,
    COALESCE(p.display_name, p.email) AS assigned_to_name
  FROM active_assignments ca
  LEFT JOIN leads l ON l.id = ca.lead_id
  LEFT JOIN profiles p ON p.user_id = ca.assigned_to
  LEFT JOIN LATERAL (
    SELECT wm.content, wm.created_at
    FROM whatsapp_messages wm
    WHERE wm.channel_id = ca.channel_id
      AND wm.created_at > now() - interval '90 days'
      AND (
        (wm.direction = 'inbound' AND RIGHT(wm.sender_phone, 8) = RIGHT(ca.conversation_phone, 8))
        OR
        (wm.direction = 'outbound' AND RIGHT(wm.metadata->>'destination', 8) = RIGHT(ca.conversation_phone, 8))
      )
    ORDER BY wm.created_at DESC
    LIMIT 1
  ) lm ON true
  LEFT JOIN LATERAL (
    SELECT wm2.created_at, wm2.sender_name
    FROM whatsapp_messages wm2
    WHERE wm2.channel_id = ca.channel_id
      AND wm2.direction = 'inbound'
      AND RIGHT(wm2.sender_phone, 8) = RIGHT(ca.conversation_phone, 8)
      AND wm2.created_at > now() - interval '90 days'
    ORDER BY wm2.created_at DESC
    LIMIT 1
  ) li ON true
  LEFT JOIN LATERAL (
    SELECT COUNT(*) AS cnt
    FROM whatsapp_messages wm3
    WHERE wm3.channel_id = ca.channel_id
      AND wm3.direction = 'inbound'
      AND wm3.is_read = false
      AND RIGHT(wm3.sender_phone, 8) = RIGHT(ca.conversation_phone, 8)
  ) uc ON true
  ORDER BY COALESCE(lm.created_at, ca.updated_at) DESC;
END;
$$;
