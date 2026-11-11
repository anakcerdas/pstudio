(() => {
  const { esc, uid, igHandle, videoThumb, videoKind, byLatest, latestDate, monthLabel, thisMonth } = window.PS;
  // Each section can be "latest" (newest first, automatic) or "custom" (the list order you arrange).
  const GROUPS = {
    apps: { arr: () => data.apps, match: () => true },
    series: { arr: () => data.videos, match: (v) => v.type === 'series' },
    shorts: { arr: () => data.videos, match: (v) => !['series', 'commercial', 'motion'].includes(v.type) },
    motions: { arr: () => data.videos, match: (v) => v.type === 'motion' },
    commercials: { arr: () => data.videos, match: (v) => v.type === 'commercial' },
  };
  const modeOf = (g) => data.site.order?.[g] || 'latest';
  // indices into the section's array, in the order the site shows them
  function groupIdx(g) {
    const { arr, match } = GROUPS[g];
    const list = arr();
    const items = list.filter(match);
    return (modeOf(g) === 'custom' ? items : byLatest(items)).map((x) => list.indexOf(x));
  }
  // move list[from] next to list[to] (before it, or after it)
  function moveItem(g, from, to, after) {
    const list = GROUPS[g].arr();
    const item = list[from], target = list[to];
    if (!item || !target || item === target) return;
    list.splice(from, 1);
    list.splice(list.indexOf(target) + (after ? 1 : 0), 0, item);
  }
  function setMode(g, mode) {
    if (mode === 'custom' && modeOf(g) !== 'custom') {
      // start the custom order from what the site shows now, so nothing jumps
      const list = GROUPS[g].arr();
      const ids = groupIdx(g);
      const items = ids.map((i) => list[i]);
      [...ids].sort((a, b) => a - b).forEach((slot, k) => { list[slot] = items[k]; });
    }
    data.site.order = { ...data.site.order, [g]: mode };
  }
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  let data = null;
  let dirty = false;
  let tab = 'apps';
  const openIds = new Set();
  let inquiries = []; // contact-form messages; separate from the content, so deleting one needs no Save

  // ---------------- api ----------------
  async function api(url, opts = {}) {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
    return j;
  }

  async function boot() {
    const { authed } = await api('/api/session');
    if (!authed) { $('#login').hidden = false; $('#password').focus(); return; }
    data = await api('/api/content');
    data.site ||= {}; data.apps ||= []; data.videos ||= [];
    data.site.instagram ||= {};
    $('#login').hidden = true;
    $('#app').hidden = false;
    render();
    loadInquiries();
  }

  async function loadInquiries() {
    try { inquiries = (await api('/api/inquiries')).inquiries || []; } catch (err) { return toast(err.message, true); }
    $('#inq-count').textContent = inquiries.length || '';
    if (tab === 'inquiries') render();
  }

  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#login-error').textContent = '';
    try {
      await api('/api/login', { method: 'POST', body: JSON.stringify({ password: $('#password').value }) });
      boot();
    } catch (err) { $('#login-error').textContent = err.message; }
  });

  $('#logout').addEventListener('click', async () => {
    if (dirty && !confirm('You have unsaved changes. Log out anyway?')) return;
    await api('/api/logout', { method: 'POST' });
    dirty = false; location.reload();
  });

  $('#save').addEventListener('click', save);
  addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if (dirty) save(); }
  });
  addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

  async function save() {
    const btn = $('#save');
    btn.textContent = 'Saving…';
    try {
      const res = await api('/api/content', { method: 'PUT', body: JSON.stringify(data) });
      // the server fills in web address names for new posts; show them right away
      if (res.content) { data = res.content; render(); }
      setDirty(false);
      toast('Saved — the site is updated');
    } catch (err) {
      btn.textContent = 'Save changes';
      toast(err.message, true);
    }
  }

  function setDirty(v) {
    dirty = v;
    const btn = $('#save');
    btn.disabled = !v;
    btn.classList.toggle('dirty', v);
    btn.textContent = v ? 'Save changes' : 'Saved';
  }

  let toastTimer;
  function toast(msg, err) {
    const t = $('#toast');
    t.textContent = msg; t.classList.toggle('err', err === true); t.classList.toggle('warn', err === 'warn'); t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), err === 'warn' ? 8000 : 2600);
  }

  // ---------------- path helpers ----------------
  function getPath(p) { return p.split('.').reduce((o, k) => (o == null ? o : o[k]), data); }
  function setPath(p, v) {
    const keys = p.split('.'); const last = keys.pop();
    const obj = keys.reduce((o, k) => (o[k] ??= {}), data);
    obj[last] = v;
  }
  function fromInput(el) {
    const v = el.value;
    if (el.dataset.format === 'csv') return v.split(',').map((s) => s.trim()).filter(Boolean);
    if (el.dataset.format === 'lines') return v.split('\n').map((s) => s.trim()).filter(Boolean);
    return v;
  }
  function toInput(v, format) {
    if (format === 'csv') return (v || []).join(', ');
    if (format === 'lines') return (v || []).join('\n');
    return v ?? '';
  }

  // field builders
  function field(label, path, { type = 'text', format, placeholder = '', hint = '', area = false } = {}) {
    const val = esc(toInput(getPath(path), format));
    const attrs = `data-bind="${path}" ${format ? `data-format="${format}"` : ''} placeholder="${esc(placeholder)}"`;
    return `<label class="f"><span>${label}${hint ? ` <em>— ${hint}</em>` : ''}</span>${area ? `<textarea ${attrs}>${val}</textarea>` : `<input type="${type}" ${attrs} value="${val}">`}</label>`;
  }

  // A post's web address name: made from the title on first save, then kept, so renaming a post never
  // breaks shared links. If it is changed, the old address keeps redirecting to the new one.
  function addressField(p, item, prefix) {
    const hint = item.slug ? `link: ${prefix}${esc(item.slug)}` : 'made from the title when you save';
    return field('Web address', `${p}.slug`, { placeholder: window.PS.slug(item.title) || 'my-post', hint: `${hint}. Changing it later keeps the old link working` });
  }

  // recommended upload sizes, shown under each image field and checked after upload
  const SIZES = {
    thumbnail: { w: 1600, h: 1000, note: '1600 × 1000 px (16:10, landscape)', use: 'Interactive card image' },
    cover: { w: 1920, h: 1080, note: '1920 × 1080 px (16:9, landscape) or 1080 × 1920 px (9:16, portrait)', alt: [{ w: 1080, h: 1920, note: '1080 × 1920 px (9:16, portrait)' }], use: 'Card and page image. Both shapes work: landscape fills the banner, portrait stands beside the title' },
    poster: { w: 1200, h: 1600, note: '1200 × 1600 px (3:4, portrait)', use: 'Series Library card' },
    avatar: { w: 400, h: 400, note: '400 × 400 px (square)', use: 'Profile photo' },
    share: { w: 1200, h: 630, note: '1200 × 630 px (landscape)', use: 'Preview image when the home page link is shared on WhatsApp, Facebook, LinkedIn or X' },
    gallery: { long: 1600, note: 'any shape, at least 1600 px on the long side', use: 'Posters, behind the scenes, stills' },
  };
  const FORMAT_NOTE = 'JPG, PNG or WebP up to 20 MB; large photos are compressed automatically';
  const sizeNote = (key) => `<div class="size-note"><b>Recommended: ${SIZES[key].note}</b><span>${SIZES[key].use}. ${FORMAT_NOTE}.</span></div>`;

  // returns a warning if the image is noticeably smaller or a different shape than recommended
  async function checkImage(file, key, compressed = false) {
    const rec = SIZES[key];
    if (!rec) return '';
    const warn = [];
    if (!compressed && file.size > 2 * 1024 * 1024) warn.push(`the file is ${(file.size / 1048576).toFixed(1)} MB, so it may load slowly`);
    let w, h;
    try { const bmp = await createImageBitmap(file); w = bmp.width; h = bmp.height; bmp.close?.(); } catch { return warn.join(' and '); } // e.g. SVG
    if (rec.long) {
      if (Math.max(w, h) < rec.long * 0.75) warn.push(`it is ${w} × ${h} px; at least ${rec.long} px on the long side looks sharp`);
    } else {
      // compare against whichever allowed shape is closest (e.g. a cover can be 16:9 or 9:16)
      const r = [rec, ...(rec.alt || [])].reduce((a, c) => (Math.abs(w / h - c.w / c.h) < Math.abs(w / h - a.w / a.h) ? c : a));
      if (w < r.w * 0.75 || h < r.h * 0.75) warn.push(`it is ${w} × ${h} px, smaller than the recommended ${r.w} × ${r.h}, so it may look blurry`);
      if (Math.abs(w / h - r.w / r.h) / (r.w / r.h) > 0.15) warn.push(`its shape is not ${(rec.alt ? '16:9 or 9:16' : rec.note.split('(')[1].split(',')[0])}, so it will be cropped`);
    }
    return warn.join(' and ');
  }

  function mediaField(label, path, { round = false, hint = '', size = '' } = {}) {
    const v = getPath(path) || '';
    return `<label class="f"><span>${label}${hint ? ` <em>— ${hint}</em>` : ''}</span>
      <div class="media-field">
        <div class="preview${round ? ' round' : ''}" style="background-image:url('${esc(v)}')"></div>
        <div class="grow">
          <input type="url" data-bind="${path}" value="${esc(v)}" placeholder="Image URL, or upload →">
          <div style="display:flex;gap:8px">
            <span class="btn ghost sm upload-btn">Upload image<input type="file" accept="image/*" data-upload="image" data-target="${path}" data-size="${size}"></span>
            ${v ? `<button class="btn ghost sm" data-act="clear" data-path="${path}">Remove</button>` : ''}
          </div>
          ${size ? sizeNote(size) : ''}
        </div>
      </div></label>`;
  }

  // month + year as two plain dropdowns (the browser's month picker hides the year)
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function datePicker(path, { label = '', hint = '', compact = false } = {}) {
    const [y = '', m = ''] = (getPath(path) || '').split('-');
    const now = new Date().getFullYear();
    const years = [];
    for (let yr = now + 1; yr >= 2015; yr--) years.push(String(yr));
    if (y && !years.includes(y)) years.push(y);
    const pick = `<div class="date-pick${compact ? ' compact' : ''}" data-date="${path}">
      <select data-part="m" aria-label="Month"><option value="">Month</option>${MONTHS.map((name, i) => {
        const v = String(i + 1).padStart(2, '0');
        return `<option value="${v}" ${v === m ? 'selected' : ''}>${compact ? name.slice(0, 3) : name}</option>`;
      }).join('')}</select>
      <select data-part="y" aria-label="Year"><option value="">Year</option>${years.map((v) => `<option ${v === y ? 'selected' : ''}>${v}</option>`).join('')}</select>
    </div>`;
    return compact ? pick : `<label class="f"><span>${label}${hint ? ` <em>— ${hint}</em>` : ''}</span>${pick}</label>`;
  }

  function seg(path, options) {
    const cur = getPath(path);
    return `<div class="seg">${options.map(([val, txt]) => `<button data-act="set" data-path="${path}" data-value="${val}" class="${cur === val ? 'on' : ''}">${txt}</button>`).join('')}</div>`;
  }

  function itemActions(g, i, pos, len) {
    const custom = modeOf(g) === 'custom';
    return `<span class="sum-actions">
      ${custom ? `<span class="handle" draggable="true" data-drag="${g}" data-i="${i}" title="Drag to reorder">⠿</span>
      <button class="icon" data-act="reorder" data-group="${g}" data-i="${i}" data-dir="-1" title="Move up" ${pos === 0 ? 'disabled' : ''}>↑</button>
      <button class="icon" data-act="reorder" data-group="${g}" data-i="${i}" data-dir="1" title="Move down" ${pos === len - 1 ? 'disabled' : ''}>↓</button>` : ''}
      ${hideButton(g, i)}
      <button class="icon del" data-act="del-post" data-group="${g}" data-i="${i}" title="Delete post">✕</button>
    </span>`;
  }
  // A hidden post stays in the CMS but is left out of the website (lists, its own page, the sitemap)
  const EYE = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7c2.2 0 4.1.7 5.7 1.7M23 12s-4 7-11 7c-2.2 0-4.1-.7-5.7-1.7"/><path d="M3 3l18 18"/></svg>';
  function hideButton(g, i) {
    const hidden = !!GROUPS[g].arr()[i].hidden;
    return `<button class="icon vis ${hidden ? 'off' : ''}" data-act="toggle-hidden" data-group="${g}" data-i="${i}" title="${hidden ? 'Hidden from the website. Click to show it' : 'Shown on the website. Click to hide it'}">${hidden ? EYE_OFF : EYE}</button>`;
  }
  function visibilityRow(g, i) {
    const hidden = !!GROUPS[g].arr()[i].hidden;
    return `<label class="f"><span>On the website <em>— hiding keeps the post here, so you can show it again any time</em></span>
      <div class="seg"><button data-act="toggle-hidden" data-group="${g}" data-i="${i}" class="${hidden ? '' : 'on'}" ${hidden ? '' : 'disabled'}>Shown</button><button data-act="toggle-hidden" data-group="${g}" data-i="${i}" class="${hidden ? 'on' : ''}" ${hidden ? 'disabled' : ''}>Hidden</button></div></label>`;
  }
  const deleteRow = (g, i) => `<div class="danger-zone"><button class="btn danger sm" data-act="del-post" data-group="${g}" data-i="${i}">Delete this post</button></div>`;
  function orderBar(g) {
    const custom = modeOf(g) === 'custom';
    return `<div class="order-bar">
      <span class="order-label">Order on the site</span>
      <div class="seg">
        <button data-act="order-mode" data-group="${g}" data-value="latest" class="${custom ? '' : 'on'}">Newest first</button>
        <button data-act="order-mode" data-group="${g}" data-value="custom" class="${custom ? 'on' : ''}">Custom order</button>
      </div>
      <em>${custom ? 'Drag ⠿ or use ↑ ↓ to arrange. The site shows exactly this order.' : 'Sorted automatically by date. Choose Custom order to arrange posts yourself.'}</em>
    </div>`;
  }
  function dateNote(item) {
    const d = latestDate(item);
    return d ? `<span class="date-pill">${monthLabel(d)}</span>` : '<span class="warn">No date</span>';
  }

  // ---------------- render ----------------
  function render() {
    $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const panel = $('#panel');
    panel.innerHTML = tab === 'apps' ? renderApps() : tab === 'videos' ? renderVideos() : tab === 'inquiries' ? renderInquiries() : renderProfile();
  }

  function renderInquiries() {
    const when = (d) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const reply = (q) => `mailto:${encodeURIComponent(q.email)}?subject=${encodeURIComponent('Re: P STUDIO inquiries')}`;
    const items = inquiries.map((q) => `
      <article class="card inquiry-msg">
        <div class="inq-head">
          <div><b>${esc(q.name)}</b> <a href="${esc(reply(q))}">${esc(q.email)}</a></div>
          <span class="inq-date">${esc(when(q.date))}</span>
        </div>
        <p class="inq-text">${esc(q.message)}</p>
        <div class="inq-actions">
          <a class="btn ghost sm" href="${esc(reply(q))}">Reply by email</a>
          <button class="btn ghost sm" data-act="del-inquiry" data-id="${esc(q.id)}">Delete</button>
        </div>
      </article>`).join('');
    return `<div class="panel-head"><div><h1>Contact <span class="t">inquiries</span></h1><p>Messages sent through the form on your site, newest first. Each one is also emailed to you when email is set up.</p></div>
        <button class="btn ghost sm" data-act="reload-inquiries">Refresh</button></div>
      <div class="list">${items || '<div class="hint">No messages yet.</div>'}</div>`;
  }

  function renderApps() {
    const ids = groupIdx('apps');
    const items = ids.map((i, pos) => {
      const a = data.apps[i];
      const p = `apps.${i}`;
      a.source ||= a.file ? 'file' : a.url ? 'url' : 'file';
      const src = a.source === 'url' ? a.url : a.file;
      return `<details class="item ${a.hidden ? 'is-hidden' : ''}" data-id="${a.id}" data-group="apps" data-i="${i}" ${openIds.has(a.id) ? 'open' : ''}>
        <summary>
          <span class="pos">${pos + 1}</span>
          <div class="thumb" style="${a.thumbnail ? `background-image:url('${esc(a.thumbnail)}')` : ''}">${a.thumbnail ? '' : esc((a.title || '?')[0])}</div>
          <div><div class="sum-title"><span data-live="${p}.title">${esc(a.title || 'Untitled')}</span>${a.hidden ? '<span class="badge hidden-badge">Hidden</span>' : ''}</div>
          <div class="sum-sub">${dateNote(a)} ${src ? esc(src) : '<span class="warn">No app file yet</span>'}</div></div>
          ${itemActions('apps', i, pos, ids.length)}
        </summary>
        <div class="item-body">
          ${visibilityRow('apps', i)}
          <div class="row">${field('Title', `${p}.title`)}${datePicker(`${p}.date`, { label: 'Posted' })}</div>
          ${addressField(p, a, '/app/')}
          ${field('Description', `${p}.description`, { area: true })}
          ${field('Tags', `${p}.tags`, { format: 'csv', hint: 'comma separated, used as filters', placeholder: 'Generative, 3D, Game' })}
          <label class="f"><span>App source</span>${seg(`${p}.source`, [['file', 'Upload .html'], ['paste', 'Paste code'], ['url', 'External URL']])}</label>
          ${a.source === 'url' ? field('App URL', `${p}.url`, { type: 'url', hint: 'must allow embedding in an iframe', placeholder: 'https://…' }) : ''}
          ${a.source === 'file' ? `<div>
              ${a.file ? `<div class="file-pill">Current file: <a href="${esc(a.file)}" target="_blank">${esc(a.file)}</a></div>` : ''}
              <div style="margin-top:10px"><span class="btn ghost sm upload-btn">${a.file ? 'Replace' : 'Upload'} .html file<input type="file" accept=".html,.htm,text/html" data-upload="app" data-target="${p}.file"></span></div>
              <p class="hint" style="margin-top:8px">A single self-contained HTML file (inline CSS/JS, or CDN links). Ask Claude to "export this as a single HTML file" if your piece is React.</p>
            </div>` : ''}
          ${a.source === 'paste' ? `<div>
              <textarea id="paste-${a.id}" style="min-height:180px;font-family:Consolas,monospace;font-size:12px" placeholder="<!doctype html>…  paste the full HTML from Claude here"></textarea>
              <div style="margin-top:10px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><button class="btn primary sm" data-act="paste" data-i="${i}">Use this code</button>
              ${a.file ? `<span class="file-pill">Current: <a href="${esc(a.file)}" target="_blank">${esc(a.file)}</a></span>` : ''}</div>
            </div>` : ''}
          ${mediaField('Thumbnail', `${p}.thumbnail`, { size: 'thumbnail', hint: 'optional — without one, the card shows a live mini-preview' })}
          ${src ? `<div><a class="btn ghost sm" href="${esc(src)}" target="_blank">Preview app ↗</a></div>` : ''}
          ${deleteRow('apps', i)}
        </div>
      </details>`;
    }).join('');
    return `<div class="panel-head"><div><h1>Interactive <span class="t">Lab</span></h1><p>Your single-page animations and interactive apps. The number on each post is its position on the site.</p></div></div>
      ${orderBar('apps')}
      <div class="list">${items}</div>
      <button class="btn add" data-act="add-app">+ Add interactive piece</button>`;
  }

  function renderVideos() {
    const section = (g) => {
      const ids = groupIdx(g);
      return ids.map((i, pos) => videoItem(g, i, pos, ids.length)).join('') || '<div class="hint">Nothing here yet.</div>';
    };
    return `<div class="panel-head"><div><h1>AI <span class="t">Films</span></h1><p>Series, Shorts, Motions and Commercials each have their own order. Paste a YouTube, Instagram or Facebook video link. The number on each post is its position on the site.</p></div></div>
      <h2 class="group-head">Series</h2>
      ${orderBar('series')}
      <div class="list">${section('series')}</div>
      <button class="btn add" data-act="add-video" data-type="series">+ Add series</button>
      <h2 class="group-head">Shorts</h2>
      ${orderBar('shorts')}
      <div class="list">${section('shorts')}</div>
      <button class="btn add" data-act="add-video" data-type="single">+ Add short</button>
      <h2 class="group-head">Motions</h2>
      ${orderBar('motions')}
      <div class="list">${section('motions')}</div>
      <button class="btn add" data-act="add-video" data-type="motion">+ Add motion</button>
      <h2 class="group-head">Commercials</h2>
      ${orderBar('commercials')}
      <div class="list">${section('commercials')}</div>
      <button class="btn add" data-act="add-video" data-type="commercial">+ Add commercial</button>`;
  }

  function videoItem(g, i, pos, len) {
    {
      const v = data.videos[i];
      const p = `videos.${i}`;
      const isSeries = v.type === 'series';
      const eps = v.episodes || [];
      const thumb = v.cover || v.poster || (isSeries ? eps[0]?.thumb : '') || videoThumb(isSeries ? eps[0]?.youtube : v.youtube, 'mqdefault', v.title);
      const kind = videoKind(v.youtube);
      const sub = isSeries ? `${eps.length} episode${eps.length === 1 ? '' : 's'}` : (kind ? ({ instagram: 'Instagram post', facebook: 'Facebook video', youtube: 'YouTube video' }[kind]) : '<span class="warn">No video link yet</span>');
      return `<details class="item ${v.hidden ? 'is-hidden' : ''}" data-id="${v.id}" data-group="${g}" data-i="${i}" ${openIds.has(v.id) ? 'open' : ''}>
        <summary>
          <span class="pos">${pos + 1}</span>
          <div class="thumb" style="${thumb ? `background-image:url('${esc(thumb)}')` : ''}"></div>
          <div><div class="sum-title"><span data-live="${p}.title">${esc(v.title || 'Untitled')}</span><span class="badge">${isSeries ? 'Series' : { commercial: 'Commercial', motion: 'Motion' }[v.type] || 'Short'}</span>${v.hidden ? '<span class="badge hidden-badge">Hidden</span>' : ''}</div>
          <div class="sum-sub">${dateNote(v)} ${sub}</div></div>
          ${itemActions(g, i, pos, len)}
        </summary>
        <div class="item-body">
          ${visibilityRow(g, i)}
          <label class="f"><span>Type</span>${seg(`${p}.type`, [['single', 'Short'], ['motion', 'Motion'], ['commercial', 'Commercial'], ['series', 'Series (episodes)']])}</label>
          <div class="row">${field(isSeries ? 'Series title' : 'Title', `${p}.title`)}${datePicker(`${p}.date`, { label: isSeries ? 'Series started' : 'Posted', hint: isSeries ? 'optional — the series sorts by its newest episode' : '' })}</div>
          ${addressField(p, v, isSeries ? '/series/' : '/film/')}
          ${field('Description', `${p}.description`, { area: true })}
          ${isSeries ? '' : ytField(`${p}.youtube`)}
          ${mediaField('Cover image', `${p}.cover`, { size: 'cover', hint: 'wide banner on the detail page — defaults to the YouTube thumbnail' })}
          ${isSeries ? mediaField('Poster', `${p}.poster`, { size: 'poster', hint: 'portrait image for the Series Library card — optional' }) : ''}
          ${galleryField(`${p}.images`, v.images || [])}
          ${isSeries ? `<label class="f"><span>Episodes</span></label>
            <div class="episodes">${eps.map((e, j) => {
              const ep = `${p}.episodes.${j}`;
              return `<div class="episode">
                <div class="num">${j + 1}</div>
                <div class="ep-thumb-col">
                  <div class="ep-thumb" ${e.thumb ? '' : `data-thumb-for="${ep}.youtube"`} style="background-image:url('${esc(e.thumb || videoThumb(e.youtube, 'mqdefault', e.title))}')"></div>
                  <span class="upload-btn ep-thumb-btn">${e.thumb ? 'Change' : 'Thumbnail'}<input type="file" accept="image/*" data-upload="image" data-target="${ep}.thumb" data-size="cover"></span>
                  ${e.thumb ? `<button class="ep-thumb-btn" data-act="clear" data-path="${ep}.thumb">Remove</button>` : ''}
                </div>
                <div class="ep-fields">
                  <div class="ep-head"><input type="text" data-bind="${ep}.title" value="${esc(e.title)}" placeholder="Episode title">${datePicker(`${ep}.date`, { compact: true })}</div>
                  <input type="url" data-bind="${ep}.youtube" value="${esc(e.youtube)}" placeholder="YouTube, Instagram or Facebook link">
                  <div class="link-status" data-status-for="${ep}.youtube">${linkStatus(e.youtube, !!e.thumb)}</div>
                  ${igModeField(`${ep}.youtube`, e, !!(e.thumb || v.cover), 'Thumbnail')}
                  <textarea data-bind="${ep}.description" placeholder="Episode description (optional)" style="min-height:54px">${esc(e.description)}</textarea>
                </div>
                <div class="ep-actions">
                  <button class="icon" data-act="move" data-list="${p}.episodes" data-i="${j}" data-dir="-1" title="Move up">↑</button>
                  <button class="icon" data-act="move" data-list="${p}.episodes" data-i="${j}" data-dir="1" title="Move down">↓</button>
                  <button class="icon del" data-act="del" data-list="${p}.episodes" data-i="${j}" title="Delete episode">✕</button>
                </div>
              </div>`;
            }).join('')}</div>
            <button class="btn add" data-act="add-ep" data-path="${p}.episodes">+ Add episode</button>` : ''}
          ${deleteRow(g, i)}
        </div>
      </details>`;
    }
  }

  function galleryField(path, images) {
    return `<label class="f"><span>Images <em>— behind the scenes, posters, stills (shown on the detail page)</em></span></label>
      ${sizeNote('gallery')}
      <div class="gallery-edit">${images.map((im, k) => `
        <div class="g-item">
          <a class="g-img" href="${esc(im.src)}" target="_blank" style="background-image:url('${esc(im.src)}')"></a>
          <input type="text" data-bind="${path}.${k}.caption" value="${esc(im.caption)}" placeholder="Caption (optional)">
          <div class="g-actions">
            <button class="icon" data-act="move" data-list="${path}" data-i="${k}" data-dir="-1" title="Move left">←</button>
            <button class="icon" data-act="move" data-list="${path}" data-i="${k}" data-dir="1" title="Move right">→</button>
            <button class="icon del" data-act="del" data-list="${path}" data-i="${k}" title="Remove">✕</button>
          </div>
        </div>`).join('')}
        <span class="g-add upload-btn">+ Add images<input type="file" accept="image/*" multiple data-upload-many="${path}"></span>
      </div>`;
  }

  // what a pasted video link is recognised as
  function linkStatus(url, hasThumb = true) {
    if (!url) return '';
    const k = videoKind(url);
    if (k === 'youtube') return '<span class="ok">✓ YouTube video</span>';
    if (k === 'instagram') return '<span class="ok">✓ Instagram post</span>' + (hasThumb ? '' : ' <span class="hint">Instagram has no automatic thumbnail, so add your own image</span>');
    if (k === 'facebook') return '<span class="ok">✓ Facebook video</span>' + (hasThumb ? '' : ' <span class="hint">Facebook has no automatic thumbnail, so add your own image. The video must be public.</span>');
    return '<span class="warn">Not a YouTube, Instagram or Facebook video link</span>';
  }

  function ytField(path) {
    const v = getPath(path) || '';
    const item = getPath(path.replace(/\.youtube$/, '')) || {};
    return `<label class="f"><span>Video link <em>— YouTube, Instagram post/reel, or public Facebook video</em></span>
      <div class="media-field"><div class="preview" data-thumb-for="${path}" style="background-image:url('${esc(videoThumb(v, 'mqdefault', item.title))}')"></div>
      <div class="grow"><input type="url" data-bind="${path}" value="${esc(v)}" placeholder="YouTube, Instagram or Facebook video link">
      <div class="link-status" data-status-for="${path}">${linkStatus(v, !!item.cover)}</div>
      ${igModeField(path, item, !!item.cover, 'Cover image')}</div></div></label>`;
  }

  // Instagram & Facebook: play the platform's embed on the site, or show your own cover that opens the post there
  // (Instagram can put its "View more" bar across a video; Facebook refuses to embed reels with licensed music)
  function igModeField(linkPath, item, hasImage, imageName) {
    const kind = videoKind(item.youtube);
    if (kind !== 'instagram' && kind !== 'facebook') return '';
    const name = kind === 'instagram' ? 'Instagram' : 'Facebook';
    const base = linkPath.replace(/\.youtube$/, '');
    const link = item.igMode === 'link';
    const why = kind === 'instagram'
      ? 'If Instagram puts its bar over the video, choose Open on Instagram.'
      : 'If the site shows "Unavailable… content owned by someone else" (usually licensed music), choose Open on Facebook.';
    return `<div class="ig-mode">
      <div class="seg">
        <button data-act="set" data-path="${base}.igMode" data-value="embed" class="${link ? '' : 'on'}">Play on my site</button>
        <button data-act="set" data-path="${base}.igMode" data-value="link" class="${link ? 'on' : ''}">Open on ${name}</button>
      </div>
      <span class="hint">${link
        ? `Shows your ${imageName.toLowerCase()} with a play button; clicking opens the post on ${name}.${hasImage ? '' : ` <span class="warn">Add a ${imageName.toLowerCase()} first.</span>`}`
        : `Plays ${name}'s player here. ${why}`}</span>
    </div>`;
  }

  function renderProfile() {
    const handle = igHandle(data.site.instagram.username);
    return `<div class="panel-head"><div><h1>Profile &amp; <span class="t">contact</span></h1><p>Hero text, Instagram profile and contact details.</p></div></div>
      <div class="card"><h2>Homepage</h2>
        ${field('Hero tagline', 'site.tagline', { placeholder: 'Interactive experiments & AI-made films.' })}
        ${field('Running text', 'site.marquee', { area: true, format: 'lines', hint: 'the scrolling strip under the hero, one item per line', placeholder: 'Interactive\nAnimation\nAI Films' })}
      </div>
      <div class="card"><h2>Instagram</h2>
        <div class="row">
          ${field('Instagram username', 'site.instagram.username', { placeholder: 'yourhandle', hint: handle ? `DM link: ig.me/m/${esc(handle)}` : '' })}
          ${field('Display name', 'site.instagram.displayName')}
        </div>
        ${field('Bio', 'site.instagram.bio', { area: true })}
        ${mediaField('Profile photo', 'site.instagram.avatar', { round: true, size: 'avatar' })}
        ${field('Featured posts', 'site.instagram.posts', { area: true, format: 'lines', hint: 'one Instagram post/reel URL per line — shown as embeds', placeholder: 'https://www.instagram.com/p/XXXXXXXX/' })}
      </div>
      <div class="card"><h2>Search &amp; sharing</h2>
        <p class="hint" style="margin:-4px 0 14px">What Google shows for your home page, and the preview when someone shares your link. Every post already gets its own title, description and cover automatically.</p>
        ${field('Website address', 'site.seo.url', { type: 'url', placeholder: 'https://pstudio.com', hint: 'your final domain, used in Google and share links' })}
        ${field('Page title', 'site.seo.title', { placeholder: 'P STUDIO — Interactive experiments & AI-made films', hint: 'about 50–60 characters' })}
        ${field('Description', 'site.seo.description', { area: true, placeholder: 'AI films, series and interactive pieces by P STUDIO.', hint: 'about 150 characters, shown under the title in Google' })}
        ${mediaField('Share image', 'site.seo.image', { size: 'share', hint: 'if empty, the newest video cover is used' })}
      </div>
      <div class="card"><h2>Contact</h2>
        ${field('Contact text', 'site.contactText', { placeholder: 'Collaborations, commissions or just saying hi — my DMs are open.' })}
        ${field('Email', 'site.email', { type: 'email', hint: 'optional' })}
      </div>
      <div class="card"><h2>Import content</h2>
        <p class="hint" style="margin:-4px 0 14px">Copy everything from another copy of this site, for example your computer, onto this one: choose its <b>storage</b> folder. Posts, settings, images and apps are copied, and contact messages are added to the ones here. The current posts and settings are replaced; the previous version is kept in the backups.</p>
        <span class="btn ghost sm upload-btn">Choose storage folder…<input type="file" id="import-folder" webkitdirectory directory multiple></span>
        <div class="import-status" id="import-status"></div>
      </div>`;
  }

  // ---------------- import a storage folder ----------------
  // The folder is sent one file at a time (images and apps first, content.json last), so a big folder
  // never hits the upload size limit and the site only switches to the new content once its images are there.
  async function importFolder(fileList) {
    const status = $('#import-status');
    const all = [...fileList];
    // the folder that holds content.json is the storage folder, whichever folder was picked
    const contentFile = all.filter((f) => /(^|\/)content\.json$/.test(f.webkitRelativePath))
      .sort((a, b) => a.webkitRelativePath.split('/').length - b.webkitRelativePath.split('/').length)[0];
    if (!contentFile) return toast('No content.json in that folder. Choose the folder named "storage".', true);
    const root = contentFile.webkitRelativePath.replace(/content\.json$/, '');
    const items = all.filter((f) => f.webkitRelativePath.startsWith(root)).map((f) => ({ f, rel: f.webkitRelativePath.slice(root.length) }))
      .filter(({ rel }) => /^(apps|uploads)\//.test(rel) || rel === 'inquiries.jsonl' || rel === 'content.json');
    const big = items.filter(({ f }) => f.size > 20 * 1024 * 1024);
    const files = items.filter((x) => !big.includes(x)).sort((a, b) => (a.rel === 'content.json') - (b.rel === 'content.json'));
    const mb = (files.reduce((n, { f }) => n + f.size, 0) / 1048576).toFixed(1);
    const ok = await confirmDialog({
      title: `Import ${files.length} files (${mb} MB)?`,
      message: 'Your posts and settings here are replaced by the imported ones; the current version is saved in the backups first. Images, apps and contact messages are added. Keep this page open until it finishes.',
      confirmLabel: 'Import',
    });
    if (!ok) return;
    const failed = big.map(({ rel }) => `${rel} (over 20 MB)`);
    let done = 0;
    const send = async ({ f, rel }) => {
      try { await api('/api/import', { method: 'POST', body: JSON.stringify({ path: rel, data: await fileToBase64(f) }) }); }
      catch (err) { failed.push(`${rel}: ${err.message}`); }
      done++;
      status.textContent = `Importing… ${done} of ${files.length}`;
    };
    const rest = files.filter(({ rel }) => rel !== 'content.json');
    for (let i = 0; i < rest.length; i += 3) await Promise.all(rest.slice(i, i + 3).map(send)); // 3 at a time
    if (failed.some((x) => x.startsWith('uploads/') || x.startsWith('apps/')) && !confirm(`${failed.length} file(s) could not be imported. Replace the posts anyway?`)) {
      status.textContent = `Stopped. Posts were not replaced. Not imported: ${failed.join(', ')}`;
      return;
    }
    await send(files.find(({ rel }) => rel === 'content.json'));
    status.textContent = failed.length ? `Finished, but not imported: ${failed.join(', ')}` : `Imported ${files.length} files.`;
    toast(failed.length ? 'Import finished with some problems' : 'Import finished', failed.length ? 'warn' : false);
    setDirty(false);
    await boot(); // show the imported posts
    tab = 'profile'; render();
    $('#import-status').textContent = status.textContent;
  }

  // ---------------- events ----------------
  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (!b) return;
    tab = b.dataset.tab; render(); scrollTo(0, 0);
    if (tab === 'inquiries') loadInquiries(); // pick up messages sent since the CMS was opened
  });

  const panel = $('#panel');

  panel.addEventListener('input', (e) => {
    const el = e.target.closest('[data-bind]');
    if (!el) return;
    setPath(el.dataset.bind, fromInput(el));
    setDirty(true);
    const live = $(`[data-live="${el.dataset.bind}"]`, panel);
    if (live) live.textContent = el.value || 'Untitled';
    const thumb = $(`[data-thumb-for="${el.dataset.bind}"]`, panel);
    if (thumb) thumb.style.backgroundImage = `url('${videoThumb(el.value, 'mqdefault')}')`;
    const status = $(`[data-status-for="${el.dataset.bind}"]`, panel);
    if (status) status.innerHTML = linkStatus(el.value, false);
  });
  // re-render on blur for image URL fields so previews refresh
  panel.addEventListener('change', (e) => {
    const part = e.target.closest('.date-pick select');
    if (part) {
      const box = part.closest('.date-pick');
      const [ny, nm] = thisMonth().split('-');
      let m = $('[data-part=m]', box).value, y = $('[data-part=y]', box).value;
      if (m || y) { m ||= nm; y ||= ny; } // picking one half fills the other with today
      setPath(box.dataset.date, m && y ? `${y}-${m}` : '');
      setDirty(true); render(); // re-sort
      return;
    }
    // image previews, and the Instagram display choice, refresh when a link field is left
    if (e.target.matches('input[type=url][data-bind]') && /avatar|thumbnail|cover|poster|youtube$/.test(e.target.dataset.bind)) render();
  });

  panel.addEventListener('toggle', (e) => {
    const d = e.target;
    if (!d.matches?.('details.item')) return;
    d.open ? openIds.add(d.dataset.id) : openIds.delete(d.dataset.id);
  }, true);

  panel.addEventListener('change', async (e) => {
    if (e.target.id === 'import-folder') {
      const input = e.target;
      if (dirty && !confirm('You have unsaved changes. They will be lost if you import now. Continue?')) { input.value = ''; return; }
      try { await importFolder(input.files); } catch (err) { toast(err.message, true); }
      input.value = '';
      return;
    }
    const many = e.target.closest('input[type=file][data-upload-many]');
    if (many && many.files.length) {
      const files = [...many.files].filter((f) => f.size <= 20 * 1024 * 1024);
      toast(`Uploading ${files.length} image${files.length > 1 ? 's' : ''}…`);
      try {
        const list = getPath(many.dataset.uploadMany) || [];
        const warnings = [];
        for (const file of files) {
          const w = await checkImage(file, 'gallery', true);
          if (w) warnings.push(`${file.name}: ${w}`);
          const small = await optimizeImage(file);
          const { path } = await api('/api/upload', { method: 'POST', body: JSON.stringify({ kind: 'image', name: small.name, data: await fileToBase64(small) }) });
          list.push({ src: path, caption: '' });
        }
        setPath(many.dataset.uploadMany, list);
        setDirty(true); render();
        if (warnings.length) toast(`Added. Heads up: ${warnings.join('; ')}. Remember to save.`, 'warn');
        else toast('Images added — remember to save');
      } catch (err) { toast(err.message, true); }
      return;
    }
    const input = e.target.closest('input[type=file][data-upload]');
    if (!input || !input.files[0]) return;
    const file = input.files[0];
    if (file.size > 20 * 1024 * 1024) return toast('File is larger than 20 MB', true);
    toast('Uploading…');
    try {
      const isImage = input.dataset.upload === 'image';
      const up = isImage ? await optimizeImage(file) : file;
      const b64 = await fileToBase64(up);
      const { path } = await api('/api/upload', { method: 'POST', body: JSON.stringify({ kind: input.dataset.upload, name: up.name, data: b64 }) });
      setPath(input.dataset.target, path);
      setDirty(true); render();
      const warning = isImage ? await checkImage(file, input.dataset.size, true) : '';
      const shrunk = up !== file ? ` Compressed ${sizeMB(file.size)} → ${sizeMB(up.size)}.` : '';
      if (warning) toast(`Uploaded.${shrunk} Heads up: ${warning}. Remember to save.`, 'warn');
      else toast(`Uploaded.${shrunk} Remember to save.`);
    } catch (err) { toast(err.message, true); }
  });

  panel.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    e.preventDefault();
    const act = b.dataset.act;

    // in custom order a new post goes to the top; in newest-first it sorts itself
    const addTo = (list, g, item) => (modeOf(g) === 'custom' ? list.unshift(item) : list.push(item));
    if (act === 'add-app') {
      const id = uid();
      addTo(data.apps, 'apps', { id, date: thisMonth(), title: 'New piece', description: '', tags: [], source: 'file', file: '', url: '', thumbnail: '' });
      openIds.add(id);
    } else if (act === 'add-video') {
      const id = uid();
      const series = b.dataset.type === 'series';
      const kind = b.dataset.type; // single | motion | commercial | series
      addTo(data.videos, { series: 'series', motion: 'motions', commercial: 'commercials' }[kind] || 'shorts', series
        ? { id, type: 'series', date: thisMonth(), title: 'New series', description: '', cover: '', poster: '', images: [], episodes: [{ id: uid(), date: thisMonth(), title: 'Episode 1', youtube: '', description: '' }] }
        : { id, type: kind, date: thisMonth(), title: { motion: 'New motion', commercial: 'New commercial' }[kind] || 'New short', description: '', youtube: '', cover: '', images: [] });
      openIds.add(id);
    } else if (act === 'add-ep') {
      const list = getPath(b.dataset.path);
      list.push({ id: uid(), date: thisMonth(), title: `Episode ${list.length + 1}`, youtube: '', description: '' });
    } else if (act === 'move') {
      const list = getPath(b.dataset.list);
      const i = +b.dataset.i, j = i + +b.dataset.dir;
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
    } else if (act === 'order-mode') {
      setMode(b.dataset.group, b.dataset.value);
    } else if (act === 'reorder') {
      const g = b.dataset.group, i = +b.dataset.i, dir = +b.dataset.dir;
      const ids = groupIdx(g);
      const to = ids[ids.indexOf(i) + dir];
      if (to === undefined) return;
      moveItem(g, i, to, dir > 0);
    } else if (act === 'del-post') {
      const list = GROUPS[b.dataset.group].arr();
      const item = list[+b.dataset.i];
      const isSeries = item.type === 'series';
      const n = item.episodes?.length || 0;
      const ok = await confirmDialog({
        title: `Delete "${item.title || 'Untitled'}"?`,
        message: (isSeries ? `This deletes the whole series and its ${n} episode${n === 1 ? '' : 's'}. ` : '') +
          'It disappears from the website when you press Save changes. To undo before saving, reload this page without saving.',
        confirmLabel: isSeries ? 'Delete series' : 'Delete post',
      });
      if (!ok) return;
      list.splice(+b.dataset.i, 1);
      openIds.delete(item.id);
      toast('Deleted. Press Save changes to update the site.');
    } else if (act === 'reload-inquiries') {
      return loadInquiries();
    } else if (act === 'del-inquiry') {
      const q = inquiries.find((x) => x.id === b.dataset.id);
      const ok = await confirmDialog({
        title: `Delete the message from ${q?.name || 'this sender'}?`,
        message: 'It is removed right away and cannot be undone. A copy you received by email stays in your inbox.',
        confirmLabel: 'Delete message',
      });
      if (!ok) return;
      try { await api(`/api/inquiries/${encodeURIComponent(b.dataset.id)}`, { method: 'DELETE' }); } catch (err) { return toast(err.message, true); }
      toast('Message deleted');
      return loadInquiries();
    } else if (act === 'toggle-hidden') {
      const item = GROUPS[b.dataset.group].arr()[+b.dataset.i];
      if (item.hidden) delete item.hidden; else item.hidden = true;
      toast(`${item.hidden ? 'Hidden' : 'Shown'}. Press Save changes to update the site.`);
    } else if (act === 'del') {
      const list = getPath(b.dataset.list);
      const item = list[+b.dataset.i];
      const isImage = 'src' in item;
      const ok = await confirmDialog({
        title: isImage ? 'Remove this image?' : `Delete episode "${item.title || 'Untitled'}"?`,
        message: 'It disappears from the website when you press Save changes.',
        confirmLabel: isImage ? 'Remove image' : 'Delete episode',
      });
      if (!ok) return;
      list.splice(+b.dataset.i, 1);
    } else if (act === 'set') {
      setPath(b.dataset.path, b.dataset.value);
      if (b.dataset.path.endsWith('.type')) {
        const v = getPath(b.dataset.path.replace(/\.type$/, ''));
        if (v.type === 'series' && !v.episodes?.length) v.episodes = v.youtube ? [{ id: uid(), title: v.title, youtube: v.youtube, description: '' }] : [{ id: uid(), date: thisMonth(), title: 'Episode 1', youtube: '', description: '' }];
        if (v.type !== 'series' && !v.youtube && v.episodes?.length) v.youtube = v.episodes[0].youtube;
      }
    } else if (act === 'clear') {
      setPath(b.dataset.path, '');
    } else if (act === 'paste') {
      const a = data.apps[+b.dataset.i];
      const code = $(`#paste-${a.id}`).value.trim();
      if (!code) return toast('Paste some HTML first', true);
      const html = /<html|<!doctype/i.test(code) ? code : `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${code}</body></html>`;
      try {
        const { path } = await api('/api/upload', { method: 'POST', body: JSON.stringify({ kind: 'app', name: (a.title || 'app') + '.html', data: textToBase64(html) }) });
        a.file = path; a.source = 'file';
        toast('Code saved as an app file — remember to save');
      } catch (err) { return toast(err.message, true); }
    } else return;

    setDirty(true);
    render();
  });

  // Big photos are shrunk to at most 2400 px on the long side and saved as WebP before uploading,
  // so the site stays fast. GIFs, SVGs and files that are already small are uploaded as they are.
  const MAX_EDGE = 2400;
  async function optimizeImage(file) {
    if (!/^image\/(jpeg|png|webp|avif)$/.test(file.type)) return file;
    let bmp;
    try { bmp = await createImageBitmap(file); } catch { return file; }
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 400 * 1024) { bmp.close?.(); return file; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/webp', 0.86));
    if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
  }
  const sizeMB = (n) => (n / 1048576).toFixed(1) + ' MB';

  function fileToBase64(file) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(',')[1]);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
  }
  function textToBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  // ---------------- drag to reorder (custom order only) ----------------
  let drag = null;
  const clearDrop = () => $$('.dragging, .drop-before, .drop-after', panel).forEach((x) => x.classList.remove('dragging', 'drop-before', 'drop-after'));
  panel.addEventListener('dragstart', (e) => {
    const h = e.target.closest?.('[data-drag]');
    if (!h) return;
    drag = { g: h.dataset.drag, i: +h.dataset.i };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', '');
    h.closest('details').classList.add('dragging');
  });
  panel.addEventListener('dragover', (e) => {
    if (!drag) return;
    const it = e.target.closest('details.item[data-group]');
    if (!it || it.dataset.group !== drag.g) return;
    e.preventDefault();
    const r = it.getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    $$('.drop-before, .drop-after', panel).forEach((x) => x.classList.remove('drop-before', 'drop-after'));
    it.classList.add(after ? 'drop-after' : 'drop-before');
  });
  panel.addEventListener('drop', (e) => {
    if (!drag) return;
    const it = e.target.closest('details.item[data-group]');
    if (!it || it.dataset.group !== drag.g) return;
    e.preventDefault();
    moveItem(drag.g, drag.i, +it.dataset.i, it.classList.contains('drop-after'));
    drag = null; clearDrop();
    setDirty(true); render();
  });
  panel.addEventListener('dragend', () => { drag = null; clearDrop(); });
  panel.addEventListener('click', (e) => { if (e.target.closest('.handle')) e.preventDefault(); }); // don't open/close the post

  // ---------------- confirmation dialog ----------------
  function confirmDialog({ title, message, confirmLabel = 'Delete' }) {
    const dlg = $('#dialog');
    $('#dlg-title').textContent = title;
    $('#dlg-msg').textContent = message;
    $('#dlg-ok').textContent = confirmLabel;
    dlg.hidden = false;
    $('#dlg-cancel').focus();
    return new Promise((resolve) => {
      const done = (v) => {
        dlg.hidden = true;
        $('#dlg-ok').onclick = $('#dlg-cancel').onclick = dlg.onclick = null;
        removeEventListener('keydown', onKey);
        resolve(v);
      };
      const onKey = (e) => { if (e.key === 'Escape') done(false); };
      $('#dlg-ok').onclick = () => done(true);
      $('#dlg-cancel').onclick = () => done(false);
      dlg.onclick = (e) => { if (e.target === dlg) done(false); };
      addEventListener('keydown', onKey);
    });
  }

  boot().catch((err) => toast(err.message, true));
})();
