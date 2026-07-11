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
    // Google Login
    document.getElementById('google-login-btn').addEventListener('click', () => {
      Auth.signInWithGoogle();
    });

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

    // Close modals on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal();
        closeConfirm();
      }
    });
  }

  // ─── Monitor Modal ───

  function openCreateModal() {
    document.getElementById('modal-title').textContent = 'New Monitor';
    document.getElementById('modal-submit').innerHTML = '<i data-lucide="plus"></i> Create Monitor';
    document.getElementById('monitor-form').reset();
    document.getElementById('monitor-id').value = '';
    document.getElementById('monitor-expected-status').value = '200';
    document.getElementById('monitor-alert-threshold').value = '3';
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
    document.getElementById('monitor-interval').value = monitor.interval_minutes || 5;
    document.getElementById('monitor-expected-status').value = monitor.expected_status || 200;
    document.getElementById('monitor-alert-threshold').value = monitor.alert_threshold || 3;
    document.getElementById('monitor-modal').style.display = 'flex';
    lucide.createIcons();
    document.getElementById('monitor-name').focus();
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
        closeConfirm();
        resolve(true);
      };
    });
  }

  function closeConfirm() {
    document.getElementById('confirm-dialog').style.display = 'none';
    if (confirmResolve) {
      confirmResolve(false);
      confirmResolve = null;
    }
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
  };
})();

// ─── Bootstrap ───
document.addEventListener('DOMContentLoaded', App.init);
