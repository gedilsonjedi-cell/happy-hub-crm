-- Remove the problematic foreign key constraint on user_roles
-- This FK is causing issues because triggers try to insert before the auth.users row is fully committed
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_user_id_fkey;