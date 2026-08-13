DO $$
DECLARE
  src uuid := 'fd9d65c0-8e8d-4dcf-8bc8-9d860d93eb3b';
  newid uuid;
  moved int;
BEGIN
  INSERT INTO public.campaigns (user_id, name, team, chatbot_enabled, dispatch_interval, use_unified_template, unified_template_id, status, total_recipients, organization_id, min_interval, max_interval, chatbot_id, sector_id, manual_variables, flow_bot_id)
  SELECT user_id, 'CLT IA 2', team, chatbot_enabled, dispatch_interval, use_unified_template, unified_template_id, 'draft', 0, organization_id, min_interval, max_interval, chatbot_id, sector_id, manual_variables, flow_bot_id
  FROM public.campaigns WHERE id = src
  RETURNING id INTO newid;

  INSERT INTO public.campaign_channels (campaign_id, channel_id, template_id, order_index, flow_bot_id)
  SELECT newid, channel_id, template_id, order_index, flow_bot_id
  FROM public.campaign_channels WHERE campaign_id = src;

  WITH half AS (
    SELECT id FROM public.campaign_recipients
    WHERE campaign_id = src AND status = 'pending'
    ORDER BY id
    OFFSET (SELECT count(*)/2 FROM public.campaign_recipients WHERE campaign_id = src AND status = 'pending')
  )
  UPDATE public.campaign_recipients r SET campaign_id = newid
  FROM half WHERE r.id = half.id;
  GET DIAGNOSTICS moved = ROW_COUNT;

  UPDATE public.campaigns SET total_recipients = moved WHERE id = newid;
  UPDATE public.campaigns SET total_recipients = (SELECT count(*) FROM public.campaign_recipients WHERE campaign_id = src) WHERE id = src;

  RAISE NOTICE 'new campaign % moved %', newid, moved;
END $$;