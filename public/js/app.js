// ══════════════════════════════════════════════
// OpenUptime — Main Application
// ══════════════════════════════════════════════

const App = (() => {

  function init() {
    // Initialize Supabase & Auth
    Auth.init();

    // Bind event listeners
    bindEvents();

    // Initialize Lucide icons
    lucide.createIcons();
  }

  function bindEvents() {
    // Login Handlers
    const loginHandler = () => Auth.signInWithGoogle();
    ['google-login-btn', 'nav-login-btn', 'mobile-nav-login-btn', 'hero-get-started-btn', 'pricing-free-btn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', loginHandler);
    });

    // Playground / Demo Handlers
    const demoHandler = () => {
      if (typeof enterDemoMode === 'function') enterDemoMode();
    };
    ['demo-login-btn', 'hero-playground-btn', 'pricing-playground-btn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', (e) => {
        e.preventDefault();
        demoHandler();
      });
    });

    // Landing Mobile Menu Toggle
    const landingMenuBtn = document.getElementById('landing-mobile-menu');
    const landingMobileNav = document.getElementById('landing-mobile-nav');
    if (landingMenuBtn && landingMobileNav) {
      landingMenuBtn.addEventListener('click', () => {
        landingMobileNav.style.display = landingMobileNav.style.display === 'none' ? 'flex' : 'none';
      });
      landingMobileNav.querySelectorAll('a, button').forEach(el => {
        el.addEventListener('click', () => {
          landingMobileNav.style.display = 'none';
        });
      });
    }

    // Logo Click Routing
    const landingLogo = document.getElementById('landing-logo-link');
    if (landingLogo) {
      landingLogo.addEventListener('click', (e) => {
        e.preventDefault();
        if (Auth.getUser() || window.isDemoMode) {
          document.getElementById('login-page').style.display = 'none';
          document.getElementById('app').style.display = 'flex';
          Router.navigate('/dashboard');
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
    }

    // Logout
    document.getElementById('logout-btn').addEventListener('click', () => {
      Auth.signOut();
    });

    // Add Monitor buttons
    document.getElementById('add-monitor-btn').addEventListener('click', openCreateModal);
    document.getElementById('empty-add-btn').addEventListener('click', openCreateModal);

    // Monitor Modal
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('modal-cancel').addEventListener('click', closeModal);
    document.getElementById('monitor-form').addEventListener('submit', handleMonitorSubmit);

    // Monitor modal overlay click to close
    document.getElementById('monitor-modal').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeModal();
    });

    // Edit / Delete / Pause buttons on detail page
    document.getElementById('edit-monitor-btn').addEventListener('click', handleEditClick);
    document.getElementById('delete-monitor-btn').addEventListener('click', handleDeleteClick);
    document.getElementById('pause-monitor-btn').addEventListener('click', handlePauseClick);
    document.getElementById('back-btn').addEventListener('click', () => Router.navigate('/dashboard'));

    // Confirm dialog
    document.getElementById('confirm-cancel').addEventListener('click', closeConfirm);
    document.getElementById('confirm-dialog').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) closeConfirm();
    });

    // Settings form
    document.getElementById('notification-form').addEventListener('submit', Settings.save);

    // Mobile sidebar
    document.getElementById('mobile-menu-btn').addEventListener('click', () => {
      document.getElementById('sidebar').classList.add('open');
      document.getElementById('sidebar-overlay').classList.add('active');
    });
    document.getElementById('sidebar-overlay').addEventListener('click', () => {
      document.getElementById('sidebar').classList.remove('open');
      document.getElementById('sidebar-overlay').classList.remove('active');
    });

    // Side panel
    document.getElementById('side-panel-close')?.addEventListener('click', closeSidePanel);
    document.getElementById('side-panel-overlay')?.addEventListener('click', closeSidePanel);

    // Theme toggle
    document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    loadTheme();

    // Close modals on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal();
        closeConfirm();
      }
    });
  }

  // ─── Monitor Modal ───

  async function openCreateModal() {
    if (!window.isDemoMode) {
      const monitors = await Monitors.fetchAll();
      if (monitors.length >= 2) {
        showToast('Free tier is limited to 2 monitors. Upgrade to Pro to add more!', 'error');
        return;
      }
    }

    document.getElementById('modal-title').textContent = 'New Monitor';
    document.getElementById('modal-submit').innerHTML = '<i data-lucide="plus"></i> Create Monitor';
    document.getElementById('monitor-form').reset();
    document.getElementById('monitor-id').value = '';
    document.getElementById('monitor-expected-status').value = '200';
    document.getElementById('monitor-alert-threshold').value = '3';
    
    _applyIntervalLimits();
    
    document.getElementById('monitor-modal').style.display = 'flex';
    lucide.createIcons();
    document.getElementById('monitor-name').focus();
  }

  function openEditModal(monitor) {
    document.getElementById('modal-title').textContent = 'Edit Monitor';
    document.getElementById('modal-submit').innerHTML = '<i data-lucide="save"></i> Save Changes';
    document.getElementById('monitor-id').value = monitor.id;
    document.getElementById('monitor-name').value = monitor.name;
    document.getElementById('monitor-url').value = monitor.url;
    document.getElementById('monitor-method').value = monitor.method || 'GET';
    
    _applyIntervalLimits();
    
    document.getElementById('monitor-interval').value = monitor.interval_minutes || 5;
    
    // If they have a pro interval but are on free tier, switch it to 5 visually
    if (!window.isDemoMode && ['1', '15', '30'].includes(document.getElementById('monitor-interval').value)) {
      document.getElementById('monitor-interval').value = '5';
    }

    document.getElementById('monitor-expected-status').value = monitor.expected_status || 200;
    document.getElementById('monitor-alert-threshold').value = monitor.alert_threshold || 3;
    document.getElementById('monitor-modal').style.display = 'flex';
    lucide.createIcons();
    document.getElementById('monitor-name').focus();
  }

  function _applyIntervalLimits() {
    const select = document.getElementById('monitor-interval');
    Array.from(select.options).forEach(opt => {
      if (['1', '15', '30'].includes(opt.value)) {
        if (!window.isDemoMode) {
          opt.disabled = true;
          if (!opt.text.includes('(Pro)')) opt.text += ' (Pro)';
        } else {
          opt.disabled = false;
          opt.text = opt.text.replace(' (Pro)', '');
        }
      }
    });
  }

  function closeModal() {
    document.getElementById('monitor-modal').style.display = 'none';
  }

  async function handleMonitorSubmit(e) {
    e.preventDefault();

    const id = document.getElementById('monitor-id').value;
    const data = {
      name: document.getElementById('monitor-name').value.trim(),
      url: document.getElementById('monitor-url').value.trim(),
      method: document.getElementById('monitor-method').value,
      interval_minutes: parseInt(document.getElementById('monitor-interval').value),
      expected_status: parseInt(document.getElementById('monitor-expected-status').value),
      alert_threshold: parseInt(document.getElementById('monitor-alert-threshold').value),
    };

    if (!data.name || !data.url) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    // Validate URL
    try {
      new URL(data.url);
    } catch {
      showToast('Please enter a valid URL (e.g., https://example.com)', 'error');
      return;
    }

    let result;
    if (id) {
      result = await Monitors.update(id, data);
    } else {
      result = await Monitors.create(data);
    }

    if (result) {
      closeModal();
      // Refresh current page
      const currentParam = Router.getCurrentParam();
      if (currentParam) {
        MonitorDetail.render(currentParam);
      } else {
        Dashboard.render();
      }
    }
  }

  // ─── Detail Page Actions ───

  async function handleEditClick() {
    const monitorId = Router.getCurrentParam();
    if (!monitorId) return;
    const monitor = await Monitors.fetchById(monitorId);
    if (monitor) openEditModal(monitor);
  }

  async function handleDeleteClick() {
    const monitorId = Router.getCurrentParam();
    if (!monitorId) return;

    const confirmed = await showConfirm(
      'Delete Monitor',
      'This will permanently delete this monitor and all its check history. This cannot be undone.'
    );

    if (confirmed) {
      const success = await Monitors.remove(monitorId);
      if (success) Router.navigate('/dashboard');
    }
  }

  async function handlePauseClick() {
    const monitorId = Router.getCurrentParam();
    if (!monitorId) return;

    const monitor = await Monitors.fetchById(monitorId);
    if (!monitor) return;

    const success = await Monitors.toggleActive(monitorId, !monitor.is_active);
    if (success) MonitorDetail.render(monitorId);
  }

  // ─── Confirm Dialog ───

  let confirmResolve = null;

  function showConfirm(title, message) {
    return new Promise((resolve) => {
      confirmResolve = resolve;
      document.getElementById('confirm-title').textContent = title;
      document.getElementById('confirm-message').textContent = message;
      document.getElementById('confirm-dialog').style.display = 'flex';
      lucide.createIcons();

      document.getElementById('confirm-ok').onclick = () => {
        const resolveFn = confirmResolve;
        confirmResolve = null;
        document.getElementById('confirm-dialog').style.display = 'none';
        if (resolveFn) resolveFn(true);
      };
      
      const cancelBtn = document.getElementById('confirm-cancel');
      if (cancelBtn) {
        cancelBtn.onclick = closeConfirm;
      }
    });
  }

  function closeConfirm() {
    document.getElementById('confirm-dialog').style.display = 'none';
    if (confirmResolve) {
      confirmResolve(false);
      confirmResolve = null;
    }
  }

  // ─── Side Panel ───
  function openSidePanel(data) {
    const meta = data.metadata || {};

    // ── Status Badge ──
    const badgeEl = document.getElementById('sp-status-badge');
    if (data.isUp === false) {
      badgeEl.innerHTML = '<span style="display:inline-block;width:10px;height:10px;background:var(--status-down);border-radius:50%;"></span> Down';
      badgeEl.style.background = 'rgba(239,68,68,0.15)';
      badgeEl.style.color = 'var(--status-down)';
    } else if (data.isUp === true) {
      badgeEl.innerHTML = '<span style="display:inline-block;width:10px;height:10px;background:var(--status-up);border-radius:50%;"></span> Operational';
      badgeEl.style.background = 'rgba(16,185,129,0.15)';
      badgeEl.style.color = 'var(--status-up)';
    } else {
      badgeEl.innerHTML = '—';
      badgeEl.style.background = 'var(--bg-input)';
      badgeEl.style.color = 'var(--text-muted)';
    }

    // Performance grade
    const gradeEl = document.getElementById('sp-perf-grade');
    if (meta.performance_grade) {
      const gradeColors = { 'A+': '#10b981', 'A': '#10b981', 'B': '#f59e0b', 'C': '#f97316', 'D': '#ef4444', 'F': '#dc2626' };
      gradeEl.innerHTML = `Performance Grade: <span style="color:${gradeColors[meta.performance_grade] || 'var(--text-muted)'}; font-weight:700;">${meta.performance_grade}</span>`;
    } else {
      gradeEl.textContent = '';
    }

    // ── Key Metrics ──
    document.getElementById('sp-ping').textContent = data.ping || '--';
    document.getElementById('sp-status-code').textContent = data.statusCode || '--';
    document.getElementById('sp-time').textContent = data.time || '--';

    // ── Tab switching ──
    document.querySelectorAll('.sp-tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.sp-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.sp-tab-content').forEach(c => { c.style.display = 'none'; c.classList.remove('active'); });
        tab.classList.add('active');
        const target = document.getElementById('sp-tab-' + tab.dataset.tab);
        if (target) { target.style.display = 'block'; target.classList.add('active'); }
      };
    });
    // Reset to overview tab
    document.querySelectorAll('.sp-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sp-tab-content').forEach(c => { c.style.display = 'none'; c.classList.remove('active'); });
    document.querySelector('.sp-tab[data-tab="overview"]').classList.add('active');
    document.getElementById('sp-tab-overview').style.display = 'block';

    // ── Overview Tab ──
    document.getElementById('sp-analysis').textContent = data.analysis || 'No detailed analysis available.';

    // Error
    if (data.error) {
      document.getElementById('sp-error-container').style.display = 'flex';
      document.getElementById('sp-error').textContent = data.error;
    } else {
      document.getElementById('sp-error-container').style.display = 'none';
    }

    // Redirect chain
    const redirectContainer = document.getElementById('sp-redirect-container');
    if (meta.redirect_chain && meta.redirect_chain.length > 1) {
      redirectContainer.style.display = 'flex';
      document.getElementById('sp-redirect-chain').textContent = meta.redirect_chain.map((url, i) => `${i + 1}. ${url}`).join('\n');
    } else {
      redirectContainer.style.display = 'none';
    }

    // Page title
    const pageTitleContainer = document.getElementById('sp-page-title-container');
    if (meta.page_title) {
      pageTitleContainer.style.display = 'flex';
      document.getElementById('sp-page-title').textContent = meta.page_title;
    } else {
      pageTitleContainer.style.display = 'none';
    }

    // Technologies
    const techsContainer = document.getElementById('sp-techs-container');
    if (meta.technologies && meta.technologies.length > 0) {
      techsContainer.style.display = 'flex';
      document.getElementById('sp-techs').innerHTML = meta.technologies.map(t =>
        `<span style="padding:3px 10px; background:var(--bg-tertiary); border:1px solid var(--border); border-radius:12px; font-size:0.72rem; color:var(--text-secondary);">${escapeHtml(t)}</span>`
      ).join('');
    } else {
      techsContainer.style.display = 'none';
    }

    // ── Timing Tab ──
    const totalMs = data.rawPing || parseInt(data.ping) || 0;
    const connectMs = meta.connect_time_ms || 0;
    const downloadMs = meta.body_download_ms || 0;
    const dnsMs = meta.dns_lookup_ms || 0;

    document.getElementById('sp-connect-time').textContent = connectMs ? connectMs + ' ms' : '--';
    document.getElementById('sp-download-time').textContent = downloadMs ? downloadMs + ' ms' : '--';
    document.getElementById('sp-dns-time').textContent = dnsMs ? dnsMs + ' ms' : '--';

    const contentLen = meta.content_length;
    if (contentLen) {
      const kb = (contentLen / 1024).toFixed(1);
      document.getElementById('sp-content-size').textContent = contentLen > 1024 ? kb + ' KB' : contentLen + ' B';
    } else {
      document.getElementById('sp-content-size').textContent = '--';
    }

    // Timing bars
    const timingBarsEl = document.getElementById('sp-timing-bars');
    if (totalMs > 0) {
      const phases = [
        { label: 'DNS', ms: dnsMs, color: '#6366f1' },
        { label: 'Connect', ms: connectMs - dnsMs - downloadMs, color: '#f59e0b' },
        { label: 'Download', ms: downloadMs, color: '#10b981' },
      ].filter(p => p.ms > 0);
      const barsHtml = phases.map(p => {
        const pct = Math.max(5, (p.ms / totalMs) * 100);
        return `<div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
          <span style="width:60px; font-size:0.72rem; color:var(--text-muted);">${p.label}</span>
          <div style="flex:1; height:8px; background:var(--bg-tertiary); border-radius:4px; overflow:hidden;">
            <div style="width:${pct}%; height:100%; background:${p.color}; border-radius:4px; transition:width 0.5s;"></div>
          </div>
          <span style="width:50px; font-size:0.72rem; text-align:right;">${p.ms}ms</span>
        </div>`;
      }).join('');
      timingBarsEl.innerHTML = barsHtml || '<span class="text-muted" style="font-size:0.78rem;">No timing data</span>';
    } else {
      timingBarsEl.innerHTML = '<span class="text-muted" style="font-size:0.78rem;">No timing data available</span>';
    }

    // ── Security Tab ──
    const securityBadge = (val, good) => {
      if (!val || val === 'Missing') return '<span style="color:var(--status-down);">✗ Missing</span>';
      if (val === 'Present' || good) return `<span style="color:var(--status-up);">✓ ${val}</span>`;
      return val;
    };
    document.getElementById('sp-https').innerHTML = meta.is_https
      ? '<span style="color:var(--status-up);">✓ Enabled</span>'
      : '<span style="color:var(--status-down);">✗ Not Secure</span>';
    document.getElementById('sp-hsts').innerHTML = securityBadge(meta.hsts, true);
    document.getElementById('sp-csp').innerHTML = securityBadge(meta.csp, meta.csp === 'Present');
    document.getElementById('sp-xfo').innerHTML = securityBadge(meta.x_frame_options, meta.x_frame_options !== 'Missing');
    document.getElementById('sp-xcto').innerHTML = securityBadge(meta.x_content_type_options, meta.x_content_type_options !== 'Missing');

    // ── Infrastructure Tab ──
    document.getElementById('sp-server').textContent = meta.server || 'Unknown';
    document.getElementById('sp-cdn').textContent = meta.cdn_provider || 'None detected';
    document.getElementById('sp-cache').textContent = meta.x_cache || meta.cache_control || 'No cache info';
    document.getElementById('sp-content-type').textContent = meta.content_type ? meta.content_type.split(';')[0] : '--';
    document.getElementById('sp-encoding').textContent = meta.content_encoding || 'None';
    document.getElementById('sp-http-ver').textContent = meta.http_version || '--';

    // ── Raw Tab ──
    if (data.headers && Object.keys(data.headers).length > 0) {
      document.getElementById('sp-headers-container').style.display = 'flex';
      document.getElementById('sp-headers').textContent = JSON.stringify(data.headers, null, 2);
    } else {
      document.getElementById('sp-headers-container').style.display = 'none';
    }

    if (meta.body_preview) {
      document.getElementById('sp-body-container').style.display = 'flex';
      document.getElementById('sp-body-preview').textContent = meta.body_preview;
    } else {
      document.getElementById('sp-body-container').style.display = 'none';
    }

    if (meta && Object.keys(meta).length > 0) {
      document.getElementById('sp-metadata-container').style.display = 'flex';
      // Remove body_preview from display since it has its own section
      const displayMeta = { ...meta };
      delete displayMeta.body_preview;
      document.getElementById('sp-metadata-raw').textContent = JSON.stringify(displayMeta, null, 2);
    } else {
      document.getElementById('sp-metadata-container').style.display = 'none';
    }

    // ── Show panel ──
    document.getElementById('side-panel-overlay').style.display = 'block';
    setTimeout(() => {
      document.getElementById('side-panel').classList.add('open');
    }, 10);
    lucide.createIcons();
  }

  function closeSidePanel() {
    document.getElementById('side-panel').classList.remove('open');
    setTimeout(() => {
      document.getElementById('side-panel-overlay').style.display = 'none';
    }, 300); // Wait for transition
  }

  // ─── Toast Notifications ───

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const iconMap = {
      success: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
      error: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      info: '<svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
    };

    toast.innerHTML = `${iconMap[type] || iconMap.info}<span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);

    // Auto remove after 4 seconds
    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  // ─── Theme Toggle ───

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('openuptime-theme', next);
    updateThemeIcon(next);
  }

  function loadTheme() {
    const saved = localStorage.getItem('openuptime-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    updateThemeIcon(saved);
  }

  function updateThemeIcon(theme) {
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.innerHTML = theme === 'light'
        ? '<i data-lucide="sun"></i>'
        : '<i data-lucide="moon"></i>';
      lucide.createIcons();
    }
  }

  // ─── Utility Functions ───

  function formatRelativeTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }

  function truncateUrl(url, maxLength = 40) {
    try {
      const u = new URL(url);
      let display = u.hostname + u.pathname;
      if (display.endsWith('/')) display = display.slice(0, -1);
      if (display.length > maxLength) {
        return display.substring(0, maxLength) + '…';
      }
      return display;
    } catch {
      return url.length > maxLength ? url.substring(0, maxLength) + '…' : url;
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return {
    init,
    showToast,
    showConfirm,
    formatRelativeTime,
    truncateUrl,
    escapeHtml,
    openSidePanel,
    closeSidePanel
  };
})();

// ─── Bootstrap ───
document.addEventListener('DOMContentLoaded', App.init);
