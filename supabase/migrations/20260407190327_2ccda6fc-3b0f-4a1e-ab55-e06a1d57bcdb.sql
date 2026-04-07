
CREATE OR REPLACE FUNCTION public.update_flow_session_activity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
BEGIN
  NEW.last_activity_at = now();
  NEW.updated_at = now();
  -- Reset follow-up count when user responds
  IF OLD.current_node_id IS DISTINCT FROM NEW.current_node_id THEN
    NEW.follow_up_count = 0;
    NEW.next_follow_up_at = NULL;
  END IF;
  RETURN NEW;
END;
$function$;
