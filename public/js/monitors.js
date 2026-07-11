// ══════════════════════════════════════════════
// OpenUptime — Monitors CRUD Module
// ══════════════════════════════════════════════
// Data access layer for monitors, check results, and incidents

const Monitors = (() => {

  // ─── Monitors CRUD ───

  async function fetchAll() {
    const { data, error } = await window.supabaseClient
      .from('monitors')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      App.showToast('Failed to load monitors: ' + error.message, 'error');
      return [];
    }
    return data || [];
  }

  async function fetchById(id) {
    const { data, error } = await window.supabaseClient
      .from('monitors')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      App.showToast('Monitor not found', 'error');
      return null;
    }
    return data;
  }

  async function create(monitorData) {
    // Check limit
    const existing = await fetchAll();
    if (existing.length >= APP_CONFIG.maxMonitors) {
      App.showToast(`You can have up to ${APP_CONFIG.maxMonitors} monitors on the free plan`, 'error');
      return null;
    }

    const user = Auth.getUser();
    const { data, error } = await window.supabaseClient
      .from('monitors')
      .insert({
        user_id: user.id,
        name: monitorData.name,
        url: monitorData.url,
        method: monitorData.method || 'GET',
        interval_minutes: monitorData.interval_minutes || APP_CONFIG.defaultCheckInterval,
        expected_status: monitorData.expected_status || 200,
        alert_threshold: monitorData.alert_threshold || APP_CONFIG.defaultAlertThreshold,
        is_active: true,
        is_up: true,
        consecutive_failures: 0,
      })
      .select()
      .single();

    if (error) {
      App.showToast('Failed to create monitor: ' + error.message, 'error');
      return null;
    }

    App.showToast('Monitor created successfully', 'success');
    return data;
  }

  async function update(id, monitorData) {
    const { data, error } = await window.supabaseClient
      .from('monitors')
      .update({
        name: monitorData.name,
        url: monitorData.url,
        method: monitorData.method,
        interval_minutes: monitorData.interval_minutes,
        expected_status: monitorData.expected_status,
        alert_threshold: monitorData.alert_threshold,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      App.showToast('Failed to update monitor: ' + error.message, 'error');
      return null;
    }

    App.showToast('Monitor updated successfully', 'success');
    return data;
  }

  async function remove(id) {
    const { error } = await window.supabaseClient
      .from('monitors')
      .delete()
      .eq('id', id);

    if (error) {
      App.showToast('Failed to delete monitor: ' + error.message, 'error');
      return false;
    }

    App.showToast('Monitor deleted', 'success');
    return true;
  }

  async function toggleActive(id, isActive) {
    const { error } = await window.supabaseClient
      .from('monitors')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      App.showToast('Failed to update monitor', 'error');
      return false;
    }

    App.showToast(isActive ? 'Monitor resumed' : 'Monitor paused', 'info');
    return true;
  }

  // ─── Check Results ───

  async function fetchCheckResults(monitorId, limit = 500) {
    const { data, error } = await window.supabaseClient
      .from('check_results')
      .select('*')
      .eq('monitor_id', monitorId)
      .order('checked_at', { ascending: false })
      .limit(limit);

    if (error) return [];
    return data || [];
  }

  async function fetchCheckResultsSince(monitorId, sinceHours) {
    const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString();
    const { data, error } = await window.supabaseClient
      .from('check_results')
      .select('*')
      .eq('monitor_id', monitorId)
      .gte('checked_at', since)
      .order('checked_at', { ascending: true });

    if (error) return [];
    return data || [];
  }

  // ─── Incidents ───

  async function fetchIncidents(monitorId, limit = 20) {
    const { data, error } = await window.supabaseClient
      .from('incidents')
      .select('*')
      .eq('monitor_id', monitorId)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) return [];
    return data || [];
  }

  // ─── Calculated Metrics ───

  async function getUptimePercentage(monitorId, hours) {
    const results = await fetchCheckResultsSince(monitorId, hours);
    if (results.length === 0) return null;

    const upCount = results.filter(r => r.is_up).length;
    return (upCount / results.length) * 100;
  }

  async function getAverageResponseTime(monitorId, hours) {
    const results = await fetchCheckResultsSince(monitorId, hours);
    const successResults = results.filter(r => r.is_up && r.response_time_ms);
    if (successResults.length === 0) return null;

    const sum = successResults.reduce((acc, r) => acc + r.response_time_ms, 0);
    return Math.round(sum / successResults.length);
  }

  async function getDailyUptimeForDays(monitorId, days) {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await window.supabaseClient
      .from('check_results')
      .select('is_up, checked_at')
      .eq('monitor_id', monitorId)
      .gte('checked_at', since)
      .order('checked_at', { ascending: true });

    if (error || !data) return [];

    // Group by day
    const dayMap = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000);
      const key = d.toISOString().split('T')[0];
      dayMap[key] = { total: 0, up: 0 };
    }

    data.forEach(r => {
      const key = r.checked_at.split('T')[0];
      if (dayMap[key]) {
        dayMap[key].total++;
        if (r.is_up) dayMap[key].up++;
      }
    });

    return Object.entries(dayMap).map(([date, stats]) => ({
      date,
      uptime: stats.total > 0 ? (stats.up / stats.total) * 100 : null,
    }));
  }

  return {
    fetchAll,
    fetchById,
    create,
    update,
    remove,
    toggleActive,
    fetchCheckResults,
    fetchCheckResultsSince,
    fetchIncidents,
    getUptimePercentage,
    getAverageResponseTime,
    getDailyUptimeForDays,
  };
})();
