-- Purge des previews avec ancienne URL (storage ou view-preview). Le prochain
-- clic régénère avec la nouvelle URL Worker (/p/<slug>).
delete from prospect_previews where html_url not like '%/p/%';
