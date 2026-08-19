(() => {
  'use strict';

  const OWNER = 'lntk';
  const pathParts = location.pathname.split('/').filter(Boolean);
  const REPO = pathParts[0] || 'logseq';
  const BRANCH = 'main';
  const BASE = `/${REPO}/`;
  const TOKEN_KEY = `logseq-publish-token-${OWNER}-${REPO}-v3`;
  const HISTORY_KEY = `logseq-publish-history-${OWNER}-${REPO}-v3`;

  const target = document.getElementById('content');
  const publisher = document.getElementById('publisher');
  const readyPanel = document.getElementById('publisher-ready');
  const setupPanel = document.getElementById('publisher-setup');
  const tokenInput = document.getElementById('token-input');
  const saveTokenButton = document.getElementById('save-token');
  const cancelSetupButton = document.getElementById('cancel-setup');
  const setupStatus = document.getElementById('setup-status');
  const chooseFileButton = document.getElementById('choose-file');
  const settingsButton = document.getElementById('publisher-settings');
  const fileInput = document.getElementById('file-input');
  const publishStatus = document.getElementById('publish-status');
  const publishResult = document.getElementById('publish-result');
  const dropOverlay = document.getElementById('drop-overlay');

  const params = new URLSearchParams(location.search);
  const editRequested = params.get('edit') === '1';
  let pendingFile = null;

  if (window.marked && window.markedKatex) {
    marked.use(markedKatex({
      throwOnError: false,
      nonStandard: true,
      strict: false
    }));
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || localStorage.getItem('logseq-publish-token-v2') || '';
  }

  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token.trim());
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem('logseq-publish-token-v2');
  }

  function normalizeLogseq(markdown) {
    return markdown
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/^([ \t]*)- TODO /gm, '$1- [ ] ')
      .replace(/^([ \t]*)- DOING /gm, '$1- [ ] ')
      .replace(/^([ \t]*)- NOW /gm, '$1- [ ] ')
      .replace(/^([ \t]*)- LATER /gm, '$1- [ ] ')
      .replace(/^([ \t]*)- DONE /gm, '$1- [x] ')
      .replace(/\\\[([\s\S]*?)\\\]/g, (_m, body) => `\n$$\n${body}\n$$\n`)
      .replace(/\\\(([\s\S]*?)\\\)/g, (_m, body) => `$${body}$`);
  }

  function currentSlug() {
    let path = location.pathname;
    if (path.startsWith(BASE)) path = path.slice(BASE.length);
    else path = path.replace(/^\/+/, '');
    path = path.replace(/\/+$/, '');
    return /^[a-f0-9]{32}$/.test(path) ? path : '';
  }

  function isRootPage() {
    return location.pathname === BASE || location.pathname === BASE.slice(0, -1);
  }

  async function renderMarkdown(raw) {
    const markdown = normalizeLogseq(raw);
    if (!window.marked) throw new Error('Markdown renderer failed to load.');
    if (!window.markedKatex) throw new Error('LaTeX renderer failed to load.');

    const rendered = marked.parse(markdown, { gfm: true, breaks: false });
    target.innerHTML = DOMPurify.sanitize(rendered, {
      ADD_ATTR: ['aria-hidden'],
      ADD_TAGS: ['annotation']
    });

    const firstHeading = raw.match(/^#\s+(.+)$/m);
    if (firstHeading) document.title = firstHeading[1].replace(/[*_`]/g, '').trim();
  }

  async function loadPage() {
    const slug = currentSlug();
    let source;

    if (slug) source = `${BASE}published/${slug}.md`;
    else if (isRootPage()) source = `${BASE}page.md`;
    else {
      target.innerHTML = '<div class="error"><strong>Page not found.</strong></div>';
      return;
    }

    try {
      const response = await fetch(`${source}?v=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Could not load note (${response.status})`);
      await renderMarkdown(await response.text());
    } catch (error) {
      target.innerHTML = `<div class="error"><strong>Nothing published here.</strong><p class="status">${escapeHtml(String(error.message || error))}</p></div>`;
    }
  }

  function escapeHtml(value) {
    return value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function showReady() {
    if (!publisher) return;
    publisher.hidden = false;
    publisher.classList.remove('setup');
    readyPanel.hidden = false;
    setupPanel.hidden = true;
    settingsButton.hidden = !getToken();
  }

  function showSetup(message = '') {
    if (!publisher) return;
    publisher.hidden = false;
    publisher.classList.add('setup');
    readyPanel.hidden = true;
    setupPanel.hidden = false;
    setupStatus.textContent = message;
    tokenInput.value = '';
    tokenInput.focus();
  }

  function configurePublisherUi() {
    if (!isRootPage() || !publisher) return;
    if (editRequested && !getToken()) showSetup();
    else showReady();
  }

  async function verifyToken(token) {
    const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}`, {
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28'
      }
    });
    if (!response.ok) throw new Error(`GitHub rejected the token (${response.status})`);
    return true;
  }

  function utf8ToBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  }

  async function githubCreateFile(path, content, message, token) {
    const response = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`, {
      method: 'PUT',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({ message, content: utf8ToBase64(content), branch: BRANCH })
    });

    if (response.status === 422) {
      const error = new Error('path-collision');
      error.code = 'PATH_COLLISION';
      throw error;
    }
    if (!response.ok) {
      let detail = '';
      try { detail = (await response.json()).message || ''; } catch (_) {}
      throw new Error(`GitHub upload failed (${response.status})${detail ? `: ${detail}` : ''}`);
    }
    return response.json();
  }

  function randomId() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  }

  async function getShell() {
    const response = await fetch(`${BASE}shell.html?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load publisher shell');
    return response.text();
  }

  function saveHistory(item) {
    let history = [];
    try { history = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch (_) {}
    history.unshift(item);
    history = history.slice(0, 50);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  }

  async function publishFile(file) {
    if (!file || (!file.name.toLowerCase().endsWith('.md') && file.type && file.type !== 'text/markdown' && file.type !== 'text/plain')) {
      publishStatus.textContent = 'Choose a Markdown (.md) file.';
      return;
    }

    const token = getToken();
    if (!token) {
      pendingFile = file;
      showSetup(`Ready to publish ${file.name}. Connect GitHub once to continue.`);
      return;
    }

    publishResult.innerHTML = '';
    publishStatus.textContent = `Publishing ${file.name}…`;
    const markdown = await file.text();
    const shell = await getShell();

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const id = randomId();
      try {
        await githubCreateFile(`published/${id}.md`, markdown, `Publish ${file.name} as ${id}`, token);
        await githubCreateFile(`${id}/index.html`, shell, `Add published route ${id}`, token);

        const url = `${location.origin}${BASE}${id}/`;
        saveHistory({ id, name: file.name, url, createdAt: new Date().toISOString() });
        publishStatus.textContent = 'Published';
        publishResult.innerHTML = `<a id="new-link" href="${url}">${url}</a><button id="copy-link" type="button">Copy link</button>`;
        document.getElementById('copy-link').addEventListener('click', async () => {
          await navigator.clipboard.writeText(url);
          document.getElementById('copy-link').textContent = 'Copied';
        });
        return;
      } catch (error) {
        if (error.code === 'PATH_COLLISION') continue;
        if (/401|403/.test(String(error.message))) {
          clearToken();
          showSetup('Token expired or lacks Contents: read and write permission.');
        }
        publishStatus.textContent = String(error.message || error);
        return;
      }
    }
    publishStatus.textContent = 'Could not generate a unique page ID. Try again.';
  }

  saveTokenButton?.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    if (!token) return;
    saveTokenButton.disabled = true;
    setupStatus.textContent = 'Checking…';
    try {
      await verifyToken(token);
      setToken(token);
      setupStatus.textContent = '';
      showReady();
      if (pendingFile) {
        const file = pendingFile;
        pendingFile = null;
        await publishFile(file);
      }
    } catch (error) {
      setupStatus.textContent = String(error.message || error);
    } finally {
      saveTokenButton.disabled = false;
    }
  });

  cancelSetupButton?.addEventListener('click', () => {
    pendingFile = null;
    showReady();
  });

  settingsButton?.addEventListener('click', () => {
    clearToken();
    showSetup('GitHub connection removed from this browser.');
  });

  chooseFileButton?.addEventListener('click', () => fileInput.click());
  fileInput?.addEventListener('change', () => {
    if (fileInput.files?.[0]) publishFile(fileInput.files[0]);
    fileInput.value = '';
  });

  let dragDepth = 0;
  window.addEventListener('dragenter', event => {
    if (!isRootPage()) return;
    event.preventDefault();
    dragDepth += 1;
    if (dropOverlay) dropOverlay.hidden = false;
  });
  window.addEventListener('dragover', event => {
    if (isRootPage()) event.preventDefault();
  });
  window.addEventListener('dragleave', event => {
    if (!isRootPage()) return;
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0 && dropOverlay) dropOverlay.hidden = true;
  });
  window.addEventListener('drop', event => {
    if (!isRootPage()) return;
    event.preventDefault();
    dragDepth = 0;
    if (dropOverlay) dropOverlay.hidden = true;
    const file = event.dataTransfer?.files?.[0];
    if (file) publishFile(file);
  });

  configurePublisherUi();
  loadPage();
})();
