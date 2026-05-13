
ALTER TABLE public.prospects ADD COLUMN IF NOT EXISTS website text;

CREATE INDEX IF NOT EXISTS prospects_email_lower_idx ON public.prospects (lower(email));
CREATE INDEX IF NOT EXISTS prospects_phone_digits_idx ON public.prospects (regexp_replace(coalesce(phone,''), '\D', '', 'g'));
CREATE INDEX IF NOT EXISTS prospects_website_norm_idx ON public.prospects (lower(regexp_replace(coalesce(website,''), '^https?://(www\.)?', '')));

CREATE OR REPLACE FUNCTION public.find_prospect_duplicates(
  _email text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _website text DEFAULT NULL,
  _exclude_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  first_name text,
  last_name text,
  company text,
  email text,
  phone text,
  website text,
  status prospect_status,
  owner_id uuid,
  owner_name text,
  match_email boolean,
  match_phone boolean,
  match_website boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH norm AS (
    SELECT
      nullif(lower(trim(_email)), '') AS e,
      nullif(regexp_replace(coalesce(_phone,''), '\D', '', 'g'), '') AS p,
      nullif(lower(regexp_replace(regexp_replace(coalesce(_website,''), '^https?://(www\.)?', ''), '/+$', '')), '') AS w
  )
  SELECT
    pr.id, pr.first_name, pr.last_name, pr.company, pr.email, pr.phone, pr.website, pr.status,
    pr.owner_id, COALESCE(pf.full_name, pf.email) AS owner_name,
    (norm.e IS NOT NULL AND lower(pr.email) = norm.e) AS match_email,
    (norm.p IS NOT NULL AND regexp_replace(coalesce(pr.phone,''), '\D', '', 'g') = norm.p) AS match_phone,
    (norm.w IS NOT NULL AND lower(regexp_replace(regexp_replace(coalesce(pr.website,''), '^https?://(www\.)?', ''), '/+$', '')) = norm.w) AS match_website
  FROM public.prospects pr
  LEFT JOIN public.profiles pf ON pf.id = pr.owner_id
  CROSS JOIN norm
  WHERE (_exclude_id IS NULL OR pr.id <> _exclude_id)
    AND (
      (norm.e IS NOT NULL AND lower(pr.email) = norm.e)
      OR (norm.p IS NOT NULL AND regexp_replace(coalesce(pr.phone,''), '\D', '', 'g') = norm.p)
      OR (norm.w IS NOT NULL AND lower(regexp_replace(regexp_replace(coalesce(pr.website,''), '^https?://(www\.)?', ''), '/+$', '')) = norm.w)
    )
  LIMIT 20;
$$;

GRANT EXECUTE ON FUNCTION public.find_prospect_duplicates(text, text, text, uuid) TO authenticated;
