# Supabase Configuration Guide

Detailed instructions for configuring your Supabase project for OpenUptime.

---

## 1. Enable Required Extensions

Go to **Database → Extensions** in Supabase Dashboard and enable:

- **pg_cron** — For scheduling periodic monitor checks
- **pg_net** — For making HTTP requests from the database to trigger Edge Functions

Both are available on the free tier.

---

## 2. Run the Database Migration

1. Go to **SQL Editor** in Supabase Dashboard
2. Click **New Query**
3. Copy the contents of `supabase/migrations/001_initial_schema.sql`
4. **Important**: Before running, replace these placeholders in the cron job section:
   ```sql
   -- Replace <PROJECT_REF> with your project reference (e.g., 'abcdefghij')
   -- Replace <SERVICE_ROLE_KEY> with your service_role key
   ```
5. Click **Run**
6. You should see all tables created in **Table Editor**

### Verify Tables

After running the migration, you should see these tables:

| Table | Purpose |
|-------|---------|
| `monitors` | Websites being tracked |
| `check_results` | Individual check history |
| `incidents` | Downtime events |
| `notification_settings` | User email preferences |

---

## 3. Configure Authentication

### Enable Google Provider

1. Go to **Authentication → Providers**
2. Find **Google** and click to expand
3. Toggle **Enable Sign in with Google**
4. Enter your **Client ID** and **Client Secret** from Google Cloud Console
5. The **Callback URL** shown is what you need to add to Google Cloud Console
6. Save

### Auth Settings

1. Go to **Authentication → URL Configuration**
2. Set **Site URL** to your GitLab Pages URL (e.g., `https://username.gitlab.io/openuptime/`)
3. Add the same URL to **Redirect URLs**

---

## 4. Verify Row Level Security

All tables should have RLS enabled. Verify in **Authentication → Policies**:

### monitors
- Users can view/create/update/delete their own monitors
- Service role has full access

### check_results
- Users can view results for their own monitors
- Service role has full access

### incidents
- Users can view incidents for their own monitors
- Service role has full access

### notification_settings
- Users can manage their own settings
- Service role has full access

---

## 5. Verify Cron Jobs

Run this query in SQL Editor to check cron jobs:

```sql
SELECT * FROM cron.job;
```

You should see:

| jobname | schedule | command |
|---------|----------|---------|
| `check-monitors-job` | `*/5 * * * *` | HTTP POST to Edge Function |
| `cleanup-old-results` | `0 0 * * *` | Delete old check results |

### Manually Run a Check (for testing)

```sql
SELECT net.http_post(
  url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/check-monitors',
  headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
  body := '{}'::jsonb
);
```

---

## 6. Edge Function Deployment

### Using Supabase CLI

```bash
# Install CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Set secrets
supabase secrets set RESEND_API_KEY=re_your_key_here
# Deploy
supabase functions deploy check-monitors --no-verify-jwt
```

### Verify Deployment

```bash
# Check function logs
supabase functions logs check-monitors

# Test manually
curl -X POST \
  'https://refeerance.supabase.co/functions/v1/check-monitors' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json'
```

---

## 7. Database Schema Diagram

```
┌──────────────────────┐       ┌─────────────────────────┐
│     auth.users       │       │   notification_settings  │
│ (Supabase managed)   │◄─────┤   user_id (FK)           │
│                      │       │   email                  │
│                      │       │   notify_down            │
│                      │       │   notify_up              │
└──────────┬───────────┘       └─────────────────────────┘
           │
           │ user_id
           ▼
┌──────────────────────┐
│      monitors        │
│ id                   │
│ user_id (FK)         │
│ name, url, method    │
│ interval_minutes     │
│ expected_status      │
│ alert_threshold      │
│ consecutive_failures │
│ is_active, is_up     │
│ last_checked_at      │
└───────┬──────────────┘
        │
        │ monitor_id
        ▼
┌──────────────────┐    ┌──────────────────┐
│  check_results   │    │    incidents      │
│ monitor_id (FK)  │    │ monitor_id (FK)  │
│ status_code      │    │ started_at       │
│ response_time_ms │    │ resolved_at      │
│ is_up            │    │ cause            │
│ error_message    │    │ is_resolved      │
│ checked_at       │    └──────────────────┘
└──────────────────┘
```
