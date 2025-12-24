-- Create pix_payments table to store payment records
CREATE TABLE public.pix_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  mercadopago_id TEXT NOT NULL UNIQUE,
  amount NUMERIC NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_type TEXT NOT NULL CHECK (payment_type IN ('balance', 'subscription')),
  pix_qr_code TEXT,
  pix_qr_code_base64 TEXT,
  pix_copy_paste TEXT,
  expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pix_payments ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their organization payments"
  ON public.pix_payments
  FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create payments for their organization"
  ON public.pix_payments
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- Create trigger for updated_at
CREATE TRIGGER update_pix_payments_updated_at
  BEFORE UPDATE ON public.pix_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_pix_payments_organization_id ON public.pix_payments(organization_id);
CREATE INDEX idx_pix_payments_mercadopago_id ON public.pix_payments(mercadopago_id);
CREATE INDEX idx_pix_payments_status ON public.pix_payments(status);