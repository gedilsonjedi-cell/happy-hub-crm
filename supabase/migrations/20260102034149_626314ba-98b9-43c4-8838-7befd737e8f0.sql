-- Create table to track active user sessions (single session per user)
CREATE TABLE public.user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    session_token TEXT NOT NULL,
    device_info TEXT,
    ip_address TEXT,
    logged_in_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    last_active_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

-- Users can only read their own session
CREATE POLICY "Users can view own session"
ON public.user_sessions
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Users can update their own session
CREATE POLICY "Users can update own session"
ON public.user_sessions
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Users can insert their own session
CREATE POLICY "Users can insert own session"
ON public.user_sessions
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own session
CREATE POLICY "Users can delete own session"
ON public.user_sessions
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Create function to register/update session on login
CREATE OR REPLACE FUNCTION public.register_user_session(
    _session_token TEXT,
    _device_info TEXT DEFAULT NULL,
    _ip_address TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.user_sessions (user_id, session_token, device_info, ip_address, logged_in_at, last_active_at)
    VALUES (auth.uid(), _session_token, _device_info, _ip_address, now(), now())
    ON CONFLICT (user_id) 
    DO UPDATE SET 
        session_token = EXCLUDED.session_token,
        device_info = EXCLUDED.device_info,
        ip_address = EXCLUDED.ip_address,
        logged_in_at = now(),
        last_active_at = now();
    RETURN TRUE;
END;
$$;

-- Create function to validate if current session is active
CREATE OR REPLACE FUNCTION public.validate_user_session(_session_token TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM public.user_sessions 
        WHERE user_id = auth.uid() 
        AND session_token = _session_token
    );
$$;

-- Create function to update last activity
CREATE OR REPLACE FUNCTION public.update_session_activity()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE public.user_sessions 
    SET last_active_at = now() 
    WHERE user_id = auth.uid();
    RETURN TRUE;
END;
$$;