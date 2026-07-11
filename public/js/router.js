// ══════════════════════════════════════════════
// OpenUptime — SPA Router
// ══════════════════════════════════════════════

const Router = (() => {
  let currentRoute = '';
  let initialized = false;

  function init() {
    if (initialized) {
      // Just navigate to current hash
      handleRoute();
      return;
    }
    initialized = true;

    window.addEventListener('hashchange', handleRoute);

    // Navigate to hash or default
    if (!window.location.hash || window.location.hash === '#/' || window.location.hash === '#') {
      window.location.hash = '#/dashboard';
    } else {
      handleRoute();
    }
  }

  function handleRoute() {
    const hash = window.location.hash.slice(1) || '/dashboard'; // remove #
    const parts = hash.split('/').filter(Boolean); // ['dashboard'] or ['monitor', 'id']

    const page = parts[0] || 'dashboard';
    const param = parts[1] || null;

    // Don't re-render if same route
    if (hash === currentRoute) return;
    currentRoute = hash;

    // Hide all content pages
    document.querySelectorAll('.content-page').forEach(p => {
      p.classList.remove('active');
    });

    // Update sidebar active link
    document.querySelectorAll('.nav-link').forEach(link => {
      link.classList.remove('active');
    });

    // Close mobile sidebar
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('active');

    switch (page) {
      case 'dashboard':
        document.getElementById('page-dashboard').classList.add('active');
        setActiveNav('dashboard');
        Dashboard.render();
        break;

      case 'monitor':
        if (param) {
          document.getElementById('page-monitor-detail').classList.add('active');
          setActiveNav('dashboard');
          MonitorDetail.render(param);
        } else {
          navigate('/dashboard');
        }
        break;

      case 'settings':
        document.getElementById('page-settings').classList.add('active');
        setActiveNav('settings');
        Settings.render();
        break;

      default:
        navigate('/dashboard');
    }
  }

  function setActiveNav(page) {
    const link = document.querySelector(`.nav-link[data-page="${page}"]`);
    if (link) link.classList.add('active');
  }

  function navigate(route) {
    window.location.hash = '#' + route;
  }

  function getCurrentParam() {
    const hash = window.location.hash.slice(1);
    const parts = hash.split('/').filter(Boolean);
    return parts[1] || null;
  }

  return { init, navigate, getCurrentParam };
})();
