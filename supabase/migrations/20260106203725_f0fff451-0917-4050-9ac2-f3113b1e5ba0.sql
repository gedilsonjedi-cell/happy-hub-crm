-- Create campaign_recipients table to track individual recipient status
CREATE TABLE IF NOT EXISTS public.campaign_recipients (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    phone TEXT NOT NULL,
    name TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    sent_at TIMESTAMP WITH TIME ZONE,
    delivered_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_status ON public.campaign_recipients(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_phone ON public.campaign_recipients(phone);

-- Enable RLS
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their organization recipients" 
ON public.campaign_recipients 
FOR SELECT 
USING (
    EXISTS (
        SELECT 1 FROM public.campaigns c
        WHERE c.id = campaign_recipients.campaign_id
        AND c.organization_id IN (
            SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
        )
    )
);

CREATE POLICY "Users can insert recipients for their campaigns" 
ON public.campaign_recipients 
FOR INSERT 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.campaigns c
        WHERE c.id = campaign_recipients.campaign_id
        AND c.organization_id IN (
            SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
        )
    )
);

CREATE POLICY "Users can update recipients for their campaigns" 
ON public.campaign_recipients 
FOR UPDATE 
USING (
    EXISTS (
        SELECT 1 FROM public.campaigns c
        WHERE c.id = campaign_recipients.campaign_id
        AND c.organization_id IN (
            SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
        )
    )
);

-- Trigger for updated_at
CREATE TRIGGER update_campaign_recipients_updated_at
BEFORE UPDATE ON public.campaign_recipients
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();