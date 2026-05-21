-- ─── Configuration cron pour les workers automatiques ───
-- Active pg_cron + pg_net (Supabase les fournit déjà mais on les enable explicitement)
-- Puis schedule :
--   - gmail-sync     : toutes les 5 minutes
--   - workflow-tick  : toutes les 5 minutes
--
-- Les URLs des edge functions sont stockées via vault.create_secret pour ne pas
-- hardcoder le project_ref dans la base.

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net   WITH SCHEMA extensions;

-- ─── Vault : stocke URL + secret côté DB (chiffré) ───
-- On stocke pour pouvoir y accéder depuis les jobs cron sans hardcoder
DO $$
BEGIN
  -- supabase_url
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'supabase_url') THEN
    PERFORM vault.create_secret(
      'https://mwkkgubvdswmdaiswepl.supabase.co',
      'supabase_url',
      'Base URL du projet Supabase'
    );
  END IF;

  -- cron_secret (doit matcher l'env var CRON_SECRET des edge functions)
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'cron_secret') THEN
    PERFORM vault.create_secret(
      '9d49e59fc7c72682fd2490459592d42ba67c9b934d865507dbca80d6ec4cfbcb',
      'cron_secret',
      'Secret partagé entre pg_cron et les edge functions'
    );
  END IF;
END $$;

-- ─── Helper : appelle une edge function avec le cron secret ───
CREATE OR REPLACE FUNCTION public.call_edge_function(fn_name TEXT)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $$
DECLARE
  base_url TEXT;
  secret   TEXT;
  req_id   BIGINT;
BEGIN
  SELECT decrypted_secret INTO base_url FROM vault.decrypted_secrets WHERE name = 'supabase_url';
  SELECT decrypted_secret INTO secret   FROM vault.decrypted_secrets WHERE name = 'cron_secret';

  SELECT net.http_post(
    url := base_url || '/functions/v1/' || fn_name,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) INTO req_id;

  RETURN req_id;
END;
$$;

-- ─── Désinstalle les anciens jobs si présents (idempotent) ───
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('gmail-sync-every-5min', 'workflow-tick-every-5min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ─── Schedule : Gmail sync toutes les 5 minutes ───
SELECT cron.schedule(
  'gmail-sync-every-5min',
  '*/5 * * * *',
  $$SELECT public.call_edge_function('gmail-sync')$$
);

-- ─── Schedule : Workflow tick toutes les 5 minutes ───
SELECT cron.schedule(
  'workflow-tick-every-5min',
  '*/5 * * * *',
  $$SELECT public.call_edge_function('workflow-tick')$$
);
