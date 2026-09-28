CREATE OR REPLACE FUNCTION public.drain_department_queue_on_online()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_available IS TRUE AND NEW.organization_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.is_available IS DISTINCT FROM TRUE) THEN
    PERFORM net.http_post(
      url := 'https://vytjufibiwhtvsnvvqri.supabase.co/functions/v1/redistribute-pending-assignments',
      headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5dGp1ZmliaXdodHZzbnZ2cXJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MzI2MzYsImV4cCI6MjA5MDQwODYzNn0.5rgCe8wEG-Ebi5h0bEL00fOIyVzBH0_LsaxBFtwmqNI","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ5dGp1ZmliaXdodHZzbnZ2cXJpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4MzI2MzYsImV4cCI6MjA5MDQwODYzNn0.5rgCe8wEG-Ebi5h0bEL00fOIyVzBH0_LsaxBFtwmqNI"}'::jsonb,
      body := jsonb_build_object('organizationId', NEW.organization_id)
    );
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.drain_department_queue_on_online() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_drain_department_queue_on_online ON public.attendant_availability;
CREATE TRIGGER trg_drain_department_queue_on_online
AFTER INSERT OR UPDATE OF is_available ON public.attendant_availability
FOR EACH ROW EXECUTE FUNCTION public.drain_department_queue_on_online();