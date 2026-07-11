// ══════════════════════════════════════════════
// OpenUptime — Monitor Detail Page
// ══════════════════════════════════════════════

const MonitorDetail = (() => {
  let currentMonitorId = null;
  let responseChart = null;
  let allChecks = [];
  let currentMonitorInterval = 5;

  let paginationState = {
    checks: [],
    currentPage: 1,
    itemsPerPage: 20
  };

  async function render(monitorId) {
    currentMonitorId = monitorId;
    const container = document.getElementById('monitor-detail-content');

    // Loading state
    container.innerHTML = `
      <div class="skeleton skeleton-card" style="height:120px;margin-bottom:20px"></div>
      <div class="stats-grid">
        <div class="skeleton skeleton-stat"></div>
        <div class="skeleton skeleton-stat"></div>
        <div class="skeleton skeleton-stat"></div>
        <div class="skeleton skeleton-stat"></div>
      </div>
      <div class="skeleton skeleton-card" style="height:280px;margin-top:20px"></div>
    `;

    const monitor = await Monitors.fetchById(monitorId);
    if (!monitor) {
      container.innerHTML = '<p class="text-muted">Monitor not found.</p>';
      return;
    }

    // Fetch data in parallel (increase checks limit for bucket aggregation)
    const [uptime24h, uptime7d, uptime30d, avgResponse, checks, incidents, dailyUptime] =
      await Promise.all([
        Monitors.getUptimePercentage(monitorId, 24),
        Monitors.getUptimePercentage(monitorId, 24 * 7),
        Monitors.getUptimePercentage(monitorId, 24 * 30),
        Monitors.getAverageResponseTime(monitorId, 24),
        Monitors.fetchCheckResults(monitorId, 300), // Get up to 300 checks for aggregations
        Monitors.fetchIncidents(monitorId, 10),
        Monitors.getDailyUptimeForDays(monitorId, 30),
      ]);

    allChecks = checks;
    currentMonitorInterval = monitor.interval_minutes;

    const statusClass = !monitor.is_active ? 'paused' : monitor.is_up ? 'up' : 'down';
    const statusLabel = !monitor.is_active ? 'Paused' : monitor.is_up ? 'Up' : 'Down';
    const badgeClass = !monitor.is_active ? 'badge-paused' : monitor.is_up ? 'badge-up' : 'badge-down';

    // Update pause button
    const pauseBtn = document.getElementById('pause-monitor-btn');
    if (monitor.is_active) {
      pauseBtn.innerHTML = '<i data-lucide="pause"></i><span>Pause</span>';
    } else {
      pauseBtn.innerHTML = '<i data-lucide="play"></i><span>Resume</span>';
    }

    const formatUptime = (val) => val !== null ? val.toFixed(2) + '%' : '—';
    const uptimeClass = (val) => val === null ? '' : val >= 99 ? 'up' : val >= 95 ? '' : 'down';

    container.innerHTML = `
      <!-- Header -->
      <div class="detail-header">
        <div class="detail-status-dot ${statusClass}"></div>
        <div>
          <div class="detail-title">${App.escapeHtml(monitor.name)}</div>
          <div class="detail-url">
            <a href="${App.escapeHtml(monitor.url)}" target="_blank" rel="noopener">${App.escapeHtml(monitor.url)}</a>
          </div>
          <div class="detail-badge">
            <span class="badge ${badgeClass}">${statusLabel}</span>
            <span class="badge badge-info">${monitor.method} · Every ${monitor.interval_minutes} min</span>
            <span class="badge badge-info">Alert after ${monitor.alert_threshold} failures</span>
          </div>
        </div>
      </div>

      <!-- Stats -->
      <!-- Stats -->
      <div class="detail-stats">
        <div class="stat-card glass-card">
          <div class="stat-info">
            <span class="stat-label">Uptime 24h</span>
            <span class="stat-value ${uptimeClass(uptime24h)}">${formatUptime(uptime24h)}</span>
          </div>
        </div>
        <div class="stat-card glass-card">
          <div class="stat-info">
            <span class="stat-label">Uptime 30d</span>
            <span class="stat-value ${uptimeClass(uptime30d)}">${formatUptime(uptime30d)}</span>
          </div>
        </div>
        <div class="stat-card glass-card">
          <div class="stat-info">
            <span class="stat-label">Avg Response</span>
            <span class="stat-value">${avgResponse !== null ? avgResponse + ' ms' : '—'}</span>
          </div>
        </div>
      </div>

      <!-- Recent Performance Bar -->
      <div class="uptime-bar-section">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="margin: 0;">Recent Performance</h3>
          <select id="perf-granularity" class="select" style="padding: 4px 8px; font-size: 0.8rem; background: var(--bg-card); width: auto; height: 30px;">
            <option value="auto">Auto (${monitor.interval_minutes}m)</option>
            <option value="1">1 Min</option>
            <option value="5">5 Min</option>
            <option value="15">15 Min</option>
            <option value="30">30 Min</option>
          </select>
        </div>
        <div class="recent-perf-bar" id="recent-perf-bar">
          ${renderRecentPerfBar(checks, monitor.interval_minutes, 'auto')}
        </div>
        <div class="uptime-bar-labels">
          <span id="perf-label-old">Older</span>
          <span>Just now</span>
        </div>
      </div>

      <!-- Uptime Bar -->
      <div class="uptime-bar-section">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="margin: 0;">Uptime History</h3>
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="number" id="uptime-custom-days" class="input" style="display:none; width: 70px; height: 30px; padding: 4px 8px; font-size: 0.8rem;" min="1" max="60" value="45">
            <select id="uptime-days-select" class="select" style="padding: 4px 8px; font-size: 0.8rem; background: var(--bg-card); width: auto; height: 30px;">
              <option value="1">Last 1 Day</option>
              <option value="7">Last 7 Days</option>
              <option value="15">Last 15 Days</option>
              <option value="30" selected>Last 30 Days</option>
              <option value="-1">Custom (max 60)</option>
            </select>
          </div>
        </div>
        <div class="uptime-bar" id="uptime-bar-container">
          ${renderUptimeBar(dailyUptime)}
        </div>
        <div class="uptime-bar-labels">
          <span id="uptime-label-start">30 days ago</span>
          <span>Today</span>
        </div>
      </div>

      <!-- Response Time Chart -->
      <div class="chart-section">
        <h3>Response Time (Last 24h)</h3>
        <div class="chart-container">
          <canvas id="response-chart"></canvas>
        </div>
      </div>

      <!-- Incidents -->
      <div class="incidents-section">
        <h3>Incidents</h3>
        ${incidents.length > 0 ? incidents.map(inc => `
          <div class="incident-card glass-card">
            <div class="incident-header">
              <span class="incident-time">
                <span class="badge ${inc.is_resolved ? 'badge-resolved' : 'badge-ongoing'}">
                  ${inc.is_resolved ? 'Resolved' : 'Ongoing'}
                </span>
              </span>
              <span class="incident-duration">${formatIncidentDuration(inc)}</span>
            </div>
            <div class="incident-cause">${App.escapeHtml(inc.cause || 'No response from server')}</div>
            <div class="incident-cause" style="margin-top:4px;font-size:0.75rem">
              Started: ${new Date(inc.started_at).toLocaleString()}
              ${inc.resolved_at ? ' · Resolved: ' + new Date(inc.resolved_at).toLocaleString() : ''}
            </div>
          </div>
        `).join('') : '<p class="text-muted">No incidents recorded. 🎉</p>'}
      </div>

      <!-- Recent Checks (Moved to bottom) -->
      <div class="checks-section" style="margin-top: 32px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
          <h3 style="margin: 0;">Recent Checks</h3>
          <div style="display: flex; align-items: center; gap: 8px;">
            <label for="checks-per-page" style="font-size:0.85rem; color:var(--text-muted)">Show:</label>
            <select id="checks-per-page" class="select" style="padding: 4px 8px; font-size: 0.85rem; background: var(--bg-card); width: auto; height: 32px;">
              <option value="20">20 rows</option>
              <option value="50">50 rows</option>
            </select>
          </div>
        </div>
        <div class="table-wrapper">
          <table class="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Status Code</th>
                <th>Response Time</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="recent-checks-tbody">
              <!-- Rendered via JS pagination -->
            </tbody>
          </table>
        </div>
        <div class="pagination-controls" style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px;">
          <button id="prev-page-btn" class="btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" disabled>Previous</button>
          <span id="page-info" style="font-size: 0.85rem; color: var(--text-muted);">Page 1 of 1</span>
          <button id="next-page-btn" class="btn-secondary" style="padding: 6px 12px; font-size: 0.8rem;" disabled>Next</button>
        </div>
      </div>
    `;

    lucide.createIcons();

    // Bind granularity change
    document.getElementById('perf-granularity').addEventListener('change', (e) => {
      const val = e.target.value;
      document.getElementById('recent-perf-bar').innerHTML = renderRecentPerfBar(allChecks, currentMonitorInterval, val);
      
      let mins = val === 'auto' ? currentMonitorInterval : parseInt(val);
      let totalMins = mins * 60;
      let label = totalMins >= 60 ? Math.round(totalMins/60) + ' hours ago' : totalMins + ' mins ago';
      document.getElementById('perf-label-old').textContent = label;
    });

    // Render chart
    renderResponseChart(checks);

    // Bind Uptime History Dropdown
    document.getElementById('uptime-days-select').addEventListener('change', async (e) => {
      let days = parseInt(e.target.value);
      const customInput = document.getElementById('uptime-custom-days');
      if (days === -1) {
        customInput.style.display = 'inline-block';
        days = parseInt(customInput.value) || 30;
        if (days > 60) {
          days = 60;
          customInput.value = 60;
        }
      } else {
        customInput.style.display = 'none';
      }
      
      const newDailyUptime = await Monitors.getDailyUptimeForDays(currentMonitorId, days);
      document.getElementById('uptime-bar-container').innerHTML = renderUptimeBar(newDailyUptime);
      
      if (days === 1) {
        document.getElementById('uptime-label-start').textContent = '24 hours ago';
      } else {
        document.getElementById('uptime-label-start').textContent = days + ' days ago';
      }
    });

    document.getElementById('uptime-custom-days').addEventListener('change', async (e) => {
      let days = parseInt(e.target.value) || 30;
      if (days > 60) {
        days = 60;
        e.target.value = 60;
      }
      if (days < 1) {
        days = 1;
        e.target.value = 1;
      }
      const newDailyUptime = await Monitors.getDailyUptimeForDays(currentMonitorId, days);
      document.getElementById('uptime-bar-container').innerHTML = renderUptimeBar(newDailyUptime);
      document.getElementById('uptime-label-start').textContent = days + ' days ago';
    });

    // Initialize Pagination
    paginationState.checks = checks;
    paginationState.currentPage = 1;
    paginationState.itemsPerPage = 20;
    
    document.getElementById('checks-per-page').addEventListener('change', (e) => {
      paginationState.itemsPerPage = parseInt(e.target.value);
      paginationState.currentPage = 1;
      updatePaginationUI();
    });

    document.getElementById('prev-page-btn').addEventListener('click', () => {
      if (paginationState.currentPage > 1) {
        paginationState.currentPage--;
        updatePaginationUI();
      }
    });

    document.getElementById('next-page-btn').addEventListener('click', () => {
      const totalPages = Math.ceil(paginationState.checks.length / paginationState.itemsPerPage);
      if (paginationState.currentPage < totalPages) {
        paginationState.currentPage++;
        updatePaginationUI();
      }
    });

    updatePaginationUI();
  }

  function updatePaginationUI() {
    const start = (paginationState.currentPage - 1) * paginationState.itemsPerPage;
    const end = start + paginationState.itemsPerPage;
    const pageChecks = paginationState.checks.slice(start, end);
    const totalPages = Math.ceil(paginationState.checks.length / paginationState.itemsPerPage) || 1;

    const tbody = document.getElementById('recent-checks-tbody');
    if (pageChecks.length > 0) {
      tbody.innerHTML = pageChecks.map(c => {
        const panelData = JSON.stringify({
          time: new Date(c.checked_at).toLocaleString(),
          status: c.is_up ? 'Operational' : 'Down',
          isUp: c.is_up,
          ping: c.response_time_ms ? c.response_time_ms + ' ms' : '--',
          error: c.error_message || null,
          headers: c.response_headers || null,
          analysis: c.analysis || null
        }).replace(/'/g, "&#39;");

        return `
          <tr style="cursor:pointer;" onclick='App.openSidePanel(${panelData})'>
            <td>${App.formatRelativeTime(new Date(c.checked_at))}</td>
            <td>${c.status_code || '—'}</td>
            <td>${c.response_time_ms ? c.response_time_ms + ' ms' : '—'}</td>
            <td><span class="badge ${c.is_up ? 'badge-up' : 'badge-down'}">${c.is_up ? 'Up' : 'Down'}</span></td>
          </tr>
        `;
      }).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="4" class="text-muted" style="text-align:center;padding:24px">No check results yet</td></tr>';
    }

    document.getElementById('page-info').textContent = `Page ${paginationState.currentPage} of ${totalPages}`;
    document.getElementById('prev-page-btn').disabled = paginationState.currentPage <= 1;
    document.getElementById('next-page-btn').disabled = paginationState.currentPage >= totalPages;
  }

  function renderUptimeBar(dailyUptime) {
    if (!dailyUptime || dailyUptime.length === 0) {
      return '<p class="text-muted">No uptime data available yet.</p>';
    }

    return dailyUptime.map(day => {
      let colorClass = 'bg-gray';
      if (day.uptime !== null) {
        if (day.uptime >= 99) colorClass = 'bg-green';
        else if (day.uptime >= 95) colorClass = 'bg-yellow';
        else colorClass = 'bg-red';
      }
      
      const tooltipHTML = `${day.date}<br/><b>${day.uptime !== null ? day.uptime.toFixed(2) + '%' : 'No data'}</b>`;
      const panelData = JSON.stringify({
        time: day.date,
        status: day.uptime !== null ? 'Aggregated Uptime' : 'No Data',
        isUp: day.uptime === null ? null : day.uptime >= 99,
        ping: day.uptime !== null ? day.uptime.toFixed(2) + '%' : '--',
        analysis: day.uptime !== null 
          ? `Bu günkü sistem ayakta kalma süresi (uptime) %${day.uptime.toFixed(2)}. ${day.uptime >= 99 ? 'Sistem mükemmel çalışmış.' : 'Sistemde bazı kesintiler yaşanmış.'}`
          : 'Veri bulunmuyor.'
      }).replace(/'/g, "&#39;");

      return `<div class="uptime-day ${colorClass} tooltip-container" style="cursor:pointer;" onclick='App.openSidePanel(${panelData})'><div class="tooltip" style="text-align:center;width:max-content;padding:6px 10px">${tooltipHTML}</div></div>`;
    }).join('');
  }

  function renderRecentPerfBar(checks, monitorInterval, granularityVal) {
    if (!checks || checks.length === 0) {
      return '<p class="text-muted">No recent checks available.</p>';
    }
    
    let bucketMins = monitorInterval;
    if (granularityVal !== 'auto') {
      bucketMins = parseInt(granularityVal);
    }

    // Sort ascending for bucketing
    const sorted = [...checks].sort((a,b) => new Date(a.checked_at) - new Date(b.checked_at));
    const latestTime = new Date(sorted[sorted.length-1].checked_at).getTime();
    
    const buckets = [];
    const numBuckets = 60;
    const bucketMs = bucketMins * 60 * 1000;
    
    for(let i = numBuckets - 1; i >= 0; i--) {
      const endTime = latestTime - (i * bucketMs);
      const startTime = endTime - bucketMs;
      
      const bucketChecks = sorted.filter(c => {
        const t = new Date(c.checked_at).getTime();
        return t > startTime && t <= endTime;
      });
      
      if (bucketChecks.length > 0) {
        const isUp = bucketChecks.every(c => c.is_up); // if any is down, bucket is down
        const upChecks = bucketChecks.filter(c => c.is_up);
        const avgMs = upChecks.length > 0 
          ? Math.round(upChecks.reduce((sum, c) => sum + c.response_time_ms, 0) / upChecks.length)
          : null;
        
        buckets.push({
          checked_at: new Date(endTime).toISOString(),
          is_up: isUp,
          response_time_ms: avgMs,
          has_data: true,
          error_message: bucketChecks.map(c => c.error_message).filter(Boolean).join(' | '),
          response_headers: bucketChecks[0]?.response_headers || null,
          analysis: bucketChecks[0]?.analysis || null
        });
      } else {
        buckets.push({
          checked_at: new Date(endTime).toISOString(),
          is_up: null,
          response_time_ms: null,
          has_data: false,
          error_message: null,
          response_headers: null,
          analysis: null
        });
      }
    }
    
    // Store globally for click handlers
    window.perfBuckets = buckets;

    return buckets.map((c, index) => {
      if (!c.has_data) {
        return `<div class="perf-tick bg-gray tooltip-container" onclick='App.openSidePanel({time:"${new Date(c.checked_at).toLocaleString()}", status:"No Data"})'><div class="tooltip" style="text-align:center;width:max-content;padding:6px 10px">No data</div></div>`;
      }
      
      let colorClass = 'perf-green';
      let ms = c.response_time_ms;
      if (!c.is_up) {
        colorClass = 'perf-red';
      } else if (ms > 800) {
        colorClass = 'perf-orange';
      } else if (ms > 400) {
        colorClass = 'perf-yellow';
      }
      
      const timeStr = new Date(c.checked_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      const fullTimeStr = new Date(c.checked_at).toLocaleString();
      let titleVal = c.is_up ? ms + ' ms avg' : 'Down';
      
      const panelData = JSON.stringify({
        time: fullTimeStr,
        status: c.is_up ? 'Operational' : 'Down',
        isUp: c.is_up,
        ping: ms ? ms + ' ms' : '--',
        error: c.error_message || null,
        headers: c.response_headers || null,
        analysis: c.analysis || null
      }).replace(/'/g, "&#39;");

      return `<div class="perf-tick ${colorClass} tooltip-container" style="cursor:pointer;" onclick='App.openSidePanel(${panelData})'><div class="tooltip" style="text-align:center;width:max-content;padding:6px 10px">${timeStr}<br/><b>${titleVal}</b></div></div>`;
    }).join('');
  }

  function renderResponseChart(checks) {
    // Destroy previous chart
    if (responseChart) {
      responseChart.destroy();
      responseChart = null;
    }

    const canvas = document.getElementById('response-chart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');

    // Filter to last 24h and only successful checks
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const chartData = checks
      .filter(c => c.is_up && c.response_time_ms && new Date(c.checked_at).getTime() > dayAgo)
      .reverse(); // oldest first

    if (chartData.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '14px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('No data available', canvas.width / 2, canvas.height / 2);
      return;
    }

    const gradient = ctx.createLinearGradient(0, 0, 0, 280);
    gradient.addColorStop(0, 'rgba(16, 185, 129, 0.2)');
    gradient.addColorStop(1, 'rgba(16, 185, 129, 0)');

    responseChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: chartData.map(c => new Date(c.checked_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
        datasets: [{
          label: 'Response Time (ms)',
          data: chartData.map(c => c.response_time_ms),
          borderColor: '#10b981',
          backgroundColor: gradient,
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: '#10b981',
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          intersect: false,
          mode: 'index',
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1e1e2e',
            titleColor: '#f1f5f9',
            bodyColor: '#94a3b8',
            borderColor: 'rgba(255,255,255,0.1)',
            borderWidth: 1,
            padding: 12,
            cornerRadius: 8,
            displayColors: false,
            callbacks: {
              label: (ctx) => `${ctx.parsed.y} ms`,
            },
          },
        },
        scales: {
          x: {
            grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
            ticks: {
              color: '#64748b',
              font: { size: 11 },
              maxTicksLimit: 8,
            },
          },
          y: {
            grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
            ticks: {
              color: '#64748b',
              font: { size: 11 },
              callback: (v) => v + ' ms',
            },
            beginAtZero: true,
          },
        },
      },
    });
  }

  function formatIncidentDuration(incident) {
    const start = new Date(incident.started_at);
    const end = incident.resolved_at ? new Date(incident.resolved_at) : new Date();
    const diffMs = end - start;
    const minutes = Math.floor(diffMs / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  }

  return { render };
})();
