
-- Re-grant SELECT on display-only card fields (these are safe to show in UI)
GRANT SELECT (card_last_four, card_brand, cardholder_name)
  ON public.auto_recharge_config TO authenticated;
-- card_token and customer_id remain revoked (sensitive)
