
-- RPC: aggregate conversation traffic by date and hour
CREATE OR REPLACE FUNCTION public.get_conversation_heatmap(
  p_organization_id uuid,
  p_days_back integer DEFAULT 7,
  p_button_filter text DEFAULT NULL
)
RETURNS TABLE(msg_date date, msg_hour integer, msg_count bigint, button_label text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (wm.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS msg_date,
    EXTRACT(HOUR FROM wm.created_at AT TIME ZONE 'America/Sao_Paulo')::integer AS msg_hour,
    COUNT(*)::bigint AS msg_count,
    COALESCE(
      wm.metadata->>'button_text',
      wm.metadata->>'title',
      wm.metadata->'interactive'->'button_reply'->>'title',
      CASE WHEN wm.message_type IN ('button', 'interactive') THEN wm.content ELSE NULL END
    ) AS button_label
  FROM whatsapp_messages wm
  INNER JOIN channels c ON c.id = wm.channel_id
  WHERE c.organization_id = p_organization_id
    AND wm.direction = 'inbound'
    AND wm.created_at >= (now() - (p_days_back || ' days')::interval)
    AND (
      p_button_filter IS NULL
      OR COALESCE(
        wm.metadata->>'button_text',
        wm.metadata->>'title',
        wm.metadata->'interactive'->'button_reply'->>'title',
        CASE WHEN wm.message_type IN ('button', 'interactive') THEN wm.content ELSE NULL END
      ) = p_button_filter
    )
  GROUP BY msg_date, msg_hour, button_label
  ORDER BY msg_date, msg_hour;
END;
$$;

-- RPC: get available button labels for an organization
CREATE OR REPLACE FUNCTION public.get_available_buttons(
  p_organization_id uuid,
  p_days_back integer DEFAULT 7
)
RETURNS TABLE(button_label text, click_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    btn AS button_label,
    COUNT(*)::bigint AS click_count
  FROM (
    SELECT COALESCE(
      wm.metadata->>'button_text',
      wm.metadata->>'title',
      wm.metadata->'interactive'->'button_reply'->>'title',
      CASE WHEN wm.message_type IN ('button', 'interactive') THEN wm.content ELSE NULL END
    ) AS btn
    FROM whatsapp_messages wm
    INNER JOIN channels c ON c.id = wm.channel_id
    WHERE c.organization_id = p_organization_id
      AND wm.direction = 'inbound'
      AND wm.created_at >= (now() - (p_days_back || ' days')::interval)
  ) sub
  WHERE btn IS NOT NULL AND btn != ''
  GROUP BY btn
  ORDER BY click_count DESC;
END;
$$;
