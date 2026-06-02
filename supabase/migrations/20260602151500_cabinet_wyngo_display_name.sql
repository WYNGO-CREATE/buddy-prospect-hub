-- ─── Display name d'expéditeur ───
-- Met à jour le nom de l'agence à "Cabinet Wyngo" pour qu'il s'affiche en
-- From: "Cabinet Wyngo" <contact@wyngo.fr> dans les emails sortants du CRM.
-- Cohérent avec le nom configuré dans Gmail "Send mail as".

UPDATE public.agency_settings
SET name = 'Cabinet Wyngo'
WHERE id = true;
