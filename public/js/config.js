// ══════════════════════════════════════════════
// OpenUptime — Configuration
// ══════════════════════════════════════════════
// Replace these values with your Supabase project credentials.
// Find them in: Supabase Dashboard → Settings → API

const SUPABASE_URL = '{{SUPABASE_URL}}';
const SUPABASE_ANON_KEY = '{{SUPABASE_ANON_KEY}}';

const APP_CONFIG = {
  appName: 'OpenUptime',
  version: '1.0.0',
  maxMonitors: 5,
  defaultCheckInterval: 5, // minutes
  defaultAlertThreshold: 3, // consecutive failures
  refreshInterval: 60000, // dashboard auto-refresh (ms)
};
