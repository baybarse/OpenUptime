// ══════════════════════════════════════════════
// OpenUptime — Pro Playground
// ══════════════════════════════════════════════

window.isDemoMode = false;

document.addEventListener('DOMContentLoaded', () => {
  const demoBtn = document.getElementById('demo-login-btn');
  if (demoBtn) {
    demoBtn.addEventListener('click', enterDemoMode);
  }
});

function enterDemoMode() {
  window.isDemoMode = true;

  // Mock the User
  Auth.getUser = () => ({
    id: 'demo-user-123',
    email: 'demo@example.com',
    user_metadata: {
      full_name: 'Demo User',
      avatar_url: 'https://ui-avatars.com/api/?name=Demo+User&background=6366f1&color=fff'
    }
  });

  // Override Monitors methods
  Monitors.fetchAll = async () => mockMonitors;

  Monitors.fetchById = async (id) => mockMonitors.find(m => m.id === id);

  Monitors.create = async () => {
    App.showToast('Adding monitors is disabled in the Pro Playground', 'error');
    return null;
  };

  Monitors.update = async () => {
    App.showToast('Editing monitors is disabled in the Pro Playground', 'error');
    return null;
  };

  Monitors.remove = async () => {
    App.showToast('Deleting monitors is disabled in the Pro Playground', 'error');
    return false;
  };

  Monitors.toggleActive = async () => {
    App.showToast('Pausing monitors is disabled in the Pro Playground', 'error');
    return false;
  };

  Monitors.getUptimePercentage = async (id) => {
    const m = mockMonitors.find(m => m.id === id);
    return m ? m._mockUptime : 100;
  };

  Monitors.getAverageResponseTime = async (id) => {
    const m = mockMonitors.find(m => m.id === id);
    return m ? m._mockPing : 150;
  };

  Monitors.getDailyUptimeForDays = async (id, days) => {
    const data = [];
    const actualDays = Math.min(days, 15); // Pro Playground limit
    for (let i = 0; i < actualDays; i++) {
      const d = new Date(Date.now() - (actualDays - 1 - i) * 24 * 60 * 60 * 1000);
      data.push({
        date: d.toISOString().split('T')[0],
        uptime: Math.random() > 0.1 ? 100 : (80 + Math.random() * 20)
      });
    }
    return data;
  };

  Monitors.fetchCheckResults = async (id) => generateMockResults(id, 20);
  Monitors.fetchCheckResultsSince = async (id, sinceHours) => generateMockResults(id, Math.min(sinceHours * 60, 15 * 24 * 60));

  Monitors.fetchIncidents = async (id) => {
    const m = mockMonitors.find(m => m.id === id);
    if (!m || m.is_up) return [];
    return [{
      id: 'inc-1',
      monitor_id: id,
      started_at: new Date(Date.now() - 15 * 60000).toISOString(),
      resolved_at: null,
      error_message: 'Connection timeout (HTTP 522)'
    }];
  };

  // Override Settings.save
  const originalSettingsSave = Settings.save;
  Settings.save = async (e) => {
    if(e) e.preventDefault();
    App.showToast('Settings cannot be changed in the Pro Playground', 'error');
  };

  // Switch UI
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('app').style.display = 'flex';

  // Set sidebar user details manually since we skipped Auth.onSignedIn
  document.getElementById('user-avatar').src = Auth.getUser().user_metadata.avatar_url;
  document.getElementById('user-name').textContent = Auth.getUser().user_metadata.full_name;
  document.getElementById('user-email').textContent = Auth.getUser().email;
  const accountEmail = document.getElementById('account-email');
  if (accountEmail) accountEmail.textContent = Auth.getUser().email;

  // Add demo banner
  const banner = document.createElement('div');
  banner.className = 'demo-banner';
  banner.innerHTML = '<i data-lucide="info"></i> You are exploring the <b>Pro Playground</b>. Act like a Pro user and test all features without limits! Data is simulated and resets on refresh.';
  document.body.prepend(banner);

  // Initialize App Router
  window.location.hash = '#/dashboard';
  Router.init();
  lucide.createIcons();
  
  App.showToast('Welcome to the OpenUptime Pro Playground!', 'success');
}

function generateMockResults(id, count) {
  const results = [];
  const m = mockMonitors.find(m => m.id === id);
  const isCurrentlyDown = m && !m.is_up;
  
  for (let i = 0; i < count; i++) {
    const isUp = i === 0 && isCurrentlyDown ? false : (Math.random() > 0.05);
    results.push({
      checked_at: new Date(Date.now() - i * 5 * 60000).toISOString(),
      is_up: isUp,
      response_time_ms: isUp ? (m._mockPing + Math.floor(Math.random() * 40 - 20)) : null,
      status_code: isUp ? 200 : 522,
    });
  }
  return results;
}

// ─── MOCK DATA ───

const mockMonitors = [
  {
    id: 'demo-1',
    name: 'Production API',
    url: 'https://api.example.com/v1/health',
    method: 'GET',
    interval_minutes: 5,
    is_active: true,
    is_up: true,
    expected_status: 200,
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    _mockPing: 45,
    _mockUptime: 99.98
  },
  {
    id: 'demo-2',
    name: 'Main Website',
    url: 'https://example.com',
    method: 'GET',
    interval_minutes: 5,
    is_active: true,
    is_up: true,
    expected_status: 200,
    created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
    _mockPing: 120,
    _mockUptime: 99.95
  },
  {
    id: 'demo-3',
    name: 'Payment Gateway',
    url: 'https://payments.example.com/ping',
    method: 'POST',
    interval_minutes: 1,
    is_active: true,
    is_up: false,
    expected_status: 200,
    created_at: new Date(Date.now() - 15 * 86400000).toISOString(),
    _mockPing: 85,
    _mockUptime: 98.40
  },
  {
    id: 'demo-4',
    name: 'Blog',
    url: 'https://blog.example.com',
    method: 'GET',
    interval_minutes: 10,
    is_active: false,
    is_up: true,
    expected_status: 200,
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    _mockPing: 340,
    _mockUptime: 100
  }
];
