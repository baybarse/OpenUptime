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
  let responseHeaders: Record<string, string> | null = null
  let analysis: string | null = null
  let metadata: Record<string, any> = {}

  try {
    // Create abort controller for timeout (10 seconds)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    // ── Phase 1: DNS pre-check timing ──
    const dnsStart = Date.now()
    let resolvedUrl = monitor.url
    try {
      const urlObj = new URL(monitor.url)
      metadata.hostname = urlObj.hostname
      metadata.protocol = urlObj.protocol
      metadata.port = urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80')
      metadata.pathname = urlObj.pathname
    } catch { /* ignore parse errors */ }
    metadata.dns_lookup_ms = Date.now() - dnsStart

    // ── Phase 2: Fetch with redirect tracking ──
    const connectStart = Date.now()
    
    // First do a non-redirect fetch to capture redirect chain
    const redirectChain: string[] = [monitor.url]
    let finalResponse: Response
    
    try {
      const noRedirectResponse = await fetch(monitor.url, {
        method: monitor.method || 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'OpenUptime/1.0 (Uptime Monitor)',
          'Accept': 'text/html,application/json,*/*',
          'Accept-Encoding': 'gzip, deflate, br',
        },
        redirect: 'manual',
      })
      
      if (noRedirectResponse.status >= 300 && noRedirectResponse.status < 400) {
        const location = noRedirectResponse.headers.get('location')
        if (location) redirectChain.push(location)
        metadata.initial_status = noRedirectResponse.status
        metadata.redirect_target = location
      }
    } catch { /* swallow, we'll retry with follow */ }

    // Main fetch with redirect following
    finalResponse = await fetch(monitor.url, {
      method: monitor.method || 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'OpenUptime/1.0 (Uptime Monitor)',
        'Accept': 'text/html,application/json,*/*',
        'Accept-Encoding': 'gzip, deflate, br',
      },
      redirect: 'follow',
    })

    clearTimeout(timeoutId)

    const connectEnd = Date.now()
    statusCode = finalResponse.status
    responseTimeMs = connectEnd - startTime
    isUp = statusCode === (monitor.expected_status || 200)

    // ── Phase 3: Collect all headers ──
    const hdrs: Record<string, string> = {}
    finalResponse.headers.forEach((val, key) => { hdrs[key] = val })
    responseHeaders = hdrs

    // ── Phase 4: Extract rich metadata from headers ──
    metadata.connect_time_ms = connectEnd - connectStart
    metadata.server = hdrs['server'] || hdrs['x-powered-by'] || null
    metadata.content_type = hdrs['content-type'] || null
    metadata.content_encoding = hdrs['content-encoding'] || null
    metadata.cache_control = hdrs['cache-control'] || null
    metadata.x_cache = hdrs['x-cache'] || hdrs['cf-cache-status'] || null
    metadata.cdn_provider = detectCDN(hdrs)
    metadata.http_version = finalResponse.headers.get('alt-svc') ? 'HTTP/2+' : 'HTTP/1.1'
    
    // TLS / SSL info from URL
    metadata.is_https = monitor.url.startsWith('https')
    metadata.hsts = hdrs['strict-transport-security'] || null
    
    // Content Security
    metadata.csp = hdrs['content-security-policy'] ? 'Present' : 'Missing'
    metadata.x_frame_options = hdrs['x-frame-options'] || 'Missing'
    metadata.x_content_type_options = hdrs['x-content-type-options'] || 'Missing'
    
    // Redirect info
    metadata.redirected = finalResponse.redirected
    metadata.final_url = finalResponse.url
    metadata.redirect_chain = redirectChain
    metadata.redirect_count = redirectChain.length - 1
    
    // ── Phase 5: Read body (limited to 2KB for storage) ──
    const bodyStart = Date.now()
    let bodyPreview = ''
    let contentLength = 0
    try {
      const bodyText = await finalResponse.text()
      contentLength = bodyText.length
      bodyPreview = bodyText.substring(0, 2000)
      
      // Extract page title if HTML
      const titleMatch = bodyPreview.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
      metadata.page_title = titleMatch ? titleMatch[1].trim().substring(0, 200) : null
      
      // Detect technology markers
      metadata.technologies = detectTechnologies(bodyPreview, hdrs)
    } catch { /* body read failed */ }
    
    metadata.body_download_ms = Date.now() - bodyStart
    metadata.content_length = contentLength
    metadata.body_preview = bodyPreview.substring(0, 500) // Store first 500 chars

    // ── Phase 6: Performance classification ──
    if (responseTimeMs < 200) {
      metadata.performance_grade = 'A+'
    } else if (responseTimeMs < 500) {
      metadata.performance_grade = 'A'
    } else if (responseTimeMs < 1000) {
      metadata.performance_grade = 'B'
    } else if (responseTimeMs < 2000) {
      metadata.performance_grade = 'C'
    } else if (responseTimeMs < 5000) {
      metadata.performance_grade = 'D'
    } else {
      metadata.performance_grade = 'F'
    }

    // ── Phase 7: Build rich analysis ──
    if (!isUp) {
      if (statusCode >= 500) {
        analysis = `⛔ Sunucu ${statusCode} hatası döndürdü. Muhtemel sebepler:\n• Uygulama çökmesi veya exception\n• Veritabanı bağlantı hatası\n• Sunucu bellek/CPU aşımı\n• Arka plan servisi (worker) hatası\n${hdrs['server'] ? `\nSunucu: ${hdrs['server']}` : ''}`
      } else if (statusCode === 404) {
        analysis = `🔍 Sayfa bulunamadı (404). Muhtemel sebepler:\n• URL yanlış yazılmış olabilir\n• Sayfa kaldırılmış veya taşınmış olabilir\n• Yönlendirme kurallarında hata`
      } else if (statusCode === 403) {
        analysis = `🔒 Erişim engellendi (403). Muhtemel sebepler:\n• IP bazlı engelleme (WAF/Firewall)\n• Coğrafi kısıtlama (Geo-blocking)\n• Bot koruması (Cloudflare, Akamai vs.)\n• Yetkilendirme hatası`
      } else if (statusCode === 429) {
        analysis = `⏱️ Rate limit aşıldı (429). Muhtemel sebepler:\n• Çok sık istek gönderilmiş\n• API rate limit'e takılınmış\n• DDoS koruması devreye girmiş`
      } else if (statusCode >= 400) {
        analysis = `⚠️ İstemci hatası (${statusCode}). Beklenen: ${monitor.expected_status || 200}.`
      } else if (statusCode >= 300) {
        analysis = `↩️ Yönlendirme kodu (${statusCode}). Site başka bir URL'ye yönlendiriyor: ${metadata.redirect_target || 'bilinmiyor'}`
      } else {
        analysis = `❓ Beklenmeyen durum kodu (${statusCode}). Beklenen: ${monitor.expected_status || 200}.`
      }
    } else {
      const perfNote = responseTimeMs > 2000 
        ? `\n⚠️ Yanıt süresi yüksek (${responseTimeMs}ms). Performans optimizasyonu önerilir.`
        : responseTimeMs > 1000 
          ? `\nℹ️ Yanıt süresi kabul edilebilir seviyede ama iyileştirilebilir (${responseTimeMs}ms).`
          : ''
      const securityNote = !metadata.is_https 
        ? '\n🔓 Site HTTPS kullanmıyor. Güvenlik açısından HTTPS\'e geçiş önerilir.' 
        : ''
      const cacheNote = metadata.x_cache 
        ? `\n📦 CDN Cache: ${metadata.x_cache}` 
        : ''
      
      analysis = `✅ Sistem sorunsuz çalışıyor. Performans notu: ${metadata.performance_grade}${perfNote}${securityNote}${cacheNote}`
    }
  } catch (err: any) {
    responseTimeMs = Date.now() - startTime
    isUp = false
    metadata.performance_grade = 'F'

    if (err.name === 'AbortError') {
      errorMessage = 'Request timed out (10s)'
      analysis = `⏰ Sunucu 10 saniye içinde yanıt vermedi.\n\nMuhtemel sebepler:\n• Sunucu tamamen kapanmış olabilir\n• Ağ yolu tıkanmış olabilir\n• Firewall bağlantıyı engelliyor olabilir\n• Sunucu aşırı yük altında (CPU/RAM %100)\n• DNS çözümlemesi çok uzun sürmüş olabilir`
    } else {
      errorMessage = err.message || 'Connection failed'
      const errLower = errorMessage.toLowerCase()
      if (errLower.includes('fetch') || errLower.includes('dns') || errLower.includes('enotfound') || errLower.includes('getaddrinfo')) {
        analysis = `🌐 DNS çözümleme veya ağ bağlantısı başarısız.\n\nMuhtemel sebepler:\n• Alan adı (domain) süresi dolmuş olabilir\n• DNS kayıtları yanlış yapılandırılmış\n• Nameserver'lar yanıt vermiyor\n• Alan adı askıya alınmış olabilir\n\nKontrol edin: DNS propagation araçları ile alan adınızı sorgulayın.`
        metadata.error_category = 'DNS'
      } else if (errLower.includes('tls') || errLower.includes('ssl') || errLower.includes('cert')) {
        analysis = `🔐 SSL/TLS Sertifika hatası.\n\nMuhtemel sebepler:\n• SSL sertifikası süresi dolmuş\n• Sertifika alan adıyla eşleşmiyor (CN mismatch)\n• Kendinden imzalı (self-signed) sertifika\n• Sertifika zinciri eksik (intermediate CA)\n\nKontrol edin: SSL Labs (ssllabs.com) ile sertifikanızı test edin.`
        metadata.error_category = 'SSL/TLS'
      } else if (errLower.includes('econnrefused') || errLower.includes('connection refused')) {
        analysis = `🚫 Bağlantı reddedildi (Connection Refused).\n\nMuhtemel sebepler:\n• Web sunucusu (nginx/apache) çalışmıyor\n• Port kapalı veya yanlış\n• Firewall bağlantıyı engelliyor\n\nKontrol edin: Sunucuda web servisinin (nginx, apache, node) çalıştığından emin olun.`
        metadata.error_category = 'CONNECTION'
      } else if (errLower.includes('econnreset') || errLower.includes('connection reset')) {
        analysis = `🔄 Bağlantı sıfırlandı (Connection Reset).\n\nMuhtemel sebepler:\n• Sunucu bağlantıyı beklenmedik şekilde kapattı\n• Ağ cihazı (load balancer, proxy) bağlantıyı kesti\n• DDoS koruması devreye girdi`
        metadata.error_category = 'CONNECTION'
      } else {
        analysis = `❌ Bağlantı sırasında hata oluştu: ${errorMessage}`
        metadata.error_category = 'UNKNOWN'
      }
    }
  }

  // Insert check result with rich metadata
  await supabase.from('check_results').insert({
    monitor_id: monitor.id,
    status_code: statusCode,
    response_time_ms: responseTimeMs,
    is_up: isUp,
    error_message: errorMessage,
    response_headers: responseHeaders,
    analysis: analysis,
    metadata: metadata,
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

// ─── Helper: Detect CDN provider from headers ───
function detectCDN(headers: Record<string, string>): string | null {
  if (headers['cf-ray'] || headers['cf-cache-status']) return 'Cloudflare'
  if (headers['x-amz-cf-id'] || headers['x-amz-cf-pop']) return 'AWS CloudFront'
  if (headers['x-fastly-request-id']) return 'Fastly'
  if (headers['x-vercel-id']) return 'Vercel Edge'
  if (headers['x-netlify-request-id']) return 'Netlify'
  if (headers['x-azure-ref']) return 'Azure CDN'
  if (headers['x-served-by']?.includes('cache-')) return 'Fastly/Varnish'
  if (headers['server']?.toLowerCase().includes('cloudflare')) return 'Cloudflare'
  if (headers['server']?.toLowerCase().includes('nginx')) return 'Nginx (Self-hosted)'
  if (headers['server']?.toLowerCase().includes('apache')) return 'Apache (Self-hosted)'
  return null
}

// ─── Helper: Detect technologies from body and headers ───
function detectTechnologies(body: string, headers: Record<string, string>): string[] {
  const techs: string[] = []
  const bodyLower = body.toLowerCase()
  
  // Frameworks
  if (bodyLower.includes('__next') || bodyLower.includes('_next/static')) techs.push('Next.js')
  if (bodyLower.includes('__nuxt') || bodyLower.includes('nuxt')) techs.push('Nuxt.js')
  if (headers['x-powered-by']?.includes('Express')) techs.push('Express.js')
  if (headers['x-powered-by']?.includes('PHP')) techs.push('PHP')
  if (bodyLower.includes('wp-content') || bodyLower.includes('wordpress')) techs.push('WordPress')
  if (bodyLower.includes('react') || bodyLower.includes('reactdom')) techs.push('React')
  if (bodyLower.includes('vue.js') || bodyLower.includes('vue-')) techs.push('Vue.js')
  if (bodyLower.includes('angular') || bodyLower.includes('ng-')) techs.push('Angular')
  if (bodyLower.includes('gatsby')) techs.push('Gatsby')
  if (bodyLower.includes('svelte')) techs.push('Svelte')
  
  // Analytics
  if (bodyLower.includes('google-analytics') || bodyLower.includes('gtag')) techs.push('Google Analytics')
  if (bodyLower.includes('hotjar')) techs.push('Hotjar')
  
  // CDN / Hosting
  if (headers['server']?.toLowerCase().includes('vercel')) techs.push('Vercel')
  if (headers['server']?.toLowerCase().includes('netlify')) techs.push('Netlify')
  
  return [...new Set(techs)] // deduplicate
}
