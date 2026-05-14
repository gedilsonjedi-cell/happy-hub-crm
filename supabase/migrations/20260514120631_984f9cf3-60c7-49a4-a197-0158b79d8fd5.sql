-- Durable campaign metrics: preserve historical counters even if operational rows are changed later
CREATE TABLE IF NOT EXISTS public.campaign_metric_snapshots (
  campaign_id uuid PRIMARY KEY REFERENCES public.campaigns(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  recipients_count bigint NOT NULL DEFAULT 0,
  sent_count bigint NOT NULL DEFAULT 0,
  delivered_count bigint NOT NULL DEFAULT 0,
  read_count bigint NOT NULL DEFAULT 0,
  failed_count bigint NOT NULL DEFAULT 0,
  interacted_count bigint NOT NULL DEFAULT 0,
  last_recalculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_metric_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view campaign metric snapshots" ON public.campaign_metric_snapshots;
CREATE POLICY "Users can view campaign metric snapshots"
ON public.campaign_metric_snapshots
FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR organization_id = public.get_user_organization_id(auth.uid())
);

CREATE INDEX IF NOT EXISTS idx_campaign_metric_snapshots_org
ON public.campaign_metric_snapshots(organization_id);

CREATE OR REPLACE FUNCTION public.refresh_campaign_metric_snapshot(p_campaign_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_total_recipients bigint;
  v_stored_sent bigint;
  v_stored_delivered bigint;
  v_stored_failed bigint;
  v_current_recipients bigint;
  v_current_sent bigint;
  v_current_delivered bigint;
  v_current_read bigint;
  v_current_failed bigint;
  v_current_interacted bigint;
BEGIN
  SELECT organization_id, COALESCE(total_recipients, 0), COALESCE(sent_count, 0), COALESCE(delivered_count, 0), COALESCE(failed_count, 0)
  INTO v_org_id, v_total_recipients, v_stored_sent, v_stored_delivered, v_stored_failed
  FROM public.campaigns
  WHERE id = p_campaign_id;

  IF v_org_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COUNT(*)::bigint,
    COUNT(*) FILTER (
      WHERE sent_at IS NOT NULL OR status IN ('sent','delivered','read','failed')
    )::bigint,
    COUNT(*) FILTER (
      WHERE status IN ('delivered','read') OR delivered_at IS NOT NULL OR read_at IS NOT NULL
    )::bigint,
    COUNT(*) FILTER (WHERE status = 'read' OR read_at IS NOT NULL)::bigint,
    COUNT(*) FILTER (WHERE status = 'failed')::bigint,
    COUNT(*) FILTER (WHERE button_clicked IS NOT NULL)::bigint
  INTO
    v_current_recipients,
    v_current_sent,
    v_current_delivered,
    v_current_read,
    v_current_failed,
    v_current_interacted
  FROM public.campaign_recipients
  WHERE campaign_id = p_campaign_id;

  INSERT INTO public.campaign_metric_snapshots (
    campaign_id,
    organization_id,
    recipients_count,
    sent_count,
    delivered_count,
    read_count,
    failed_count,
    interacted_count,
    last_recalculated_at,
    updated_at
  ) VALUES (
    p_campaign_id,
    v_org_id,
    GREATEST(v_total_recipients, COALESCE(v_current_recipients, 0)),
    GREATEST(v_stored_sent, COALESCE(v_current_sent, 0), COALESCE(v_current_delivered, 0) + COALESCE(v_current_failed, 0)),
    GREATEST(v_stored_delivered, COALESCE(v_current_delivered, 0)),
    COALESCE(v_current_read, 0),
    GREATEST(v_stored_failed, COALESCE(v_current_failed, 0)),
    COALESCE(v_current_interacted, 0),
    now(),
    now()
  )
  ON CONFLICT (campaign_id) DO UPDATE SET
    organization_id = EXCLUDED.organization_id,
    recipients_count = GREATEST(public.campaign_metric_snapshots.recipients_count, EXCLUDED.recipients_count),
    sent_count = GREATEST(public.campaign_metric_snapshots.sent_count, EXCLUDED.sent_count),
    delivered_count = GREATEST(public.campaign_metric_snapshots.delivered_count, EXCLUDED.delivered_count),
    read_count = GREATEST(public.campaign_metric_snapshots.read_count, EXCLUDED.read_count),
    failed_count = GREATEST(public.campaign_metric_snapshots.failed_count, EXCLUDED.failed_count),
    interacted_count = GREATEST(public.campaign_metric_snapshots.interacted_count, EXCLUDED.interacted_count),
    last_recalculated_at = now(),
    updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_campaign_metric_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_campaign_metric_snapshot(COALESCE(NEW.campaign_id, OLD.campaign_id));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_campaign_recipients_metric_snapshot ON public.campaign_recipients;
CREATE TRIGGER trg_campaign_recipients_metric_snapshot
AFTER INSERT OR UPDATE OR DELETE ON public.campaign_recipients
FOR EACH ROW
EXECUTE FUNCTION public.touch_campaign_metric_snapshot();

CREATE OR REPLACE FUNCTION public.touch_campaign_metric_snapshot_from_campaign()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.refresh_campaign_metric_snapshot(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_campaigns_metric_snapshot ON public.campaigns;
CREATE TRIGGER trg_campaigns_metric_snapshot
AFTER INSERT OR UPDATE OF total_recipients, sent_count, delivered_count, failed_count, status ON public.campaigns
FOR EACH ROW
EXECUTE FUNCTION public.touch_campaign_metric_snapshot_from_campaign();

-- Backfill snapshots from all current campaign rows and current recipient rows.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.campaigns LOOP
    PERFORM public.refresh_campaign_metric_snapshot(r.id);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.get_campaign_real_counts(p_campaign_ids uuid[])
RETURNS TABLE (
  campaign_id uuid,
  recipients_count bigint,
  sent_count bigint,
  delivered_count bigint,
  read_count bigint,
  failed_count bigint,
  interacted_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH authorized_campaigns AS (
    SELECT c.*
    FROM public.campaigns c
    WHERE c.id = ANY(p_campaign_ids)
      AND (
        public.is_super_admin(auth.uid())
        OR c.organization_id = public.get_user_organization_id(auth.uid())
      )
  ),
  current_counts AS (
    SELECT
      cr.campaign_id,
      COUNT(*)::bigint AS recipients_count,
      COUNT(*) FILTER (
        WHERE cr.sent_at IS NOT NULL
           OR cr.status IN ('sent','delivered','read','failed')
      )::bigint AS sent_count,
      COUNT(*) FILTER (
        WHERE cr.status IN ('delivered','read')
           OR cr.delivered_at IS NOT NULL
           OR cr.read_at IS NOT NULL
      )::bigint AS delivered_count,
      COUNT(*) FILTER (
        WHERE cr.status = 'read' OR cr.read_at IS NOT NULL
      )::bigint AS read_count,
      COUNT(*) FILTER (WHERE cr.status = 'failed')::bigint AS failed_count,
      COUNT(*) FILTER (WHERE cr.button_clicked IS NOT NULL)::bigint AS interacted_count
    FROM public.campaign_recipients cr
    WHERE cr.campaign_id = ANY(p_campaign_ids)
    GROUP BY cr.campaign_id
  )
  SELECT
    c.id AS campaign_id,
    GREATEST(COALESCE(c.total_recipients, 0), COALESCE(cc.recipients_count, 0), COALESCE(s.recipients_count, 0))::bigint AS recipients_count,
    GREATEST(
      COALESCE(c.sent_count, 0),
      COALESCE(cc.sent_count, 0),
      COALESCE(cc.delivered_count, 0) + COALESCE(cc.failed_count, 0),
      COALESCE(s.sent_count, 0),
      COALESCE(s.delivered_count, 0) + COALESCE(s.failed_count, 0)
    )::bigint AS sent_count,
    GREATEST(COALESCE(c.delivered_count, 0), COALESCE(cc.delivered_count, 0), COALESCE(s.delivered_count, 0))::bigint AS delivered_count,
    GREATEST(COALESCE(cc.read_count, 0), COALESCE(s.read_count, 0))::bigint AS read_count,
    GREATEST(COALESCE(c.failed_count, 0), COALESCE(cc.failed_count, 0), COALESCE(s.failed_count, 0))::bigint AS failed_count,
    GREATEST(COALESCE(cc.interacted_count, 0), COALESCE(s.interacted_count, 0))::bigint AS interacted_count
  FROM authorized_campaigns c
  LEFT JOIN current_counts cc ON cc.campaign_id = c.id
  LEFT JOIN public.campaign_metric_snapshots s ON s.campaign_id = c.id;
$$;

GRANT EXECUTE ON FUNCTION public.get_campaign_real_counts(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_campaign_metric_snapshot(uuid) TO authenticated;

-- Never delete campaign recipient history through the old cleanup routine.
-- Campaign metrics depend on this history for auditability and customer reporting.
CREATE OR REPLACE FUNCTION public.cleanup_old_campaign_recipients(cutoff_date timestamptz, batch_size int)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN 0;
END;
$$;

-- Keep stored campaign counters from being reduced to zero when historical recipient rows are absent.
CREATE OR REPLACE FUNCTION public.force_sync_all_campaign_counts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.campaigns c SET
    sent_count = GREATEST(COALESCE(c.sent_count, 0), COALESCE(r.sent_count, 0)),
    delivered_count = GREATEST(COALESCE(c.delivered_count, 0), COALESCE(r.delivered_count, 0)),
    failed_count = GREATEST(COALESCE(c.failed_count, 0), COALESCE(r.failed_count, 0)),
    total_recipients = GREATEST(COALESCE(c.total_recipients, 0), COALESCE(r.recipients_count, 0)),
    updated_at = now()
  FROM public.get_campaign_real_counts(ARRAY(SELECT id FROM public.campaigns)) r
  WHERE c.id = r.campaign_id
    AND c.status IN ('running', 'completed', 'paused')
    AND (
      c.sent_count IS DISTINCT FROM GREATEST(COALESCE(c.sent_count, 0), COALESCE(r.sent_count, 0))
      OR c.delivered_count IS DISTINCT FROM GREATEST(COALESCE(c.delivered_count, 0), COALESCE(r.delivered_count, 0))
      OR c.failed_count IS DISTINCT FROM GREATEST(COALESCE(c.failed_count, 0), COALESCE(r.failed_count, 0))
      OR c.total_recipients IS DISTINCT FROM GREATEST(COALESCE(c.total_recipients, 0), COALESCE(r.recipients_count, 0))
    );
END;
$$;