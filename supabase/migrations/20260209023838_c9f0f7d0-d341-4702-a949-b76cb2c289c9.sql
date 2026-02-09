-- Update default value for welcome message to be disabled by default
ALTER TABLE public.welcome_message_config 
ALTER COLUMN is_enabled SET DEFAULT false;