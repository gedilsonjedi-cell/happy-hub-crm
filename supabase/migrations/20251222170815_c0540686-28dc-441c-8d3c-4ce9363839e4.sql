-- Create enum for dispatch types
CREATE TYPE public.dispatch_type AS ENUM ('marketing', 'utility', 'service');

-- Add dispatch_type to message_templates table
ALTER TABLE public.message_templates 
ADD COLUMN dispatch_type dispatch_type NOT NULL DEFAULT 'utility';

-- Create table for dispatch pricing configuration (admin configurable)
CREATE TABLE public.dispatch_pricing (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dispatch_type dispatch_type NOT NULL UNIQUE,
  price_per_message DECIMAL(10, 4) NOT NULL DEFAULT 0.0000,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable RLS on dispatch_pricing
ALTER TABLE public.dispatch_pricing ENABLE ROW LEVEL SECURITY;

-- Everyone can read pricing
CREATE POLICY "Everyone can view pricing"
ON public.dispatch_pricing
FOR SELECT
TO authenticated
USING (true);

-- Only admins can manage pricing
CREATE POLICY "Admins can insert pricing"
ON public.dispatch_pricing
FOR INSERT
WITH CHECK (is_admin(auth.uid()));

CREATE POLICY "Admins can update pricing"
ON public.dispatch_pricing
FOR UPDATE
USING (is_admin(auth.uid()));

CREATE POLICY "Admins can delete pricing"
ON public.dispatch_pricing
FOR DELETE
USING (is_admin(auth.uid()));

-- Insert default pricing values
INSERT INTO public.dispatch_pricing (dispatch_type, price_per_message) VALUES
  ('marketing', 0.5000),
  ('utility', 0.3000),
  ('service', 0.2000);

-- Create table for dispatch cost history (per campaign, per day)
CREATE TABLE public.dispatch_costs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES public.campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  dispatch_type dispatch_type NOT NULL,
  successful_count INTEGER NOT NULL DEFAULT 0,
  price_per_message DECIMAL(10, 4) NOT NULL,
  total_cost DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  dispatch_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on dispatch_costs
ALTER TABLE public.dispatch_costs ENABLE ROW LEVEL SECURITY;

-- Users can view their own costs
CREATE POLICY "Users can view their own costs"
ON public.dispatch_costs
FOR SELECT
USING (auth.uid() = user_id);

-- Admins can view all costs
CREATE POLICY "Admins can view all costs"
ON public.dispatch_costs
FOR SELECT
USING (is_admin(auth.uid()));

-- Users can insert their own costs
CREATE POLICY "Users can insert their own costs"
ON public.dispatch_costs
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_dispatch_costs_user_date ON public.dispatch_costs(user_id, dispatch_date);
CREATE INDEX idx_dispatch_costs_campaign ON public.dispatch_costs(campaign_id);

-- Trigger to update updated_at on dispatch_pricing
CREATE TRIGGER update_dispatch_pricing_updated_at
BEFORE UPDATE ON public.dispatch_pricing
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();