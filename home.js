(() => {
  'use strict';

  const SUPABASE_URL = 'https://ufwytuotzxujrvhfzcoh.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_k2j-Uv9H4K397gWi_2rzSw_PCnUQYxz';
  const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/logseq-publish`;
  const GOOGLE_CLIENT_ID = '67725416110-0vm746r7aa5h837tppqo494gnpa76adr.apps.googleusercontent.com';

  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });

  const signedOut = document.getElementById('signed-out');
  const denied = document.getElementById('denied');
  const workspace = document.getElementById('workspace');
  const signInButton = document.getElementById('google-signin');
  const signInStatus = document.getElementById('signin-status');
  const deniedEmail = document.getElementById('denied-email');
  const deniedSignOut = document.getElementById('denied-signout');
  const accountEmail = document.getElementById('account-email');
  const accountRole = document.getElementById('account-role');
  const signOutButton = document.getElementById('signout');
  const chooseFileButton = document.getElementById('choose-file');
  const fileInput = document.getElementById('file-input');
  const publishStatus = document.getElementById('publish-status');
  const publishResult = document.getElementById('publish-result');
  const dropOverlay = document.getElementById('drop-overlay');
  const accessPanel = document.getElementById('access-panel');
  const accessEmail = document.getElementById('access-email');
  const grantButton = document.getElementById('grant-access');
  const revokeButton = document.getElementById('revoke-access');
  const accessStatus = document.getElementById('access-status');

  let authorized = false;
  let pendingNonce = null;
  let signInResetTimer = null;

  function showOnly(element) {
    [signedOut, denied, workspace].forEach(el => {
      if (el) el.hidden = el !== element;
    });
  }

  function resetSignInButton() {
    if (signInResetTimer) clearTimeout(signInResetTimer);
    signInResetTimer = null;
    signInButton.disabled = false;
    signInButton.textContent = 'Continue with Google';
  }

  function setPublishStatus(message = '') {
    publishStatus.textContent = message;
  }

  function setAccessStatus(message = '') {
    accessStatus.textContent = message;
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  async function makeNoncePair() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const raw = btoa(String.fromCharCode(...bytes));
    const encoded = new TextEncoder().encode(raw);
    const digest = await crypto.subtle.digest('SHA-256', encoded);
    const hashed = Array.from(new Uint8Array(digest))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    return { raw, hashed };
  }

  async function api(body) {
    const { data: { session } } = await sb.auth.getSession();
    if (!session?.access_token) throw new Error('Please sign in again.');

    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_KEY,
      },
      body: JSON.stringify(body),
    });

    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) {
      const error = new Error(data.error || `Request failed (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async function refreshUi(session) {
    authorized = false;
    publishResult.innerHTML = '';
    setPublishStatus('');
    setAccessStatus('');

    if (!session) {
      showOnly(signedOut);
      return;
    }

    try {
      const me = await api({ action: 'whoami' });
      authorized = true;
      accountEmail.textContent = me.email;
      accountRole.textContent = me.role === 'owner' ? 'Owner' : 'Uploader';
      accessPanel.hidden = me.role !== 'owner';
      showOnly(workspace);
    } catch (error) {
      if (error.status === 403) {
        deniedEmail.textContent = session.user?.email || 'this account';
        showOnly(denied);
        return;
      }
      deniedEmail.textContent = session.user?.email || 'this account';
      document.getElementById('denied-message').textContent = String(error.message || error);
      showOnly(denied);
    }
  }

  async function handleGoogleCredential(response) {
    if (signInResetTimer) clearTimeout(signInResetTimer);
    signInStatus.textContent = 'Signing in…';

    const nonce = pendingNonce;
    pendingNonce = null;

    try {
      if (!nonce) throw new Error('Google sign-in nonce was lost. Please try again.');

      const { data, error } = await sb.auth.signInWithIdToken({
        provider: 'google',
        token: response.credential,
        nonce,
      });
      if (error) throw error;

      signInStatus.textContent = '';
      resetSignInButton();
      await refreshUi(data.session);
    } catch (error) {
      resetSignInButton();
      signInStatus.textContent = String(error.message || error);
    }
  }

  async function signIn() {
    signInStatus.textContent = '';

    if (!window.google?.accounts?.id) {
      signInStatus.textContent = 'Google sign-in failed to load. Refresh the page and try again.';
      return;
    }

    signInButton.disabled = true;
    signInButton.textContent = 'Opening Google…';

    try {
      const { raw, hashed } = await makeNoncePair();
      pendingNonce = raw;

      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
        nonce: hashed,
        auto_select: false,
      });

      window.google.accounts.id.prompt(notification => {
        if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.()) {
          pendingNonce = null;
          resetSignInButton();
          signInStatus.textContent = 'Google sign-in could not open. Try again or allow Google sign-in prompts in your browser.';
        }
      });

      signInResetTimer = setTimeout(() => {
        pendingNonce = null;
        resetSignInButton();
      }, 12000);
    } catch (error) {
      pendingNonce = null;
      resetSignInButton();
      signInStatus.textContent = String(error.message || error);
    }
  }

  async function signOut() {
    await sb.auth.signOut();
    window.google?.accounts?.id?.disableAutoSelect();
    await refreshUi(null);
  }

  async function publishFile(file) {
    if (!authorized) return;
    if (!file || !file.name.toLowerCase().endsWith('.md')) {
      setPublishStatus('Choose a Markdown (.md) file.');
      return;
    }

    if (file.size > 2_000_000) {
      setPublishStatus('That file is too large. Maximum size is 2 MB.');
      return;
    }

    chooseFileButton.disabled = true;
    publishResult.innerHTML = '';
    setPublishStatus(`Publishing ${file.name}…`);

    try {
      const markdown = await file.text();
      const result = await api({ action: 'publish', filename: file.name, markdown });
      setPublishStatus('Published. GitHub Pages may take a few seconds to serve the new page.');
      publishResult.innerHTML = `
        <div class="result-label">Share link</div>
        <div class="result-row">
          <a id="new-link" href="${escapeHtml(result.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(result.url)}</a>
          <button id="copy-link" type="button">Copy</button>
        </div>`;
      document.getElementById('copy-link')?.addEventListener('click', async event => {
        await navigator.clipboard.writeText(result.url);
        event.currentTarget.textContent = 'Copied';
      });
    } catch (error) {
      setPublishStatus(String(error.message || error));
      if (error.status === 401) await refreshUi(null);
    } finally {
      chooseFileButton.disabled = false;
    }
  }

  async function changeAccess(action) {
    const email = accessEmail.value.trim().toLowerCase();
    if (!email) {
      setAccessStatus('Enter an email address.');
      return;
    }

    grantButton.disabled = true;
    revokeButton.disabled = true;
    setAccessStatus(action === 'add_uploader' ? 'Granting access…' : 'Revoking access…');

    try {
      await api({ action, email });
      setAccessStatus(action === 'add_uploader' ? `Access granted to ${email}.` : `Access revoked for ${email}.`);
      accessEmail.value = '';
    } catch (error) {
      setAccessStatus(String(error.message || error));
    } finally {
      grantButton.disabled = false;
      revokeButton.disabled = false;
    }
  }

  signInButton?.addEventListener('click', signIn);
  signOutButton?.addEventListener('click', signOut);
  deniedSignOut?.addEventListener('click', signOut);
  chooseFileButton?.addEventListener('click', () => fileInput.click());
  fileInput?.addEventListener('change', () => {
    if (fileInput.files?.[0]) publishFile(fileInput.files[0]);
    fileInput.value = '';
  });
  grantButton?.addEventListener('click', () => changeAccess('add_uploader'));
  revokeButton?.addEventListener('click', () => changeAccess('remove_uploader'));

  let dragDepth = 0;
  window.addEventListener('dragenter', event => {
    if (!authorized) return;
    event.preventDefault();
    dragDepth += 1;
    dropOverlay.hidden = false;
  });
  window.addEventListener('dragover', event => {
    if (authorized) event.preventDefault();
  });
  window.addEventListener('dragleave', event => {
    if (!authorized) return;
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropOverlay.hidden = true;
  });
  window.addEventListener('drop', event => {
    if (!authorized) return;
    event.preventDefault();
    dragDepth = 0;
    dropOverlay.hidden = true;
    const file = event.dataTransfer?.files?.[0];
    if (file) publishFile(file);
  });

  sb.auth.onAuthStateChange((_event, session) => {
    setTimeout(() => refreshUi(session), 0);
  });

  sb.auth.getSession().then(({ data }) => refreshUi(data.session));
})();
