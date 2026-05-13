-- Hardening: payment card token/customer_id should not be readable by clients (only backend service_role).
-- Display fields (card_last_four, card_brand, cardholder_name) remain readable for the UI.
REVOKE SELECT (card_token, customer_id) ON public.auto_recharge_config FROM authenticated;
REVOKE SELECT (card_token, customer_id) ON public.auto_recharge_config FROM anon;