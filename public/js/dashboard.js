// ══════════════════════════════════════════════
// OpenUptime — Dashboard Page
// ══════════════════════════════════════════════

const Dashboard = (() => {
  let refreshTimer = null;

  async function render() {
    // Stop any existing refresh timer
    if (refreshTimer) clearInterval(refreshTimer);

    const statsGrid = document.getElementById('stats-grid');
    const monitorsList = document.getElementById('monitors-list');
    const emptyState = document.getElementById('empty-state');

    // Show skeleton loading
    statsGrid.innerHTML = `
      <div class="skeleton skeleton-stat"></div>
      <div class="skeleton skeleton-stat"></div>
      <div class="skeleton skeleton-stat"></div>
      <div class="skeleton skeleton-stat"></div>
    `;
    monitorsList.innerHTML = `
      <div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card"></div>
      <div class="skeleton skeleton-card"></div>
    `;
    emptyState.style.display = 'none';

    // Fetch monitors
    const monitors = await Monitors.fetchAll();

    if (monitors.length === 0) {
      statsGrid.innerHTML = '';
      monitorsList.innerHTML = '';
      emptyState.style.display = 'block';
      lucide.createIcons();
      return;
    }

    emptyState.style.display = 'none';

    // Calculate stats
    const totalCount = monitors.length;
    const upCount = monitors.filter(m => m.is_up && m.is_active).length;
    const downCount = monitors.filter(m => !m.is_up && m.is_active).length;
    const pausedCount = monitors.filter(m => !m.is_active).length;

    // Render stats cards
    statsGrid.innerHTML = `
      <div class="stat-card glass-card">
        <div class="stat-info">
          <span class="stat-label">Total</span>
          <span class="stat-value">${totalCount}</span>
        </div>
        <div class="stat-icon total">
          <i data-lucide="monitor"></i>
        </div>
      </div>
      <div class="stat-card glass-card">
        <div class="stat-info">
          <span class="stat-label">Up</span>
          <span class="stat-value up">${upCount}</span>
        </div>
        <div class="stat-icon up">
          <i data-lucide="check-circle-2"></i>
        </div>
      </div>
      <div class="stat-card glass-card">
        <div class="stat-info">
          <span class="stat-label">Down</span>
          <span class="stat-value down">${downCount}</span>
        </div>
        <div class="stat-icon down">
          <i data-lucide="alert-circle"></i>
        </div>
      </div>
      <div class="stat-card glass-card">
        <div class="stat-info">
          <span class="stat-label">Paused</span>
          <span class="stat-value">${pausedCount}</span>
        </div>
        <div class="stat-icon speed">
          <i data-lucide="pause-circle"></i>
        </div>
      </div>
    `;

    // Render monitor cards
    const cardPromises = monitors.map(async (monitor) => {
      const uptime = await Monitors.getUptimePercentage(monitor.id, 24);
      const avgResponse = await Monitors.getAverageResponseTime(monitor.id, 24);
      return renderMonitorCard(monitor, uptime, avgResponse);
    });

    const cards = await Promise.all(cardPromises);
    monitorsList.innerHTML = cards.join('');

    // Re-initialize icons
    lucide.createIcons();

    // Add click handlers to cards
    document.querySelectorAll('.monitor-card[data-id]').forEach(card => {
      card.addEventListener('click', () => {
        Router.navigate('/monitor/' + card.dataset.id);
      });
    });

    // Auto-refresh
    refreshTimer = setInterval(() => {
      // Only refresh if dashboard is visible
      if (document.getElementById('page-dashboard').classList.contains('active')) {
        render();
      }
    }, APP_CONFIG.refreshInterval);
  }

  function renderMonitorCard(monitor, uptimePercent, avgResponseMs) {
    const statusClass = !monitor.is_active ? 'paused' :
                        monitor.is_up ? 'up' :
                        'down';

    const uptimeDisplay = uptimePercent !== null ? uptimePercent.toFixed(1) + '%' : '—';
    const uptimeClass = uptimePercent === null ? '' :
                        uptimePercent >= 99 ? 'good' :
                        uptimePercent >= 95 ? 'warn' : 'bad';

    const responseDisplay = avgResponseMs !== null ? avgResponseMs + ' ms' : '—';
    const lastChecked = monitor.last_checked_at
      ? App.formatRelativeTime(new Date(monitor.last_checked_at))
      : 'Never';

    return `
      <div class="monitor-card glass-card" data-id="${monitor.id}">
        <div class="status-dot ${statusClass}"></div>
        <div class="monitor-info">
          <div class="monitor-name">${App.escapeHtml(monitor.name)}</div>
          <div class="monitor-url">${App.truncateUrl(monitor.url, 50)}</div>
        </div>
        <div class="monitor-uptime">
          <div class="uptime-value ${uptimeClass}">${uptimeDisplay}</div>
          <div class="uptime-label">uptime 24h</div>
        </div>
        <div class="monitor-response">
          <div class="response-value">${responseDisplay}</div>
          <div class="response-label">avg response</div>
        </div>
        <div class="monitor-last-check">${lastChecked}</div>
      </div>
    `;
  }

  function destroy() {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  return { render, destroy };
})();
