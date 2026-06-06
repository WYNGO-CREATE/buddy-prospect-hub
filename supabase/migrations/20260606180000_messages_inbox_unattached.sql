-- ╭─────────────────────────────────────────────────────────────────────────╮
-- │ Inbox : permettre les messages NON-RATTACHÉS à un prospect              │
-- │                                                                          │
-- │ Avant : messages.prospect_id était NOT NULL → tous les emails reçus     │
-- │ d'adresses inconnues (clients pas encore prospects, partenaires, etc.)  │
-- │ étaient silencieusement supprimés à la sync.                            │
-- │                                                                          │
-- │ Maintenant : prospect_id est nullable → on importe TOUS les emails,    │
-- │ ceux sans match apparaissent dans une section "Non rattachés" où       │
-- │ l'utilisateur peut les lier manuellement à un prospect (existant ou   │
-- │ créé à la volée).                                                       │
-- ╰─────────────────────────────────────────────────────────────────────────╯

alter table messages
  alter column prospect_id drop not null;

-- Champs pour identifier l'expéditeur quand pas de prospect rattaché.
-- Permet d'afficher "Jean Dupont <jean@example.com>" dans l'inbox sans
-- avoir besoin d'un prospect_id.
alter table messages
  add column if not exists sender_name text,
  add column if not exists sender_email text,
  add column if not exists recipient_email text;

create index if not exists idx_messages_unattached on messages(owner_id, occurred_at desc)
  where prospect_id is null;

create index if not exists idx_messages_thread on messages(thread_id)
  where thread_id is not null;
