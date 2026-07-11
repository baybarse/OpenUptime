// ══════════════════════════════════════════════
// OpenUptime — Configuration
// ══════════════════════════════════════════════
// Replace these values with your Supabase project credentials.
// Find them in: Supabase Dashboard → Settings → API

const SUPABASE_URL = 'https://kotcgjegmgbssqbbedkt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtvdGNnamVnbWdic3NxYmJlZGt0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM3MTUxMTUsImV4cCI6MjA5OTI5MTExNX0.1w4egdTLroKp1-noQQfDS67IG-e7IPDROjArW5FnriU';

const APP_CONFIG = {
  appName: 'OpenUptime',
  version: '1.0.0',
  maxMonitors: 5,
  defaultCheckInterval: 5, // minutes
  defaultAlertThreshold: 3, // consecutive failures
  refreshInterval: 60000, // dashboard auto-refresh (ms)
};
