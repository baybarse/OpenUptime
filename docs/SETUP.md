# OpenUptime — Full Setup Guide

This guide walks you through setting up OpenUptime from scratch. Total time: ~20 minutes.

---

## Step 1: Fork the Repository

1. Go to the OpenUptime GitLab repository
2. Click **Fork** to create your own copy
3. Clone it locally:
   ```bash
   git clone https://gitlab.com/YOUR_USERNAME/openuptime.git
   cd openuptime
   ```

---

## Step 2: Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and sign up (free)
2. Click **New Project**
3. Choose a name (e.g., `openuptime`), set a database password, select a region
4. Wait for the project to be created (~2 minutes)

### Get your API credentials

1. Go to **Settings → API**
2. Copy:
   - **Project URL** (e.g., `https://abcdefg.supabase.co`)
   - **anon / public** key
   - **service_role** key (keep this secret!)

---

## Step 3: Configure Google OAuth

### In Google Cloud Console:

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Go to **APIs & Services → OAuth consent screen**
   - Choose **External** user type
   - Fill in app name: `OpenUptime`
   - Add your email as support email
   - Add authorized domains (your GitLab Pages domain)
   - Save
4. Go to **APIs & Services → Credentials**
   - Click **Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Name: `OpenUptime`
   - Authorized redirect URIs: Add `https://YOUR_SUPABASE_PROJECT_REF.supabase.co/auth/v1/callback`
   - Click **Create**
   - Copy the **Client ID** and **Client Secret**

### In Supabase Dashboard:

1. Go to **Authentication → Providers → Google**
2. Toggle **Enable**
3. Paste the **Client ID** and **Client Secret** from Google
4. Save

---

## Step 4: Run the Database Migration

1. In Supabase Dashboard, go to **SQL Editor**
2. Open the file `supabase/migrations/001_initial_schema.sql`
3. Copy the entire contents
4. Paste into the SQL Editor
5. **Before running**, replace the cron job placeholders:
   - Replace `<PROJECT_REF>` with your Supabase project ref (from the URL, e.g., `abcdefg`)
   - Replace `<SERVICE_ROLE_KEY>` with your service_role key
6. Click **Run**

> ⚠️ The `pg_cron` and `pg_net` extensions must be enabled. They are available on Supabase free tier.

---

## Step 5: Deploy the Edge Function

### Install Supabase CLI

```bash
npm install -g supabase
```

### Login and link your project

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

### Set secrets

```bash
supabase secrets set RESEND_API_KEY=re_your_resend_api_key_here
```

### Deploy the function

```bash
supabase functions deploy check-monitors --no-verify-jwt
```

> The `--no-verify-jwt` flag allows pg_cron to call the function with a service_role key.

---

## Step 6: Set Up Resend (Email Alerts)

1. Go to [resend.com](https://resend.com) and sign up (free)
2. Go to **API Keys** and create a new key
3. Copy the key (starts with `re_`)
4. Set it as a Supabase secret (Step 5 above)

> **Free tier**: 100 emails/day, 3000/month — more than enough for alerts.

---

## Step 7: Update Frontend Configuration

Edit `public/js/config.js`:

```javascript
const SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
const SUPABASE_ANON_KEY = 'eyJ...your_anon_key_here';
```

---

## Step 8: Deploy to GitLab Pages

1. Commit and push your changes:
   ```bash
   git add .
   git commit -m "Configure OpenUptime"
   git push origin main
   ```
2. GitLab CI/CD will automatically deploy the `public/` folder to GitLab Pages
3. Go to **Settings → Pages** in your GitLab project to find your URL
4. Your site will be available at: `https://YOUR_USERNAME.gitlab.io/openuptime/`

### Custom Domain (Optional)

1. In GitLab: **Settings → Pages → New Domain**
2. Add your custom domain and follow the DNS instructions

---

## Step 9: Verify Everything Works

1. Visit your GitLab Pages URL
2. Click **Sign in with Google**
3. Add a test monitor (e.g., `https://google.com`)
4. Wait 5 minutes for the first check
5. Check Supabase Dashboard → **Table Editor → check_results** to verify data is coming in

### Test Email Alerts

1. Add a monitor with a URL that returns an error (e.g., `https://httpstat.us/500`)
2. Set alert threshold to 1
3. Wait for the cron job to run (every 5 minutes)
4. Check your email for the alert

---

## Troubleshooting

### "Sign in with Google" doesn't work
- Check that the OAuth redirect URI is correct in Google Cloud Console
- Make sure Google provider is enabled in Supabase → Authentication → Providers

### Monitors aren't being checked
- Verify the cron job is active: In Supabase SQL Editor, run `SELECT * FROM cron.job;`
- Check Edge Function logs: `supabase functions logs check-monitors`
- Make sure `<PROJECT_REF>` and `<SERVICE_ROLE_KEY>` are replaced in the cron job

### Emails aren't being sent
- Check that `RESEND_API_KEY` is set: `supabase secrets list`
- Check Edge Function logs for email errors
- Make sure you have notification settings saved (Settings page in the app)

### GitLab Pages 404
- Make sure the `public/` directory exists and contains `index.html`
- Check that the `.gitlab-ci.yml` file is in the root of the repository
- Verify the pipeline ran successfully in **CI/CD → Pipelines**
