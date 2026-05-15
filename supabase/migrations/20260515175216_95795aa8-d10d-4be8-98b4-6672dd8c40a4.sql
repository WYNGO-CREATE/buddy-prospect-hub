CREATE OR REPLACE FUNCTION public.prospects_last_contact()
RETURNS TABLE(prospect_id uuid, last_contact_at timestamp with time zone)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    GREATEST(
      p.created_at,
      COALESCE((SELECT MAX(c.called_at) FROM public.call_logs c WHERE c.prospect_id = p.id), p.created_at),
      COALESCE((SELECT MAX(f.scheduled_at) FROM public.follow_ups f WHERE f.prospect_id = p.id AND f.completed = true), p.created_at)
    ) AS last_contact_at
  FROM public.prospects p
  WHERE p.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin');
$$;