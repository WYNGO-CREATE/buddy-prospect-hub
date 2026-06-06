-- Vide les anciens previews générés avec le template v1 (avant la refonte
-- agency-level). À la prochaine génération, le user aura automatiquement la
-- nouvelle version (cache 24h skipé puisque pas de row existante).
delete from prospect_previews;
