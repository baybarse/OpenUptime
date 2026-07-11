// ══════════════════════════════════════════════
// OpenUptime — Auth Module
// ══════════════════════════════════════════════
// Handles Google OAuth via Supabase Auth

const Auth = (() => {
  let currentUser = null;

  function init() {
    const { createClient } = supabase;
    window.supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    // Listen for auth state changes
    window.supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        currentUser = session.user;
        onSignedIn(session.user);
      } else if (event === 'SIGNED_OUT') {
        currentUser = null;
        onSignedOut();
      } else if (event === 'INITIAL_SESSION' && session) {
        currentUser = session.user;
        onSignedIn(session.user);
      } else if (event === 'INITIAL_SESSION' && !session) {
        onSignedOut();
      }
    });
  }

  async function signInWithGoogle() {
    const { error } = await window.supabaseClient.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + window.location.pathname,
      },
    });
    if (error) {
      App.showToast('Sign in failed: ' + error.message, 'error');
    }
  }

  async function signOut() {
    const { error } = await window.supabaseClient.auth.signOut();
    if (error) {
      App.showToast('Sign out failed: ' + error.message, 'error');
    } else {
      window.location.reload();
    }
  }

  function getUser() {
    return currentUser;
  }

  function onSignedIn(user) {
    // Hide login, show app
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('app').style.display = 'flex';

    // Update user info in sidebar
    const avatar = document.getElementById('user-avatar');
    const name = document.getElementById('user-name');
    const email = document.getElementById('user-email');
    const accountEmail = document.getElementById('account-email');

    if (user.user_metadata) {
      avatar.src = user.user_metadata.avatar_url || '';
      name.textContent = user.user_metadata.full_name || user.email;
    }
    email.textContent = user.email;
    if (accountEmail) accountEmail.textContent = user.email;

    // Initialize router & load dashboard
    Router.init();
  }

  function onSignedOut() {
    document.getElementById('login-page').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
    currentUser = null;
  }

  return { init, signInWithGoogle, signOut, getUser };
})();
