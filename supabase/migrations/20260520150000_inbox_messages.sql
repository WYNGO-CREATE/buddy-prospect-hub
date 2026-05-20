-- ─── Inbox unique — table messages ───
-- Stocke toutes les interactions (email, LinkedIn, appel, WhatsApp, note manuelle)
-- entrantes ET sortantes, pour alimenter une inbox unifiée par utilisateur.

-- Canaux supportés (extensible)
CREATE TYPE public.message_channel AS ENUM ('email', 'linkedin', 'call', 'whatsapp', 'note');

-- Direction : entrant (reçu d'un prospect) ou sortant (envoyé par l'utilisateur)
CREATE TYPE public.message_direction AS ENUM ('inbound', 'outbound');

CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel message_channel NOT NULL,
  direction message_direction NOT NULL DEFAULT 'outbound',
  subject TEXT,
  content TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_messages_prospect ON public.messages(prospect_id);
CREATE INDEX idx_messages_owner ON public.messages(owner_id);
CREATE INDEX idx_messages_occurred_at ON public.messages(occurred_at DESC);
CREATE INDEX idx_messages_channel ON public.messages(channel);
CREATE INDEX idx_messages_unread
  ON public.messages(owner_id, is_read)
  WHERE is_read = false AND is_archived = false;

-- RLS : un utilisateur ne voit que ses propres messages (admin voit tout)
CREATE POLICY "messages_select" ON public.messages FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "messages_insert_own" ON public.messages FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "messages_update_own" ON public.messages FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());

CREATE POLICY "messages_delete_own" ON public.messages FOR DELETE TO authenticated
  USING (owner_id = auth.uid());
