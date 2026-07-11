// ══════════════════════════════════════════════
// OpenUptime — Settings Page
// ══════════════════════════════════════════════

const Settings = (() => {
  async function render() {
    const user = Auth.getUser();
    if (!user) return;

    // Set account email
    const accountEmail = document.getElementById('account-email');
    if (accountEmail) accountEmail.textContent = user.email;

    // Load notification settings
    const { data } = await window.supabaseClient
      .from('notification_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (data) {
      document.getElementById('notification-email').value = data.email || '';
      document.getElementById('notify-down').checked = data.notify_down !== false;
      document.getElementById('notify-up').checked = data.notify_up !== false;
    } else {
      // Default to user's auth email
      document.getElementById('notification-email').value = user.email || '';
      document.getElementById('notify-down').checked = true;
      document.getElementById('notify-up').checked = true;
    }

    lucide.createIcons();
  }

  async function save(e) {
    e.preventDefault();
    const user = Auth.getUser();
    if (!user) return;

    const email = document.getElementById('notification-email').value.trim();
    const notifyDown = document.getElementById('notify-down').checked;
    const notifyUp = document.getElementById('notify-up').checked;

    if (!email) {
      App.showToast('Please enter a notification email', 'error');
      return;
    }

    const { error } = await window.supabaseClient
      .from('notification_settings')
      .upsert({
        user_id: user.id,
        email: email,
        notify_down: notifyDown,
        notify_up: notifyUp,
      }, { onConflict: 'user_id' });

    if (error) {
      App.showToast('Failed to save settings: ' + error.message, 'error');
    } else {
      App.showToast('Settings saved successfully', 'success');
    }
  }

  return { render, save };
})();
