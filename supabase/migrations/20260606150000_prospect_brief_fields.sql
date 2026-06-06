-- ╭─────────────────────────────────────────────────────────────────────────╮
-- │ Brief de génération d'Aperçu Instantané                                  │
-- │                                                                          │
-- │ Avant : le copy IA était généré uniquement à partir du nom + NAF + ville │
-- │         + Google Places. Résultat parfois générique car l'IA ne sait     │
-- │         pas ce que fait précisément le prospect, ni son objectif.        │
-- │                                                                          │
-- │ Maintenant : le commercial peut remplir un brief court sur la fiche      │
-- │         prospect (activité précise, objectif business, ton souhaité,     │
-- │         mots-clés / produits phares). Une IA prémâche les champs depuis  │
-- │         les données disponibles ; le commercial valide ou affine.        │
-- │                                                                          │
-- │ Ces 4 champs nourrissent ensuite le prompt Claude lors de la génération  │
-- │ → résultat ultra-personnalisé, ancré dans l'activité réelle du prospect. │
-- ╰─────────────────────────────────────────────────────────────────────────╯

alter table prospects
  -- Description précise de l'activité (1-2 phrases, plus précis que NAF)
  -- ex: "Boulangerie artisanale spécialisée pain au levain et pâtisseries du dimanche"
  add column if not exists brief_activity text,

  -- Objectif business du futur site (1 choix dans une liste sémantique)
  -- ex: "more_bookings", "online_sales", "showcase", "lead_generation", "reduce_calls"
  add column if not exists brief_objective text,

  -- Ton souhaité pour le copy
  -- ex: "warm", "elegant", "modern", "expert", "playful"
  add column if not exists brief_tone text,

  -- Mots-clés / produits phares / spécialités (1-8 termes)
  -- ex: ['pain au levain bio', 'viennoiseries pur beurre', 'tartes saisonnières']
  add column if not exists brief_keywords text[],

  -- Date du dernier refresh par l'IA (pour éviter de regenerer si déjà fait)
  add column if not exists brief_enriched_at timestamptz;

-- Index pour retrouver vite les prospects avec brief renseigné
create index if not exists idx_prospects_brief_enriched on prospects(brief_enriched_at)
  where brief_enriched_at is not null;
