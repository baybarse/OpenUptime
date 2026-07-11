-- ══════════════════════════════════════════════════════════════
-- OpenUptime — Initial Database Schema
-- ══════════════════════════════════════════════════════════════
-- Run this SQL in your Supabase SQL Editor (Dashboard → SQL Editor)
-- This creates all tables, RLS policies, indexes, and cron jobs.

-- ═══════════════ EXTENSIONS ═══════════════

-- pg_cron: Schedule periodic tasks (monitor checks, cleanup)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- pg_net: Make HTTP requests from PostgreSQL (to trigger Edge Functions)
CREATE EXTENSION IF NOT EXISTS pg_net;


-- ═══════════════ TABLES ═══════════════

-- Monitors: Websites being tracked
CREATE TABLE IF NOT EXISTS public.monitors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  method TEXT DEFAULT 'GET' CHECK (method IN ('GET', 'HEAD', 'POST')),
  interval_minutes INTEGER DEFAULT 5 CHECK (interval_minutes IN (1, 5, 10, 15, 30)),
  expected_status INTEGER DEFAULT 200,
  alert_threshold INTEGER DEFAULT 3 CHECK (alert_threshold >= 1 AND alert_threshold <= 10),
  consecutive_failures INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  is_up BOOLEAN DEFAULT true,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON COLUMN public.monitors.alert_threshold IS 'Number of consecutive failures required before sending an email alert';
COMMENT ON COLUMN public.monitors.consecutive_failures IS 'Current count of consecutive failed checks (reset to 0 on success)';

-- Check Results: Individual check history
CREATE TABLE IF NOT EXISTS public.check_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  monitor_id UUID REFERENCES public.monitors(id) ON DELETE CASCADE NOT NULL,
  status_code INTEGER,
  response_time_ms INTEGER,
  is_up BOOLEAN NOT NULL,
  error_message TEXT,
  response_headers JSONB,
  analysis TEXT,
  checked_at TIMESTAMPTZ DEFAULT now()
);

-- Incidents: Downtime events
CREATE TABLE IF NOT EXISTS public.incidents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  monitor_id UUID REFERENCES public.monitors(id) ON DELETE CASCADE NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  cause TEXT,
  is_resolved BOOLEAN DEFAULT false
);

-- Notification Settings: Per-user email alert preferences
CREATE TABLE IF NOT EXISTS public.notification_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  notify_down BOOLEAN DEFAULT true,
  notify_up BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);


-- ═══════════════ INDEXES ═══════════════

-- Fast lookups for check results by monitor and time
CREATE INDEX IF NOT EXISTS idx_check_results_monitor_time
  ON public.check_results (monitor_id, checked_at DESC);

-- Fast user-based monitor lookups
CREATE INDEX IF NOT EXISTS idx_monitors_user
  ON public.monitors (user_id);

-- Active monitors for cron job
CREATE INDEX IF NOT EXISTS idx_monitors_active
  ON public.monitors (is_active) WHERE is_active = true;

-- Active incidents lookup
CREATE INDEX IF NOT EXISTS idx_incidents_monitor_active
  ON public.incidents (monitor_id, is_resolved) WHERE is_resolved = false;


-- ═══════════════ AUTO-UPDATE TIMESTAMP ═══════════════

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_monitors_updated_at ON public.monitors;
CREATE TRIGGER trigger_monitors_updated_at
  BEFORE UPDATE ON public.monitors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ═══════════════ MONITOR COUNT LIMIT ═══════════════

-- Function to enforce max monitors per user (called by RLS or app logic)
CREATE OR REPLACE FUNCTION public.check_monitor_limit()
RETURNS TRIGGER AS $$
DECLARE
  monitor_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO monitor_count
  FROM public.monitors
  WHERE user_id = NEW.user_id;

  IF monitor_count >= 5 THEN
    RAISE EXCEPTION 'Monitor limit reached. Free plan allows up to 5 monitors.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_check_monitor_limit ON public.monitors;
CREATE TRIGGER trigger_check_monitor_limit
  BEFORE INSERT ON public.monitors
  FOR EACH ROW EXECUTE FUNCTION public.check_monitor_limit();


-- ═══════════════ ROW LEVEL SECURITY ═══════════════

-- Enable RLS on all tables
ALTER TABLE public.monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.check_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

-- ─── Monitors Policies ───

CREATE POLICY "Users can view their own monitors"
  ON public.monitors FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own monitors"
  ON public.monitors FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own monitors"
  ON public.monitors FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own monitors"
  ON public.monitors FOR DELETE
  USING (auth.uid() = user_id);

-- Service role can access all monitors (for Edge Functions)
CREATE POLICY "Service role full access to monitors"
  ON public.monitors FOR ALL
  USING (auth.role() = 'service_role');

-- ─── Check Results Policies ───

CREATE POLICY "Users can view check results for their monitors"
  ON public.check_results FOR SELECT
  USING (
    monitor_id IN (
      SELECT id FROM public.monitors WHERE user_id = auth.uid()
    )
  );

-- Service role can insert/read all check results (for Edge Functions)
CREATE POLICY "Service role full access to check_results"
  ON public.check_results FOR ALL
  USING (auth.role() = 'service_role');

-- ─── Incidents Policies ───

CREATE POLICY "Users can view incidents for their monitors"
  ON public.incidents FOR SELECT
  USING (
    monitor_id IN (
      SELECT id FROM public.monitors WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access to incidents"
  ON public.incidents FOR ALL
  USING (auth.role() = 'service_role');

-- ─── Notification Settings Policies ───

CREATE POLICY "Users can view their own notification settings"
  ON public.notification_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own notification settings"
  ON public.notification_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own notification settings"
  ON public.notification_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own notification settings"
  ON public.notification_settings FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to notification_settings"
  ON public.notification_settings FOR ALL
  USING (auth.role() = 'service_role');


-- ═══════════════ CRON JOBS ═══════════════
-- ⚠️  IMPORTANT: GitHub Actions will replace {{SUPABASE_PROJECT_REF}} and {{SUPABASE_SERVICE_ROLE_KEY}}
--     with your actual secrets during deployment.
--     Do NOT write your secrets directly into this file!

-- Check monitors every 1 minute
-- This calls the Edge Function which checks all active monitors that are due for a check
SELECT cron.schedule(
  'check-monitors-job',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://{{SUPABASE_PROJECT_REF}}.supabase.co/functions/v1/check-monitors',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer {{SUPABASE_SERVICE_ROLE_KEY}}"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Cleanup: Delete check results older than 30 days (runs daily at midnight UTC)
SELECT cron.schedule(
  'cleanup-old-results',
  '0 0 * * *',
  $$ DELETE FROM public.check_results WHERE checked_at < now() - interval '30 days'; $$
);


-- ═══════════════ DONE ═══════════════
-- Schema created successfully!
-- Next steps:
--   1. Deploy the Edge Function: supabase functions deploy check-monitors
--   2. Set Edge Function secrets: supabase secrets set RESEND_API_KEY=your_key
--   3. GitHub Actions will handle deploying this schema with your Environment Secrets.
