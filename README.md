# OpenUptime

**Free, open-source uptime monitoring for your websites.**

Monitor your websites, get instant email alerts when they go down, and track uptime history — all for free.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Hosting](https://img.shields.io/badge/hosting-GitLab%20Pages-orange.svg)
![Database](https://img.shields.io/badge/database-Supabase-green.svg)

---

## ✨ Features

- **Google Sign-In** — Secure authentication via Google OAuth
- **5 Free Monitors** — Track up to 5 websites per account
- **Configurable Intervals** — Check every 5, 10, 15, or 30 minutes
- **Smart Alerts** — Set custom thresholds (e.g., alert after 3 consecutive failures)
- **Email Notifications** — Get notified when sites go down and recover (via Resend)
- **Response Time Charts** — Visualize performance with Chart.js graphs
- **30-Day Uptime Bar** — See daily uptime at a glance
- **Incident History** — Track all downtime events with duration
- **Dark Mode UI** — Beautiful glassmorphism design
- **Mobile Responsive** — Works great on any device
- **100% Free** — No costs using free tiers of Supabase, GitLab Pages, and Resend

## 🏗️ Architecture

```
┌──────────────────┐     ┌──────────────────────────────────┐
│   GitLab Pages   │     │           Supabase               │
│   (Frontend)     │────▶│  Auth · Database · Edge Functions │
│   Static HTML/JS │     │                                  │
└──────────────────┘     │  pg_cron ──▶ Edge Function       │
                         │              │                   │
                         │              ▼                   │
                         │         Check URLs               │
                         │              │                   │
                         │              ▼                   │
                         │  ┌──────────────────────┐        │
                         │  │ Resend (Email Alerts) │        │
                         │  └──────────────────────┘        │
                         └──────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- A [Supabase](https://supabase.com) account (free tier)
- A [GitLab](https://gitlab.com) account (free tier)
- A [Resend](https://resend.com) account (free tier — 100 emails/day)
- A [Google Cloud Console](https://console.cloud.google.com) project for OAuth

### Setup Steps

1. **Fork this repository** on GitLab
2. **Create a Supabase project** → See [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)
3. **Configure Google OAuth** in Supabase Dashboard
4. **Run the SQL migration** in Supabase SQL Editor
5. **Deploy the Edge Function**
6. **Update `config.js`** with your Supabase URL and anon key
7. **Push to main** → GitLab Pages will auto-deploy

📖 **Full setup guide:** [docs/SETUP.md](docs/SETUP.md)

## 💰 Cost Breakdown

| Service | Free Tier | Usage |
|---------|-----------|-------|
| Supabase | 500MB DB, 500K Edge Function calls/mo | ✅ |
| GitLab Pages | Unlimited static hosting | ✅ |
| Resend | 100 emails/day, 3000/mo | ✅ |
| **Total** | | **$0/month** |

## 📁 Project Structure

```
├── .gitlab-ci.yml                      # GitLab Pages deployment
├── public/                             # Static frontend (served by GitLab Pages)
│   ├── index.html                      # Single Page Application
│   ├── css/style.css                   # Design system
│   └── js/
│       ├── config.js                   # Supabase credentials
│       ├── auth.js                     # Google OAuth
│       ├── router.js                   # SPA routing
│       ├── monitors.js                 # Monitor CRUD
│       ├── dashboard.js                # Dashboard page
│       ├── monitor-detail.js           # Detail page + charts
│       ├── settings.js                 # Notification settings
│       └── app.js                      # Main application
├── supabase/
│   ├── migrations/001_initial_schema.sql  # Database schema + RLS + cron
│   └── functions/check-monitors/index.ts  # Edge Function
└── docs/
    ├── SETUP.md                        # Full setup guide
    └── SUPABASE_SETUP.md               # Supabase configuration
```

## 🔐 How Alert Thresholds Work

Instead of alerting on every single failure, OpenUptime uses **configurable thresholds**:

1. You set a check interval (e.g., every **5 minutes**)
2. You set an alert threshold (e.g., **3 consecutive failures**)
3. The system only creates an incident and sends an email after 3 failed checks in a row
4. In this example: alert fires after **15 minutes** of continuous downtime

This prevents false positives from temporary network hiccups.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

Built with ❤️ using [Supabase](https://supabase.com), [GitLab Pages](https://docs.gitlab.com/ee/user/project/pages/), and [Resend](https://resend.com).
