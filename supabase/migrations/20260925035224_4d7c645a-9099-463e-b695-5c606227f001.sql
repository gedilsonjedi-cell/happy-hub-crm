DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['get_user_organization_id(uuid)','is_admin_or_supervisor(uuid)','has_role(uuid,app_role)','is_admin(uuid)',
    'claim_campaign_recipients(uuid,integer,boolean)','debit_organization_balance(uuid,numeric,text,text,text)',
    'credit_organization_balance(uuid,numeric,text,text,text,uuid)','check_organization_balance(uuid,numeric)',
    'get_channel_by_api_token(text)','purchase_product(uuid,uuid,integer)','get_campaign_real_counts(uuid[])',
    'get_campaign_counts(uuid)','force_sync_all_campaign_counts()','get_campaign_sector_for_phone(uuid,text)',
    'is_phone_blacklisted(uuid,text)','delete_organization_cascade(uuid)','validate_user_session(text)',
    'update_session_activity()','register_user_session(text,text,text)','set_org_default_sector(uuid,uuid,boolean)',
    'set_org_auto_reply_flags(uuid,boolean,boolean)','get_or_create_referral_code(uuid)','cancel_addon(uuid)',
    'admin_add_product_to_organization(uuid,uuid,integer,boolean)','generate_referral_code()'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon', f);
  END LOOP;
  FOREACH f IN ARRAY ARRAY['claim_campaign_recipients(uuid,integer,boolean)','debit_organization_balance(uuid,numeric,text,text,text)',
    'credit_organization_balance(uuid,numeric,text,text,text,uuid)','get_channel_by_api_token(text)','force_sync_all_campaign_counts()'] LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM authenticated', f);
  END LOOP;
END $$;