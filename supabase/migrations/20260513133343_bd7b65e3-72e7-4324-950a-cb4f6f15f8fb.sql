-- Prospects: tags + prochaine action
ALTER TABLE public.prospects
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS next_action text,
  ADD COLUMN IF NOT EXISTS next_action_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_prospects_tags ON public.prospects USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_prospects_next_action_at ON public.prospects(next_action_at);

-- Profiles: désactivation
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- Réassignation par admin: politique UPDATE additionnelle
DROP POLICY IF EXISTS prospects_update_admin ON public.prospects;
CREATE POLICY prospects_update_admin ON public.prospects
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Table commentaires (fil de discussion interne)
CREATE TABLE IF NOT EXISTS public.prospect_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id uuid NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  body text NOT NULL CHECK (length(btrim(body)) > 0 AND length(body) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prospect_comments_prospect ON public.prospect_comments(prospect_id, created_at DESC);

ALTER TABLE public.prospect_comments ENABLE ROW LEVEL SECURITY;

-- Lecture: tout membre de l'équipe pouvant voir le prospect
CREATE POLICY comments_select ON public.prospect_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.prospects p
      WHERE p.id = prospect_id
        AND (p.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid())
  );

-- Insert: tout authentifié peut commenter (collaboration équipe)
CREATE POLICY comments_insert ON public.prospect_comments
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

-- Update/Delete: seulement son propre commentaire
CREATE POLICY comments_update_own ON public.prospect_comments
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

CREATE POLICY comments_delete_own ON public.prospect_comments
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_comments_updated ON public.prospect_comments;
CREATE TRIGGER trg_comments_updated BEFORE UPDATE ON public.prospect_comments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Vue d'activité récente (sécurité via RLS sous-jacente des tables)
-- (lecture filtrée côté client)

-- Recherche globale RPC
CREATE OR REPLACE FUNCTION public.search_prospects(_q text, _limit int DEFAULT 10)
RETURNS TABLE (id uuid, first_name text, last_name text, company text, email text, phone text, website text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.first_name, p.last_name, p.company, p.email, p.phone, p.website
  FROM public.prospects p
  WHERE (p.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    AND (
      p.first_name ILIKE '%' || _q || '%'
      OR p.last_name ILIKE '%' || _q || '%'
      OR coalesce(p.company,'') ILIKE '%' || _q || '%'
      OR coalesce(p.email,'') ILIKE '%' || _q || '%'
      OR coalesce(p.phone,'') ILIKE '%' || _q || '%'
      OR coalesce(p.website,'') ILIKE '%' || _q || '%'
    )
  ORDER BY p.updated_at DESC
  LIMIT LEAST(_limit, 50);
$$;

GRANT EXECUTE ON FUNCTION public.search_prospects(text, int) TO authenticated;

-- Leaderboard: convertis du mois courant par owner
CREATE OR REPLACE FUNCTION public.leaderboard_month()
RETURNS TABLE (owner_id uuid, owner_name text, converted_count bigint, calls_count bigint, prospects_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT pf.id AS owner_id, COALESCE(pf.full_name, pf.email) AS owner_name FROM public.profiles pf WHERE pf.is_active
  )
  SELECT b.owner_id, b.owner_name,
    (SELECT count(*) FROM public.prospect_events e
       WHERE e.owner_id = b.owner_id
         AND e.event_type = 'status_changed'
         AND (e.payload->>'to') = 'converti'
         AND e.created_at >= date_trunc('month', now())) AS converted_count,
    (SELECT count(*) FROM public.call_logs c
       WHERE c.owner_id = b.owner_id AND c.called_at >= date_trunc('month', now())) AS calls_count,
    (SELECT count(*) FROM public.prospects p
       WHERE p.owner_id = b.owner_id AND p.created_at >= date_trunc('month', now())) AS prospects_count
  FROM base b
  ORDER BY converted_count DESC, calls_count DESC;
$$;

GRANT EXECUTE ON FUNCTION public.leaderboard_month() TO authenticated;