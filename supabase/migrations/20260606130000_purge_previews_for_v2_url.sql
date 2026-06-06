-- Purge des previews dont l'URL pointe vers /storage/v1/ (qui sert text/plain).
-- À la prochaine génération, l'URL sera /functions/v1/view-preview/<slug>
-- qui sert correctement avec Content-Type: text/html.
delete from prospect_previews where html_url like '%/storage/v1/object/public/%';
