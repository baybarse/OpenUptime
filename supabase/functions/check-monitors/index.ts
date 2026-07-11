// ══════════════════════════════════════════════════════════════
// OpenUptime — Edge Function: check-monitors
// ══════════════════════════════════════════════════════════════
// This function is called every 5 minutes by pg_cron.
// It checks all active monitors, records results, detects
// anomalies based on alert_threshold, and sends email alerts.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendApiKey = Deno.env.get('RESEND_API_KEY')

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch all active monitors
    const { data: monitors, error: monitorError } = await supabase
      .from('monitors')
      .select('*')
      .eq('is_active', true)

    if (monitorError) {
      console.error('Error fetching monitors:', monitorError)
      return new Response(JSON.stringify({ error: monitorError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!monitors || monitors.length === 0) {
      return new Response(JSON.stringify({ message: 'No active monitors' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const now = Date.now()
    const monitorsToCheck = monitors.filter(m => {
      if (!m.last_checked_at) return true
      const lastCheck = new Date(m.last_checked_at).getTime()
      const intervalMs = (m.interval_minutes || 5) * 60 * 1000
      // Check if interval has passed (allowing a 15s buffer for cron delays)
      return now - lastCheck >= (intervalMs - 15000)
    })

    if (monitorsToCheck.length === 0) {
      return new Response(JSON.stringify({ message: 'No monitors due for check' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Check each monitor concurrently
    const results = await Promise.allSettled(
      monitorsToCheck.map((monitor) => checkMonitor(supabase, monitor, resendApiKey))
    )

    const summary = {
      total: monitors.length,
      checked: results.filter(r => r.status === 'fulfilled').length,
      errors: results.filter(r => r.status === 'rejected').length,
      timestamp: new Date().toISOString(),
    }

    console.log('Check complete:', summary)

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// ─── Check a single monitor ───
async function checkMonitor(
  supabase: any,
  monitor: any,
  resendApiKey: string | undefined
) {
  const startTime = Date.now()
  let statusCode: number | null = null
  let responseTimeMs: number | null = null
  let isUp = false
  let errorMessage: string | null = null

  try {
    // Create abort controller for timeout (10 seconds)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    const response = await fetch(monitor.url, {
      method: monitor.method || 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'OpenUptime/1.0 (Uptime Monitor)',
      },
      redirect: 'follow',
    })

    clearTimeout(timeoutId)

    statusCode = response.status
    responseTimeMs = Date.now() - startTime
    isUp = statusCode === (monitor.expected_status || 200)
  } catch (err: any) {
    responseTimeMs = Date.now() - startTime
    isUp = false

    if (err.name === 'AbortError') {
      errorMessage = 'Request timed out (10s)'
    } else {
      errorMessage = err.message || 'Connection failed'
    }
  }

  // Insert check result
  await supabase.from('check_results').insert({
    monitor_id: monitor.id,
    status_code: statusCode,
    response_time_ms: responseTimeMs,
    is_up: isUp,
    error_message: errorMessage,
    checked_at: new Date().toISOString(),
  })

  // ─── Alert Threshold Logic ───
  // Track consecutive failures. Only alert when threshold is reached.
  const previouslyUp = monitor.is_up
  const previousFailures = monitor.consecutive_failures || 0
  const alertThreshold = monitor.alert_threshold || 3

  let newConsecutiveFailures: number
  let shouldCreateIncident = false
  let shouldResolveIncident = false

  if (isUp) {
    // Site is up — reset failures
    newConsecutiveFailures = 0

    if (!previouslyUp) {
      // Was down, now recovered → resolve incident
      shouldResolveIncident = true
    }
  } else {
    // Site is down — increment failures
    newConsecutiveFailures = previousFailures + 1

    // Only create incident when threshold is first reached
    if (newConsecutiveFailures === alertThreshold && previouslyUp) {
      shouldCreateIncident = true
    }
    // If we already crossed the threshold previously, incident already exists
    if (previousFailures >= alertThreshold && !previouslyUp) {
      // Incident already created, do nothing extra
    }
    // If threshold just reached now
    if (newConsecutiveFailures >= alertThreshold && previouslyUp) {
      shouldCreateIncident = true
    }
  }

  // Determine new is_up status: only mark as down when threshold is reached
  const newIsUp = isUp || (newConsecutiveFailures < alertThreshold)

  // Update monitor state
  await supabase
    .from('monitors')
    .update({
      is_up: newIsUp,
      last_checked_at: new Date().toISOString(),
      consecutive_failures: newConsecutiveFailures,
    })
    .eq('id', monitor.id)

  // ─── Incident Management ───

  if (shouldCreateIncident) {
    // Create a new incident
    await supabase.from('incidents').insert({
      monitor_id: monitor.id,
      started_at: new Date().toISOString(),
      cause: errorMessage || `HTTP ${statusCode} (expected ${monitor.expected_status || 200})`,
      is_resolved: false,
    })

    // Send DOWN alert email
    await sendAlertEmail(supabase, monitor, 'down', {
      statusCode,
      errorMessage,
      responseTimeMs,
      threshold: alertThreshold,
    }, resendApiKey)
  }

  if (shouldResolveIncident) {
    // Resolve the active incident
    const { data: activeIncident } = await supabase
      .from('incidents')
      .select('*')
      .eq('monitor_id', monitor.id)
      .eq('is_resolved', false)
      .order('started_at', { ascending: false })
      .limit(1)
      .single()

    if (activeIncident) {
      await supabase
        .from('incidents')
        .update({
          resolved_at: new Date().toISOString(),
          is_resolved: true,
        })
        .eq('id', activeIncident.id)

      // Send RECOVERY alert email
      const downtimeMs = Date.now() - new Date(activeIncident.started_at).getTime()
      await sendAlertEmail(supabase, monitor, 'up', {
        downtimeMs,
        resolvedAt: new Date().toISOString(),
      }, resendApiKey)
    }
  }

  return { monitorId: monitor.id, isUp, statusCode, responseTimeMs }
}

// ─── Send Alert Email via Resend ───
async function sendAlertEmail(
  supabase: any,
  monitor: any,
  alertType: 'down' | 'up',
  details: any,
  resendApiKey: string | undefined
) {
  if (!resendApiKey) {
    console.log('No RESEND_API_KEY set, skipping email')
    return
  }

  // Get user's notification settings
  const { data: settings } = await supabase
    .from('notification_settings')
    .select('*')
    .eq('user_id', monitor.user_id)
    .single()

  if (!settings) {
    console.log('No notification settings for user', monitor.user_id)
    return
  }

  // Check if user wants this type of notification
  if (alertType === 'down' && !settings.notify_down) return
  if (alertType === 'up' && !settings.notify_up) return

  const to = settings.email

  let subject: string
  let html: string

  if (alertType === 'down') {
    subject = `🔴 DOWN: ${monitor.name} is not responding`
    html = `
      <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 560px; margin: 0 auto; background: #0f0f17; color: #f1f5f9; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.06);">
        <div style="background: linear-gradient(135deg, #dc2626, #b91c1c); padding: 24px 32px;">
          <h1 style="margin: 0; font-size: 20px; color: #fff;">🔴 Monitor Down</h1>
        </div>
        <div style="padding: 32px;">
          <h2 style="margin: 0 0 8px; font-size: 18px;">${monitor.name}</h2>
          <p style="margin: 0 0 20px; color: #94a3b8; font-size: 14px;">${monitor.url}</p>
          
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #94a3b8; font-size: 13px;">Status Code</td>
              <td style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.06); text-align: right; font-weight: 600; font-size: 13px;">${details.statusCode || 'N/A'}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #94a3b8; font-size: 13px;">Error</td>
              <td style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.06); text-align: right; font-weight: 600; font-size: 13px;">${details.errorMessage || 'Unexpected status'}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #94a3b8; font-size: 13px;">Alert Threshold</td>
              <td style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.06); text-align: right; font-weight: 600; font-size: 13px;">${details.threshold} consecutive failures</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #94a3b8; font-size: 13px;">Time</td>
              <td style="padding: 10px 0; text-align: right; font-weight: 600; font-size: 13px;">${new Date().toUTCString()}</td>
            </tr>
          </table>
          
          <p style="color: #64748b; font-size: 12px; margin: 0;">— OpenUptime</p>
        </div>
      </div>
    `
  } else {
    const downtimeMinutes = Math.floor((details.downtimeMs || 0) / 60000)
    const downtimeDisplay = downtimeMinutes > 60
      ? `${Math.floor(downtimeMinutes / 60)}h ${downtimeMinutes % 60}m`
      : `${downtimeMinutes}m`

    subject = `🟢 RECOVERED: ${monitor.name} is back online`
    html = `
      <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 560px; margin: 0 auto; background: #0f0f17; color: #f1f5f9; border-radius: 16px; overflow: hidden; border: 1px solid rgba(255,255,255,0.06);">
        <div style="background: linear-gradient(135deg, #059669, #047857); padding: 24px 32px;">
          <h1 style="margin: 0; font-size: 20px; color: #fff;">🟢 Monitor Recovered</h1>
        </div>
        <div style="padding: 32px;">
          <h2 style="margin: 0 0 8px; font-size: 18px;">${monitor.name}</h2>
          <p style="margin: 0 0 20px; color: #94a3b8; font-size: 14px;">${monitor.url}</p>
          
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
            <tr>
              <td style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.06); color: #94a3b8; font-size: 13px;">Total Downtime</td>
              <td style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.06); text-align: right; font-weight: 600; font-size: 13px;">${downtimeDisplay}</td>
            </tr>
            <tr>
              <td style="padding: 10px 0; color: #94a3b8; font-size: 13px;">Recovered At</td>
              <td style="padding: 10px 0; text-align: right; font-weight: 600; font-size: 13px;">${new Date().toUTCString()}</td>
            </tr>
          </table>
          
          <p style="color: #64748b; font-size: 12px; margin: 0;">— OpenUptime</p>
        </div>
      </div>
    `
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'OpenUptime <onboarding@resend.dev>',
        to: [to],
        subject,
        html,
      }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      console.error('Resend API error:', errBody)
    } else {
      console.log(`Alert email sent to ${to}: ${alertType}`)
    }
  } catch (err) {
    console.error('Failed to send email:', err)
  }
}
