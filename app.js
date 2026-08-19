(() => {
  'use strict';

  const pathParts = location.pathname.split('/').filter(Boolean);
  const REPO = pathParts[0] || 'logseq';
  const BASE = `/${REPO}/`;
  const target = document.getElementById('content');

  if (window.marked && window.markedKatex) {
    marked.use(markedKatex({ throwOnError: false, nonStandard: true, strict: false }));
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

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function enhanceCollapsibleBlocks() {
    if (!target) return;

    let index = 0;
    target.querySelectorAll('li').forEach(li => {
      const childrenList = Array.from(li.children).find(
        child => child.tagName === 'UL' || child.tagName === 'OL'
      );
      if (!childrenList) return;

      index += 1;
      const id = `block-children-${index}`;
      childrenList.id = id;
      childrenList.classList.add('logseq-children');
      li.classList.add('logseq-collapsible');

      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'logseq-toggle';
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-controls', id);
      toggle.setAttribute('aria-label', 'Collapse block');
      toggle.textContent = '▾';

      toggle.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();

        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        const nextExpanded = !expanded;
        toggle.setAttribute('aria-expanded', String(nextExpanded));
        toggle.setAttribute('aria-label', nextExpanded ? 'Collapse block' : 'Expand block');
        toggle.textContent = nextExpanded ? '▾' : '▸';
        childrenList.hidden = !nextExpanded;
      });

      li.insertBefore(toggle, li.firstChild);
    });
  }

  async function renderMarkdown(raw) {
    if (!target) return;
    if (!window.marked) throw new Error('Markdown renderer failed to load.');
    if (!window.markedKatex) throw new Error('LaTeX renderer failed to load.');
    if (!window.DOMPurify) throw new Error('HTML sanitizer failed to load.');

    const rendered = marked.parse(normalizeLogseq(raw), { gfm: true, breaks: false });
    target.innerHTML = DOMPurify.sanitize(rendered, {
      ADD_ATTR: ['aria-hidden'],
      ADD_TAGS: ['annotation']
    });

    enhanceCollapsibleBlocks();

    const firstHeading = raw.match(/^#\s+(.+)$/m);
    if (firstHeading) document.title = firstHeading[1].replace(/[*_`]/g, '').trim();
  }

  async function loadPage() {
    const slug = currentSlug();
    if (!slug || !target) {
      if (target) target.innerHTML = '<div class="error"><strong>Page not found.</strong></div>';
      return;
    }

    try {
      const response = await fetch(`${BASE}published/${slug}.md?v=${Date.now()}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Could not load note (${response.status})`);
      await renderMarkdown(await response.text());
    } catch (error) {
      target.innerHTML = `<div class="error"><strong>Nothing published here.</strong><p class="status">${escapeHtml(String(error.message || error))}</p></div>`;
    }
  }

  loadPage();
})();
