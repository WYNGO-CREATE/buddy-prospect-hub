-- ─── Intégration Gmail — table gmail_accounts ───
-- Stocke les tokens OAuth Google pour synchroniser les emails de chaque utilisateur
-- dans son Inbox CRM. Un seul compte Gmail par user.

CREATE TABLE public.gmail_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  last_sync_at TIMESTAMPTZ,
  last_history_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sync_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.gmail_accounts ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_gmail_accounts_user ON public.gmail_accounts(user_id);
CREATE INDEX idx_gmail_accounts_active_expires ON public.gmail_accounts(is_active, expires_at) WHERE is_active = true;

-- RLS : l'utilisateur ne peut lire/modifier que son propre compte Gmail
CREATE POLICY "gmail_accounts_select_own" ON public.gmail_accounts FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "gmail_accounts_insert_own" ON public.gmail_accounts FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "gmail_accounts_update_own" ON public.gmail_accounts FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "gmail_accounts_delete_own" ON public.gmail_accounts FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Ajoute des colonnes à messages pour tracer la source Gmail
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS external_id TEXT,        -- gmail message id pour dédup
  ADD COLUMN IF NOT EXISTS thread_id TEXT,          -- gmail thread id
  ADD COLUMN IF NOT EXISTS from_email TEXT,         -- expéditeur
  ADD COLUMN IF NOT EXISTS to_email TEXT,           -- destinataire
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';  -- 'manual' | 'gmail_sync' | 'gmail_send'

-- Index unique pour empêcher les doublons de mails Gmail
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_external_id
  ON public.messages(owner_id, external_id)
  WHERE external_id IS NOT NULL;

-- Fonction utilitaire : trouver un prospect par email (pour le matching auto)
CREATE OR REPLACE FUNCTION public.find_prospect_by_email(p_email TEXT, p_owner_id UUID)
RETURNS UUID
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.prospects
  WHERE owner_id = p_owner_id
    AND LOWER(email) = LOWER(TRIM(p_email))
  LIMIT 1
$$;
