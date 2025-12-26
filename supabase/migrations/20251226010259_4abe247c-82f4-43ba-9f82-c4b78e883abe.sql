-- Create a function that allows super admins to create user roles
-- This uses SECURITY DEFINER to bypass RLS
CREATE OR REPLACE FUNCTION public.admin_create_user_role(
  _user_id UUID,
  _role app_role DEFAULT 'admin'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only allow super_admins to use this function
  IF NOT is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can create user roles';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (_user_id, _role)
  ON CONFLICT (user_id) DO UPDATE SET role = _role;

  RETURN true;
END;
$$;