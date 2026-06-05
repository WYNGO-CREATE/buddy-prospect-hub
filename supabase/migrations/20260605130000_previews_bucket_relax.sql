-- Élargit les mime-types autorisés pour le bucket `previews` :
-- on accepte text/html sous toutes ses formes (avec ou sans charset).
update storage.buckets
set allowed_mime_types = array['text/html', 'image/png', 'image/jpeg', 'image/webp', 'text/css', 'application/javascript']
where id = 'previews';
