(() => {
  'use strict';

  const OWNER = 'lntk';
  const REPO = 'logseq-publish';
  const BRANCH = 'main';
  const BASE = '/logseq-publish/';
  const TOKEN_KEY = 'logseq-publish-token-v2';
  const HISTORY_KEY = 'logseq-publish-history-v2';

  const target = document.getElementById('content');
  const publisher = document.getElementById('publisher');
  const readyPanel = document.getElementById('publisher-ready');
  const setupPanel = document.getElementById('publisher-setup');
  const tokenInput = document.getElementById('token-input');
  const saveTokenButton = document.getElementById('save-token');
  const setupStatus = document.getElementById('setup-status');
  const chooseFileButton = document.getElementById('choose-file');
  const settingsButton = document.getElementById('publisher-settings');
  const fileInput = document.getElementById('file-input');
  const publishStatus = document.getElementById('publish-status');
  const publishResult = document.getElementById('publish-result');
  const dropOverlay = document.getElementById('drop-overlay');

  const params = new URLSearchParams(location.search);
  const editRequested = params.get('edit') === '1';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token.trim());
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }

  function normalizeLogseq(markdown) {
    return markdown
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/^([ \t]*)- TODO /gm, '$1- [ ] ')
      .replace(/^([ \t]*)- DOING /gm, '$1- [ ] ')
      .replace(/^([ \t]*)- NOW /gm, '$1- [ ] ')
      .replace(/^([ \t]*)- LATER /gm, '$1- [ ] ')
      .replace(/^([ \t]*)- DONE /gm, '$1- [x] ');
  }

  function currentSlug() {
    let path = location.pathname;
    if (path.startsWith(BASE)) path = path.slice(BASE.length);
    else path = path.replace(/^\/+/, '');
    path = path.replace(/\/+$/, '');
    return /^[a-f0-9]{32}$/.test(path) ? path : '';
  }

  async function waitForKatex() {
    for (let i = 0; i < 80; i += 1) {
      if (window.renderMathInElement) return true;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    return false;
  }

  async function renderMarkdown(raw) {
    const markdown = normalizeLogseq(raw);
    const rendered = marked.parse(markdown, { gfm: true, breaks: false });
    target.innerHTML = DOMPurify.sanitize(rendered);

    if (await waitForKatex()) {
      renderMathInElement(target, {
        delimiters: [
          { left: '$$', right: '$$', display: true },
          { left: '\\[', right: '\\]', display: true },
          { left: '\\(', right: '\\)', display: false },
          { left: '$', right: '$', display: false }
        ],
        throwOnError: false,
        strict: false
      });
    }

    const firstHeading = raw.match(/^#\s+(.+)$/m);
    if (firstHeading) document.title = firstHeading[1].replace(/[*_`]/g, '').trim();
  }

  async function loadPage() {
    const slug = currentSlug();
    const atRoot = location.pathname === BASE || location.pathname === BASE.slice(0, -1) || !location.pathname.startsWith(BASE);
    let source;

    if (slug) source = `${BASE}published/${slug}.md`;
    else if (atRoot) source = `${BASE}page.md`;
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
    publisher.hidden = false;
    readyPanel.hidden = false;
    setupPanel.hidden = true;
  }

  function showSetup(message = '') {
    publisher.hidden = false;
    readyPanel.hidden = true;
    setupPanel.hidden = false;
    setupStatus.textContent = message;
    tokenInput.value = '';
    tokenInput.focus();
  }

  function configurePublisherUi() {
    if (getToken()) showReady();
    else if (editRequested) showSetup();
    else publisher.hidden = true;
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
      body: JSON.stringify({
        message,
        content: utf8ToBase64(content),
        branch: BRANCH
      })
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
      publishStatus.textContent = 'Please drop a Markdown (.md) file.';
      return;
    }

    const token = getToken();
    if (!token) {
      showSetup('Add your GitHub token first.');
      return;
    }

    publishResult.innerHTML = '';
    publishStatus.textContent = `Reading ${file.name}…`;
    const markdown = await file.text();
    const shell = await getShell();

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const id = randomId();
      try {
        publishStatus.textContent = 'Uploading Markdown…';
        await githubCreateFile(
          `published/${id}.md`,
          markdown,
          `Publish ${file.name} as ${id}`,
          token
        );

        publishStatus.textContent = 'Creating unlisted public link…';
        await githubCreateFile(
          `${id}/index.html`,
          shell,
          `Add published route ${id}`,
          token
        );

        const url = `${location.origin}${BASE}${id}/`;
        saveHistory({ id, name: file.name, url, createdAt: new Date().toISOString() });
        publishStatus.textContent = 'Published. GitHub Pages may take a short moment to refresh.';
        publishResult.innerHTML = `<a id="new-link" href="${url}">${url}</a> <button id="copy-link" type="button">Copy</button>`;
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
    publishStatus.textContent = 'Could not generate a unique page ID; try again.';
  }

  saveTokenButton?.addEventListener('click', async () => {
    const token = tokenInput.value.trim();
    if (!token) return;
    saveTokenButton.disabled = true;
    setupStatus.textContent = 'Checking token…';
    try {
      await verifyToken(token);
      setToken(token);
      setupStatus.textContent = '';
      showReady();
    } catch (error) {
      setupStatus.textContent = String(error.message || error);
    } finally {
      saveTokenButton.disabled = false;
    }
  });

  settingsButton?.addEventListener('click', () => {
    clearToken();
    showSetup('Token removed from this browser. Paste a token to enable publishing again.');
  });

  chooseFileButton?.addEventListener('click', () => fileInput.click());
  fileInput?.addEventListener('change', () => {
    if (fileInput.files?.[0]) publishFile(fileInput.files[0]);
    fileInput.value = '';
  });

  let dragDepth = 0;
  window.addEventListener('dragenter', event => {
    event.preventDefault();
    dragDepth += 1;
    if (getToken()) dropOverlay.hidden = false;
  });
  window.addEventListener('dragover', event => event.preventDefault());
  window.addEventListener('dragleave', event => {
    event.preventDefault();
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropOverlay.hidden = true;
  });
  window.addEventListener('drop', event => {
    event.preventDefault();
    dragDepth = 0;
    dropOverlay.hidden = true;
    const file = event.dataTransfer?.files?.[0];
    if (!getToken()) {
      if (editRequested) showSetup('Add your GitHub token first.');
      return;
    }
    if (file) publishFile(file);
  });

  configurePublisherUi();
  loadPage();
})();
