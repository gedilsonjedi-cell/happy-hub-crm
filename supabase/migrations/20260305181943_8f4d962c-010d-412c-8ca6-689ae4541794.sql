CREATE OR REPLACE FUNCTION public.auto_activate_subscription_on_date_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- If subscription_paid_until or subscription_ends_at was changed to a future date,
  -- automatically set status to 'active'
  IF (
    (NEW.subscription_paid_until IS DISTINCT FROM OLD.subscription_paid_until AND NEW.subscription_paid_until > now())
    OR
    (NEW.subscription_ends_at IS DISTINCT FROM OLD.subscription_ends_at AND NEW.subscription_ends_at > now())
  ) AND NEW.subscription_status IN ('payment_required', 'expired', 'inactive') THEN
    NEW.subscription_status := 'active';
  END IF;
  
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trigger_auto_activate_subscription
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION auto_activate_subscription_on_date_change();