-- ─── Contexte IA pour la génération de templates ───
-- Stocké dans agency_settings (partagé par toute l'équipe) :
--   - activity        : description courte (1 ligne) de l'activité
--   - business_brief  : description longue (paragraphe) injectée comme contexte à l'IA
--   - target_client   : description du client idéal / ICP
--   - value_props     : propositions de valeur principales (liste de bullets)
--   - default_tone    : ton par défaut ('professionnel', 'chaleureux', 'direct', 'consultatif')

ALTER TABLE public.agency_settings
  ADD COLUMN IF NOT EXISTS activity        TEXT,
  ADD COLUMN IF NOT EXISTS business_brief  TEXT,
  ADD COLUMN IF NOT EXISTS target_client   TEXT,
  ADD COLUMN IF NOT EXISTS value_props     TEXT,
  ADD COLUMN IF NOT EXISTS default_tone    TEXT DEFAULT 'professionnel';

-- Table audit des générations IA (debug + facturation interne)
CREATE TABLE IF NOT EXISTS public.ai_generations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,                       -- 'template' | 'workflow' | ...
  input        JSONB NOT NULL,
  output       JSONB,
  model        TEXT,
  tokens_in    INT,
  tokens_out   INT,
  duration_ms  INT,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_generations_owner ON public.ai_generations(owner_id, created_at DESC);

ALTER TABLE public.ai_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_generations_select_own" ON public.ai_generations FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
