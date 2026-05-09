
-- Roles enum and table
CREATE TYPE public.app_role AS ENUM ('admin', 'collaborator');

CREATE TYPE public.prospect_status AS ENUM ('nouveau','en_cours','interesse','converti','perdu','a_relancer');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- has_role function
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Prospects
CREATE TABLE public.prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  company TEXT,
  email TEXT,
  phone TEXT,
  source TEXT,
  notes TEXT,
  status prospect_status NOT NULL DEFAULT 'nouveau',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_prospects_owner ON public.prospects(owner_id);
CREATE INDEX idx_prospects_status ON public.prospects(status);

CREATE TABLE public.call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  called_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_minutes INTEGER,
  outcome TEXT,
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_calls_prospect ON public.call_logs(prospect_id);
CREATE INDEX idx_calls_owner ON public.call_logs(owner_id);

CREATE TABLE public.follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduled_at TIMESTAMPTZ NOT NULL,
  reason TEXT,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_followups_owner ON public.follow_ups(owner_id);
CREATE INDEX idx_followups_scheduled ON public.follow_ups(scheduled_at);

CREATE TABLE public.prospect_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES public.prospects(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.prospect_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_events_prospect ON public.prospect_events(prospect_id);

-- RLS policies

-- profiles: any authenticated user can read; user can update own
CREATE POLICY "profiles_read_authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- user_roles: user reads own; admin reads all
CREATE POLICY "user_roles_read_own" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_roles_admin_manage" ON public.user_roles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- prospects
CREATE POLICY "prospects_select" ON public.prospects FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "prospects_insert_own" ON public.prospects FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "prospects_update_own" ON public.prospects FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "prospects_delete_own" ON public.prospects FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- call_logs
CREATE POLICY "calls_select" ON public.call_logs FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "calls_insert_own" ON public.call_logs FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "calls_update_own" ON public.call_logs FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "calls_delete_own" ON public.call_logs FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- follow_ups
CREATE POLICY "followups_select" ON public.follow_ups FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "followups_insert_own" ON public.follow_ups FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "followups_update_own" ON public.follow_ups FOR UPDATE TO authenticated
  USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
CREATE POLICY "followups_delete_own" ON public.follow_ups FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- prospect_events
CREATE POLICY "events_select" ON public.prospect_events FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "events_insert_own" ON public.prospect_events FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- Trigger: handle new user (create profile + assign role)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  user_count INTEGER;
  assigned_role app_role;
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);

  SELECT COUNT(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    assigned_role := 'admin';
  ELSE
    assigned_role := 'collaborator';
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, assigned_role);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger: log prospect events on status change & creation
CREATE OR REPLACE FUNCTION public.log_prospect_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO public.prospect_events (prospect_id, owner_id, event_type, payload)
    VALUES (NEW.id, NEW.owner_id, 'created', jsonb_build_object('status', NEW.status));
  ELSIF (TG_OP = 'UPDATE') AND (NEW.status IS DISTINCT FROM OLD.status) THEN
    INSERT INTO public.prospect_events (prospect_id, owner_id, event_type, payload)
    VALUES (NEW.id, NEW.owner_id, 'status_changed',
      jsonb_build_object('from', OLD.status, 'to', NEW.status));
  END IF;
  IF (TG_OP = 'UPDATE') THEN
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prospect_events
  AFTER INSERT ON public.prospects
  FOR EACH ROW EXECUTE FUNCTION public.log_prospect_event();

CREATE TRIGGER trg_prospect_status_change
  BEFORE UPDATE ON public.prospects
  FOR EACH ROW EXECUTE FUNCTION public.log_prospect_event();

-- Log call as event
CREATE OR REPLACE FUNCTION public.log_call_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.prospect_events (prospect_id, owner_id, event_type, payload)
  VALUES (NEW.prospect_id, NEW.owner_id, 'call_logged',
    jsonb_build_object('outcome', NEW.outcome, 'summary', NEW.summary, 'duration', NEW.duration_minutes));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_call_event AFTER INSERT ON public.call_logs
  FOR EACH ROW EXECUTE FUNCTION public.log_call_event();

-- Log follow-up scheduled
CREATE OR REPLACE FUNCTION public.log_followup_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.prospect_events (prospect_id, owner_id, event_type, payload)
  VALUES (NEW.prospect_id, NEW.owner_id, 'follow_up_scheduled',
    jsonb_build_object('scheduled_at', NEW.scheduled_at, 'reason', NEW.reason));
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_followup_event AFTER INSERT ON public.follow_ups
  FOR EACH ROW EXECUTE FUNCTION public.log_followup_event();
