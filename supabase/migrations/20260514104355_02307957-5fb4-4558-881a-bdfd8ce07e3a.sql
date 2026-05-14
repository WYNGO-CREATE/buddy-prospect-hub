
-- Téléphone dans le profil membre
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;

-- Réglages agence (ligne unique partagée)
CREATE TABLE IF NOT EXISTS public.agency_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  name text NOT NULL DEFAULT '',
  logo_url text,
  website_url text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.agency_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

ALTER TABLE public.agency_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency_settings_read_authenticated" ON public.agency_settings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "agency_settings_admin_update" ON public.agency_settings
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
