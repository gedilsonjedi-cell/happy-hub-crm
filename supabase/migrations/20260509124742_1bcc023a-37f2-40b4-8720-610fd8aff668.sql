-- Habilitar pg_net se ainda não estiver
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Função genérica de mirror
CREATE OR REPLACE FUNCTION public.mirror_row_to_external()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
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

  -- Disparo assíncrono — não bloqueia a transação interna
  PERFORM extensions.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := v_payload
  );

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  -- Nunca quebrar a transação interna por falha de espelhamento
  RAISE WARNING '[mirror_row_to_external] failed: %', SQLERRM;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Triggers em conversation_assignments
DROP TRIGGER IF EXISTS trg_mirror_ca ON public.conversation_assignments;
CREATE TRIGGER trg_mirror_ca
AFTER INSERT OR UPDATE OR DELETE ON public.conversation_assignments
FOR EACH ROW EXECUTE FUNCTION public.mirror_row_to_external();

-- Triggers em conversation_stats
DROP TRIGGER IF EXISTS trg_mirror_cs ON public.conversation_stats;
CREATE TRIGGER trg_mirror_cs
AFTER INSERT OR UPDATE OR DELETE ON public.conversation_stats
FOR EACH ROW EXECUTE FUNCTION public.mirror_row_to_external();