ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS whatsapp_phone text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_whatsapp_phone_uniq ON public.profiles(whatsapp_phone) WHERE whatsapp_phone IS NOT NULL;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _org uuid;
BEGIN
  BEGIN
    _org := NULLIF(NEW.raw_user_meta_data->>'organization_id','')::uuid;
  EXCEPTION WHEN others THEN _org := NULL;
  END;
  IF COALESCE((NEW.raw_user_meta_data->>'is_super_admin')::boolean,false) THEN _org := NULL; END IF;
  IF _org IS NOT NULL AND NOT EXISTS (SELECT 1 FROM organizations WHERE id=_org) THEN _org := NULL; END IF;
  INSERT INTO public.profiles(user_id,email,display_name,organization_id)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email,'@',1)), _org)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

INSERT INTO public.profiles(user_id,email,display_name,organization_id)
SELECT u.id,u.email,COALESCE(u.raw_user_meta_data->>'display_name',split_part(u.email,'@',1)),
  (SELECT o.id FROM organizations o WHERE o.id::text = u.raw_user_meta_data->>'organization_id')
FROM auth.users u WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.user_id=u.id);