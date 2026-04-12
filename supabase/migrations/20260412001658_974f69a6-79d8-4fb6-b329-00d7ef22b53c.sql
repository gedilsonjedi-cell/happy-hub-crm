
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
  IF p_button_filter IS NOT NULL THEN
    -- When filtering by button, group by button label
    RETURN QUERY
    SELECT
      (wm.created_at AT TIME ZONE 'America/Sao_Paulo')::date,
      EXTRACT(HOUR FROM wm.created_at AT TIME ZONE 'America/Sao_Paulo')::integer,
      COUNT(DISTINCT wm.sender_phone)::bigint,
      COALESCE(
        wm.metadata->>'button_text',
        wm.metadata->>'title',
        wm.metadata->'interactive'->'button_reply'->>'title',
        CASE WHEN wm.message_type IN ('button', 'interactive') THEN wm.content ELSE NULL END
      )
    FROM whatsapp_messages wm
    INNER JOIN channels c ON c.id = wm.channel_id
    WHERE c.organization_id = p_organization_id
      AND wm.direction = 'inbound'
      AND wm.created_at >= (now() - (p_days_back || ' days')::interval)
      AND COALESCE(
        wm.metadata->>'button_text',
        wm.metadata->>'title',
        wm.metadata->'interactive'->'button_reply'->>'title',
        CASE WHEN wm.message_type IN ('button', 'interactive') THEN wm.content ELSE NULL END
      ) = p_button_filter
    GROUP BY 1, 2, 4
    ORDER BY 1, 2;
  ELSE
    -- General traffic: count unique contacts per date/hour, no button grouping
    RETURN QUERY
    SELECT
      (wm.created_at AT TIME ZONE 'America/Sao_Paulo')::date,
      EXTRACT(HOUR FROM wm.created_at AT TIME ZONE 'America/Sao_Paulo')::integer,
      COUNT(DISTINCT wm.sender_phone)::bigint,
      NULL::text
    FROM whatsapp_messages wm
    INNER JOIN channels c ON c.id = wm.channel_id
    WHERE c.organization_id = p_organization_id
      AND wm.direction = 'inbound'
      AND wm.created_at >= (now() - (p_days_back || ' days')::interval)
    GROUP BY 1, 2
    ORDER BY 1, 2;
  END IF;
END;
$$;
