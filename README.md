<div align="center">
  <img src="https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/activity.svg" width="64" height="64" alt="OpenUptime Logo">
  <h1>OpenUptime</h1>
  <p><b>The Ultimate Free Uptime Monitoring Solution</b></p>
  
  <p>
    <em>Know when your website goes down — before your users do. OpenUptime monitors your sites every minute, sends instant alerts, and gives you deep diagnostics with SSL checks, CDN detection, and performance grading.</em>
  </p>
</div>

---

## 🌟 Why OpenUptime?

Tired of paying premium subscriptions for basic website monitoring? OpenUptime brings **enterprise-grade monitoring tools, deep diagnostics, and instant alerts** to developers for absolutely **$0/month**. 

Built on a brilliantly efficient serverless architecture using **Supabase** and **Resend**, OpenUptime is designed to give you complete control and transparency without the vendor lock-in. 

It features a breathtakingly beautiful **Dark Mode UI** with glassmorphism effects that makes monitoring your infrastructure a visually stunning experience.

## ✨ Premium Features Included for Free

- 🚀 **Lightning-Fast Real-Time Monitoring:** Check your websites every 1–30 minutes. Get instant status updates, response time tracking, and uptime percentage calculations.
- 🔔 **Intelligent Alerting:** Receive email notifications the moment your site goes down or recovers. Configurable alert thresholds (e.g., alert after 3 consecutive failures) prevent false positives from temporary network hiccups.
- 🔬 **Deep Diagnostics & Telemetry:** We don't just check if your site is up; we analyze *how* it's running:
  - **Timing Breakdown:** Detailed DNS lookup, TCP connection, and TTFB download times.
  - **Infrastructure Detection:** Automatically detects CDNs (Cloudflare, Vercel, AWS), Web Servers (Nginx, Apache), and frameworks (React, Next.js, WordPress).
  - **Security Audit:** Automatic checks for HTTPS, HSTS, CSP, and X-Frame-Options.
  - **Raw Data:** Access raw response headers and body previews for every check.
- 📊 **Rich Analytics:** Visual 30-day uptime history bars, dynamic response time charts with Chart.js, redirect chain tracking, and detailed timing breakdowns.
- 🏆 **Performance Grading:** Automatically assigns an A+ to F grade based on response time, DNS lookup, and connection speed to help you identify bottlenecks.
- 🛡️ **Secure Google OAuth:** Frictionless and secure authentication out of the box.
- 🎮 **Pro Playground:** A live demo environment allowing users to experience premium features without modifying real data.

## ☕ Support

If OpenUptime has helped you keep your sites online and saved you money on monitoring subscriptions, consider supporting the creator:

<a href="https://kreosus.com/baybarse/about" target="_blank">
  <img src="https://img.shields.io/badge/Support-Buy%20me%20a%20coffee-ff69b4?style=for-the-badge&logo=kofi&logoColor=white" alt="Support for a Coffee">
</a>

## 🏗️ Architecture

A masterpiece of modern serverless design:

```text
┌──────────────────┐     ┌──────────────────────────────────┐
│   Static Host    │     │           Supabase               │
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
- A [Resend](https://resend.com) account (free tier — 100 emails/day)
- A [Google Cloud Console](https://console.cloud.google.com) project for OAuth

### Setup Steps

1. **Create a Supabase project**
2. **Configure Google OAuth** in Supabase Dashboard
3. **Run the SQL migration** in Supabase SQL Editor
4. **Deploy the Edge Function**
5. **Update `config.js`** with your Supabase URL and anon key
6. **Deploy** your frontend to any static host.

## 💰 Cost Breakdown

| Service | Free Tier Capabilities | Your Cost |
|---------|-----------|-------|
| **Supabase** | 500MB DB, 500K Edge Function calls/mo | ✅ $0 |
| **Static Hosting** | Unlimited global static hosting | ✅ $0 |
| **Resend** | 100 emails/day, 3000/mo | ✅ $0 |
| **Total** | Enterprise-grade monitoring | **$0/month** |

## 📄 License

This project is licensed under the MIT License.

---

<div align="center">
  Built with ❤️ using <a href="https://supabase.com">Supabase</a> and <a href="https://resend.com">Resend</a>.
</div>
