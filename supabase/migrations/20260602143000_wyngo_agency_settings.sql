-- ─── Configuration agence Wyngo (one-shot) ───
-- Initialise les paramètres du cabinet Wyngo : nom, site web.
-- Et corrige le profil principal (Hugo Malet, contact@wyngo.fr).
-- Le logo reste null pour utiliser le wordmark typographique Wyngo par défaut.

UPDATE public.agency_settings
SET name = 'Wyngo',
    website_url = 'https://wyngo.fr'
WHERE id = true;

UPDATE public.profiles
SET full_name = 'Hugo Malet',
    phone = '+33 6 19 37 92 69'
WHERE email = 'contact@wyngo.fr';
