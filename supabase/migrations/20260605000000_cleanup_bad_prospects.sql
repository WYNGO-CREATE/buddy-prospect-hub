-- ╭─────────────────────────────────────────────────────────────────────────╮
-- │ Cleanup des prospects pollués par bugs du scraper (avant les fixes)    │
-- │                                                                          │
-- │ Bug 1 : email_scraper transformait "loc[at]ion" → "loc@ion" parce que   │
-- │         les crochets étaient optionnels dans la regex d'obfuscation.    │
-- │         Résultat : des emails comme "document.loc@ion.origin" qui       │
-- │         venaient de JavaScript minifié sur les sites scrapés.           │
-- │                                                                          │
-- │ Bug 2 : quand Pappers ne retournait pas de dirigeant identifié, on     │
-- │         mettait "—" (tiret long) en first_name, ce qui pollue le CRM.  │
-- ╰─────────────────────────────────────────────────────────────────────────╯

-- 1. Nettoyer les emails faux positifs
--    On vide (NULL) plutôt que supprimer pour préserver la fiche prospect.
--    Les patterns ciblés viennent du JS minifié extrait à tort comme email.
UPDATE prospects
SET email = NULL,
    updated_at = NOW()
WHERE email IS NOT NULL
  AND (
       email ILIKE 'document.%'         -- document.loc@ion.origin, etc.
    OR email ILIKE 'window.%'           -- window.loc@ion.origin
    OR email ILIKE 'location.%'
    OR email ILIKE '%.origin'           -- *.origin (faux positif)
    OR email ILIKE '%.href'
    OR email ILIKE '%.pathname'
    OR email ILIKE '%.protocol'
    OR email ILIKE '%@wixpress.com'     -- emails de la plateforme Wix
    OR email ILIKE 'noreply@%'
    OR email ILIKE 'no-reply@%'
    OR email ILIKE 'donotreply@%'
  );

-- 2. Remplacer les first_name "—" par "Contact" (plus propre, éditable)
UPDATE prospects
SET first_name = 'Contact',
    updated_at = NOW()
WHERE first_name = '—'
   OR first_name = '-'
   OR first_name = '–'         -- en dash
   OR trim(first_name) = '';

-- 3. Idem pour les last_name vides (cas rare mais possible)
UPDATE prospects
SET last_name = COALESCE(NULLIF(trim(company), ''), 'Inconnu'),
    updated_at = NOW()
WHERE last_name = '—'
   OR last_name = '-'
   OR last_name = '–'
   OR trim(last_name) = '';
