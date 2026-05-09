CREATE OR REPLACE FUNCTION public.mirror_row_to_external()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_url text := 'https://rcygvkfzqmakxoquywzg.supabase.co/functions/v1/mirror-to-external';
  v_payload jsonb;
  v_op text := TG_OP;
BEGIN
  v_payload := jsonb_build_object(
    'table', TG_TABLE_NAME,
    'op', v_op,
    'new', CASE WHEN v_op IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    'old', CASE WHEN v_op IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END
  );

  PERFORM net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := v_payload
  );

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[mirror_row_to_external] failed: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$;