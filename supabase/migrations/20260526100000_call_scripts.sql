-- ─── Scripts d'appel & banque d'objections ───
-- Outil "live" pour aider l'équipe pendant les appels : trame d'ouverture +
-- réponses aux objections classiques. Édité directement par l'équipe.

CREATE TYPE public.call_script_kind AS ENUM ('script', 'objection');

CREATE TABLE public.call_scripts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind         call_script_kind NOT NULL,                       -- script | objection
  title        TEXT NOT NULL,                                   -- nom du script OU phrase de l'objection
  content      TEXT NOT NULL,                                   -- texte du script OU réponse à l'objection
  category     TEXT,                                            -- prise_contact, qualification, closing, voicemail, prix, timing, decideur, etc.
  is_shared    BOOLEAN NOT NULL DEFAULT false,                  -- visible par toute l'équipe
  position     INTEGER NOT NULL DEFAULT 0,                      -- ordre dans la liste
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_call_scripts_owner ON public.call_scripts(owner_id);
CREATE INDEX idx_call_scripts_kind  ON public.call_scripts(kind);
CREATE INDEX idx_call_scripts_shared ON public.call_scripts(is_shared) WHERE is_shared = true;

ALTER TABLE public.call_scripts ENABLE ROW LEVEL SECURITY;

-- RLS : un user voit ses scripts + les scripts partagés ; un admin voit tout
CREATE POLICY "call_scripts_select" ON public.call_scripts FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR is_shared = true OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "call_scripts_insert_own" ON public.call_scripts FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "call_scripts_update_own" ON public.call_scripts FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "call_scripts_delete_own" ON public.call_scripts FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Updated_at trigger (réutilise la fonction publique touch_updated_at créée
-- dans la migration templates_workflows)
CREATE TRIGGER trg_call_scripts_touch
  BEFORE UPDATE ON public.call_scripts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
