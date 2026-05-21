-- ─── Templates d'emails (DB-backed) + Workflows (séquences automatisées) ───

-- =====================================================
-- 1. EMAIL TEMPLATES
-- =====================================================
CREATE TABLE public.email_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  category    TEXT,                                  -- prospection, relance, rdv, remerciement, etc.
  is_shared   BOOLEAN NOT NULL DEFAULT false,        -- partagé avec toute l'équipe
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_templates_owner ON public.email_templates(owner_id);
CREATE INDEX idx_email_templates_shared ON public.email_templates(is_shared) WHERE is_shared = true;

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "templates_select" ON public.email_templates FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR is_shared = true OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "templates_insert_own" ON public.email_templates FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "templates_update_own" ON public.email_templates FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "templates_delete_own" ON public.email_templates FOR DELETE TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_email_templates_touch
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =====================================================
-- 2. WORKFLOWS (séquences automatisées)
-- =====================================================

-- Trigger : comment se lance le workflow
-- 'manual'        : on l'enrôle manuellement sur un prospect via UI
-- 'on_status'     : auto-déclenché quand un prospect passe à un statut donné
CREATE TYPE public.workflow_trigger AS ENUM ('manual', 'on_status');

CREATE TABLE public.workflows (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  trigger_type    workflow_trigger NOT NULL DEFAULT 'manual',
  trigger_status  prospect_status,                  -- si trigger_type = 'on_status'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflows_owner ON public.workflows(owner_id);
ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflows_select" ON public.workflows FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "workflows_cud_own" ON public.workflows FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_workflows_touch
  BEFORE UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- =====================================================
-- 3. WORKFLOW STEPS (les actions composant un workflow)
-- =====================================================

-- 'email'         : envoyer un email via Gmail (utilise template_id)
-- 'linkedin_task' : créer une tâche manuelle "envoyer message LinkedIn"
-- 'note'          : créer une note de rappel dans l'inbox
-- 'wait'          : juste attendre (utile pour pauser entre 2 actions)
CREATE TYPE public.workflow_step_kind AS ENUM ('email', 'linkedin_task', 'note', 'wait');

CREATE TABLE public.workflow_steps (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id   UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  position      INT NOT NULL,                       -- ordre dans la séquence
  kind          workflow_step_kind NOT NULL,
  delay_days    NUMERIC(6,2) NOT NULL DEFAULT 0,    -- délai depuis l'étape précédente
  template_id   UUID REFERENCES public.email_templates(id) ON DELETE SET NULL,
  subject       TEXT,                                -- override si pas de template
  body          TEXT,                                -- override si pas de template ; ou contenu d'une note/tâche
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_steps_wf ON public.workflow_steps(workflow_id, position);

ALTER TABLE public.workflow_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflow_steps_select" ON public.workflow_steps FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workflows w WHERE w.id = workflow_id
    AND (w.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE POLICY "workflow_steps_cud" ON public.workflow_steps FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workflows w WHERE w.id = workflow_id
    AND (w.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.workflows w WHERE w.id = workflow_id
    AND (w.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));

-- =====================================================
-- 4. WORKFLOW RUNS (une instance d'un workflow pour un prospect)
-- =====================================================
CREATE TYPE public.workflow_run_status AS ENUM ('running', 'completed', 'paused', 'cancelled', 'errored');

CREATE TABLE public.workflow_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id     UUID NOT NULL REFERENCES public.workflows(id) ON DELETE CASCADE,
  prospect_id     UUID NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  owner_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status          workflow_run_status NOT NULL DEFAULT 'running',
  next_run_at     TIMESTAMPTZ,                       -- quand le prochain step doit s'exécuter
  current_step_id UUID REFERENCES public.workflow_steps(id),
  last_error      TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  UNIQUE (workflow_id, prospect_id)                  -- 1 seul run actif par couple
);

CREATE INDEX idx_workflow_runs_owner ON public.workflow_runs(owner_id);
CREATE INDEX idx_workflow_runs_due ON public.workflow_runs(next_run_at) WHERE status = 'running';
CREATE INDEX idx_workflow_runs_prospect ON public.workflow_runs(prospect_id);

ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflow_runs_select" ON public.workflow_runs FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "workflow_runs_cud" ON public.workflow_runs FOR ALL TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- =====================================================
-- 5. WORKFLOW RUN EVENTS (audit log par étape)
-- =====================================================
CREATE TABLE public.workflow_run_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       UUID NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  step_id      UUID REFERENCES public.workflow_steps(id) ON DELETE SET NULL,
  status       TEXT NOT NULL,                          -- 'executed' | 'skipped' | 'error'
  detail       TEXT,
  executed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_run_events_run ON public.workflow_run_events(run_id, executed_at DESC);

ALTER TABLE public.workflow_run_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workflow_run_events_select" ON public.workflow_run_events FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.workflow_runs r WHERE r.id = run_id
    AND (r.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))));
CREATE POLICY "workflow_run_events_insert" ON public.workflow_run_events FOR INSERT TO authenticated
  WITH CHECK (true);  -- la edge function (service_role) bypass déjà RLS de toute façon
