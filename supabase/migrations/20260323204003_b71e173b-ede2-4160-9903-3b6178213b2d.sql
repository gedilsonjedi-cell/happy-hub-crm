
CREATE TABLE public.redirect_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  created_by uuid NOT NULL,
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  is_active boolean DEFAULT true,
  destinations jsonb NOT NULL DEFAULT '[]'::jsonb,
  click_count integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Index for fast slug lookup (public redirect)
CREATE INDEX idx_redirect_links_slug ON public.redirect_links(slug);
CREATE INDEX idx_redirect_links_org ON public.redirect_links(organization_id);

-- RLS
ALTER TABLE public.redirect_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own org links"
  ON public.redirect_links FOR SELECT
  TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert own org links"
  ON public.redirect_links FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can update own org links"
  ON public.redirect_links FOR UPDATE
  TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete own org links"
  ON public.redirect_links FOR DELETE
  TO authenticated
  USING (organization_id = (SELECT organization_id FROM profiles WHERE user_id = auth.uid()));

-- Public access for redirect (anon can read active links by slug)
CREATE POLICY "Anyone can view active links by slug"
  ON public.redirect_links FOR SELECT
  TO anon
  USING (is_active = true);

-- Trigger to update updated_at
CREATE TRIGGER update_redirect_links_updated_at
  BEFORE UPDATE ON public.redirect_links
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
