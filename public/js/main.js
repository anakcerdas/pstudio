(() => {
  const { esc, ytEmbed, fbEmbed, fbUrl, dmLink, igHandle, monthLabel, latestDate, byLatest, videoThumb, videoKind, igUrl, detailPath, appPath, watchPath, parsePath, findByName } = window.PS;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(pointer: fine)').matches;
  const PLAY_ICON = '<svg viewBox="0 0 24 24"><path fill="currentColor" d="M7 4v16l13-8z"/></svg>';

  let content = { site: {}, apps: [], videos: [] };

  // ---------------- boot ----------------
  $('#year').textContent = $('#year2').textContent = new Date().getFullYear();
  $$('.hero-title .hl > span').forEach((el, i) => { el.style.animationDelay = `${0.15 + i * 0.07}s`; });

  // the server puts the content in the page; fetching it is only a fallback
  (window.__CONTENT__ ? Promise.resolve(window.__CONTENT__) : fetch('/api/content').then((r) => r.json()))
    .then((c) => { content = c; render(); })
    .catch(() => render())
    .finally(() => { initReveal(); route(); });

  // ---------------- data helpers ----------------
  // each section is newest first unless the CMS set it to a custom order
  const sortFor = (g, list) => (content.site?.order?.[g] === 'custom' ? list : byLatest(list));
  const allSeries = () => sortFor('series', (content.videos || []).filter((v) => v.type === 'series' && v.episodes?.length));
  const OWN_SECTION = ['series', 'commercial', 'motion']; // every other video type is a Short
  const allSingles = () => sortFor('shorts', (content.videos || []).filter((v) => !OWN_SECTION.includes(v.type) && v.youtube));
  const allMotions = () => sortFor('motions', (content.videos || []).filter((v) => v.type === 'motion' && v.youtube));
  const allCommercials = () => sortFor('commercials', (content.videos || []).filter((v) => v.type === 'commercial' && v.youtube));
  const kindLabel = (v) => ({ commercial: 'Commercial', motion: 'Motion graphics' }[v.type] || 'Short film');
  const sameKind = (v) => ({ series: allSeries, commercial: allCommercials, motion: allMotions }[v.type] || allSingles)();
  const kindPlural = (v) => ({ series: 'series', commercial: 'commercials', motion: 'motions' }[v.type] || 'shorts');
  const dateTag = (ym, prefix = '') => (ym ? `<div class="meta">${prefix}${monthLabel(ym)}</div>` : '');
  const findVideo = (id) => (content.videos || []).find((x) => x.id === id);
  function episodesOf(v) {
    if (v.type === 'series') return v.episodes || [];
    return [{ title: v.title, youtube: v.youtube, description: v.description }];
  }
  const firstYt = (v) => episodesOf(v)[0]?.youtube;
  // an Instagram-only series uses its poster rather than a placeholder banner
  const bannerOf = (v) => v.cover || (videoKind(firstYt(v)) === 'youtube' ? videoThumb(firstYt(v), 'maxresdefault') : v.poster || videoThumb(firstYt(v), '', v.title));
  const epThumb = (e, q = 'mqdefault') => e.thumb || videoThumb(e.youtube, q, e.title);
  const imgTag = (src, v, extra = '', alt = v.title) => `<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy" data-fallback="${esc(videoThumb(firstYt(v), 'hqdefault', v.title))}" ${extra}>`;
  const epCount = (v) => `${v.episodes.length} episode${v.episodes.length === 1 ? '' : 's'}`;
  function appSrc(a) { return (a.source === 'url' ? a.url : a.file || a.url) || ''; }

  // maxresdefault doesn't exist for every video — fall back to hqdefault
  function fixThumbs(root = document) {
    $$('img[data-fallback]:not([data-fx])', root).forEach((img) => {
      img.dataset.fx = 1;
      const fix = () => { if (img.dataset.fallback && img.src !== img.dataset.fallback) img.src = img.dataset.fallback; };
      img.addEventListener('error', fix);
      img.addEventListener('load', () => { if (img.naturalWidth <= 120 && /ytimg/.test(img.src)) fix(); });
      if (img.complete && img.naturalWidth && img.naturalWidth <= 120 && /ytimg/.test(img.src)) fix();
    });
  }

  // Covers can be landscape or portrait (9:16). Once an image loads, cards take its real shape
  // (--ar) and portrait images are shown whole instead of cropped into a wide box.
  // One entry per tag regardless of capitals; a capitalised spelling ("3D") beats an all-lowercase one ("3d")
  function uniqTags(list) {
    const seen = new Map();
    list.map((t) => String(t).trim()).filter(Boolean).forEach((t) => {
      const key = t.toLowerCase(), had = seen.get(key);
      if (!had || (had === key && t !== key)) seen.set(key, t);
    });
    return [...seen.values()];
  }

  function markShapes(root = document) {
    $$('img:not([data-shape])', root).forEach((img) => {
      img.dataset.shape = 1;
      const apply = () => {
        if (!img.naturalWidth) return;
        // YouTube's fallback thumbnail is 4:3 with black bars around a 16:9 frame
        const ar = /ytimg\.com/.test(img.src) ? 16 / 9 : img.naturalWidth / img.naturalHeight;
        img.classList.toggle('is-portrait', ar < 0.9);
        const card = img.closest('.video-card');
        if (card) card.style.setProperty('--ar', Math.min(Math.max(ar, 0.5625), 1.7778).toFixed(4));
        if (img.id === 'd-banner') img.parentElement.classList.toggle('is-portrait', ar < 0.9);
      };
      img.addEventListener('load', apply); // also re-runs when a YouTube fallback swaps the src
      if (img.complete) apply();
    });
  }

  // ---------------- render ----------------
  function render() {
    const site = content.site || {};
    if (site.tagline) $('#hero-tagline').textContent = site.tagline;
    if (site.contactText) $('#contact-text').textContent = site.contactText;
    const words = site.marquee?.length ? site.marquee : ['Interactive', 'Animation', 'AI Films', 'Made with Claude'];
    const strip = words.map((w) => `<span>${esc(w)}</span>`).join('');
    $('#marquee').innerHTML = strip.repeat(4);

    renderApps();
    renderSeries();
    renderSingles();
    renderMenus();
    renderConnect();
    fixThumbs();
    markShapes();
  }

  function renderApps() {
    const apps = sortFor('apps', content.apps || []);
    const grid = $('#app-grid');
    if (!apps.length) { grid.innerHTML = '<div class="empty">New interactive pieces coming soon.</div>'; return; }
    const tags = uniqTags(apps.flatMap((a) => a.tags || []));
    const label = new Map(tags.map((t) => [t.toLowerCase(), t]));
    const cardTags = (a) => uniqTags(a.tags || []).map((t) => label.get(t.toLowerCase()));

    grid.innerHTML = apps.map((a, i) => `
      <article class="app-card reveal hover-zoom" tabindex="0" data-id="${esc(a.id)}" data-href="${esc(appPath(a))}" data-tags="${esc((a.tags || []).join('|').toLowerCase())}" style="transition-delay:${(i % 3) * 0.08}s">
        <div class="app-thumb media">
          ${a.thumbnail
            ? `<img src="${esc(a.thumbnail)}" alt="${esc(a.title)}" loading="lazy">`
            : `<div class="placeholder">${esc((a.title || '?')[0])}</div><iframe class="live" data-src="${esc(appSrc(a))}" tabindex="-1" aria-hidden="true" sandbox="allow-scripts allow-same-origin" loading="lazy"></iframe>`}
          <span class="play-sq">${PLAY_ICON}</span>
        </div>
        <div class="app-info">
          ${dateTag(a.date)}
          <h3><a href="${esc(appPath(a))}" tabindex="-1">${esc(a.title)}</a></h3>
          <p>${esc(a.description)}</p>
          ${a.tags?.length ? `<div class="tags">${cardTags(a).map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
        </div>
      </article>`).join('');

    $$('.app-card', grid).forEach((card) => {
      const open = () => go(card.dataset.href);
      card.addEventListener('click', (e) => { if (!e.target.closest('a[href]')) open(); });
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      if (finePointer && !reduceMotion) addTilt(card);
    });

    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting && !e.target.src) e.target.src = e.target.dataset.src; });
    }, { rootMargin: '200px' });
    $$('iframe.live', grid).forEach((f) => io.observe(f));

    const row = $('#app-filters');
    if (tags.length < 2) { row.innerHTML = ''; return; }
    row.innerHTML = ['All', ...tags].map((t, i) => `<button class="chip${i ? '' : ' on'}" data-tag="${esc(i ? t.toLowerCase() : '')}">${esc(t)}</button>`).join('');
    row.onclick = (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      $$('.chip', row).forEach((c) => c.classList.toggle('on', c === chip));
      const tag = chip.dataset.tag;
      $$('.app-card', grid).forEach((c) => c.classList.toggle('hide', !!tag && !c.dataset.tags.split('|').includes(tag)));
    };
  }

  // series use the same tiles as the Interactive Lab (wide image, text below), on the home page and in "More series"
  function seriesCard(v, i, reveal = true) {
    return `<article class="app-card hover-zoom${reveal ? ' reveal' : ''}" tabindex="0" data-href="${esc(detailPath(v))}" style="transition-delay:${(i % 3) * 0.08}s">
        <div class="app-thumb media">${imgTag(bannerOf(v), v)}<span class="play-sq">${PLAY_ICON}</span></div>
        <div class="app-info">
          ${dateTag(latestDate(v), 'Updated ')}
          <h3><a href="${esc(detailPath(v))}" tabindex="-1">${esc(v.title)}</a></h3>
          <p>${esc(v.description)}</p>
          <div class="tags"><span class="tag">${epCount(v)}</span></div>
        </div>
      </article>`;
  }
  function wireSeriesCards(root) {
    $$('.app-card', root).forEach((card) => {
      const open = () => go(card.dataset.href);
      card.addEventListener('click', (e) => { if (!e.target.closest('a[href]')) open(); });
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
      if (finePointer && !reduceMotion) addTilt(card);
    });
  }

  function singleCard(v, i, reveal = true) {
    return `<article class="video-card hover-zoom${reveal ? ' reveal' : ''}" data-id="${esc(v.id)}" data-href="${esc(detailPath(v))}" tabindex="0" style="transition-delay:${(i % 3) * 0.08}s">
      <div class="media">${imgTag(v.cover || videoThumb(v.youtube, 'maxresdefault', v.title), v)}
        <button class="quick-play" data-play="${esc(v.id)}" aria-label="Play ${esc(v.title)}">${PLAY_ICON}</button>
      </div>
      ${dateTag(v.date)}
      <h4><a href="${esc(detailPath(v))}" tabindex="-1">${esc(v.title)}</a></h4>
      <p>${esc(v.description)}</p>
    </article>`;
  }

  function renderSeries() {
    const series = allSeries();
    const grid = $('#series-grid');
    if (!series.length) { grid.innerHTML = '<div class="empty">Series are on their way.</div>'; return; }
    grid.innerHTML = series.map((v, i) => seriesCard(v, i)).join('');
    wireSeriesCards(grid);
  }

  function renderSingles() {
    const singles = allSingles();
    $('#video-grid').innerHTML = singles.length
      ? singles.map((v, i) => singleCard(v, i, false)).join('')
      : '<div class="empty">Shorts are on their way.</div>';
    // Motions and Commercials only appear (section + menu links) once they have at least one video
    for (const [key, list] of [['motions', allMotions()], ['commercials', allCommercials()]]) {
      $('#' + key).hidden = !list.length;
      $$(`[data-nav="${key}"]`).forEach((a) => { a.hidden = !list.length; });
      $(`#${key === 'motions' ? 'motion' : 'commercial'}-grid`).innerHTML = list.map((v, i) => singleCard(v, i)).join('');
    }
  }


  // single cards: card → detail page, square play button → straight to the player
  document.addEventListener('click', (e) => {
    const play = e.target.closest('[data-play]');
    if (play) { e.preventDefault(); e.stopPropagation(); go(watchPath(findVideo(play.dataset.play))); return; }
    const card = e.target.closest('.video-card');
    if (card && !e.target.closest('a[href]')) go(card.dataset.href);
  });
  document.addEventListener('keydown', (e) => {
    const card = e.target.closest?.('.video-card');
    if (card && e.key === 'Enter' && e.target === card) go(card.dataset.href);
  });

  function renderMenus() {
    const series = allSeries();
    const items = series.map((v) => `<a class="dd-item" href="${esc(detailPath(v))}">${imgTag(bannerOf(v), v)}<div><b>${esc(v.title)}</b><small>${epCount(v)}${latestDate(v) ? ' · ' + monthLabel(latestDate(v)) : ''}</small></div></a>`).join('');
    $('#series-menu').innerHTML = `<div class="dd-label">Series library</div>${items || '<div class="dd-label">Coming soon</div>'}<a class="dd-all" href="#series">All series →</a>`;
    $('#menu-series').innerHTML = items;
  }

  function renderConnect() {
    const ig = content.site?.instagram || {};
    const handle = igHandle(ig.username) || 'instagram';
    $$('[data-dm]').forEach((a) => { a.href = dmLink(handle); });
    $('#ig-follow').href = $('#ig-handle').href = `https://instagram.com/${handle}`;
    $('#ig-handle').textContent = '@' + handle;
    $('#ig-name').textContent = ig.displayName || 'P STUDIO';
    $('#ig-bio').textContent = ig.bio || '';
    const av = $('#ig-avatar');
    if (ig.avatar) { av.src = ig.avatar; av.hidden = false; $('#ig-initial').hidden = true; }
    else { av.hidden = true; $('#ig-initial').hidden = false; $('#ig-initial').textContent = (ig.displayName || 'P')[0]; }
    const email = content.site?.email;
    $('#ig-email').textContent = email || '';
    if (email) $('#ig-email').href = `mailto:${email}`;

    const posts = (ig.posts || []).filter(Boolean);
    const feed = $('#ig-feed');
    if (!posts.length) {
      feed.innerHTML = `<div class="ig-feed-empty"><div><strong>Say <span class="t">hi</span> on Instagram.</strong>Fastest reply is a DM to @${esc(handle)}</div></div>`;
      return;
    }
    feed.innerHTML = posts.map((p) => {
      const url = p.split('?')[0].replace(/\/?$/, '/');
      return igCropped(url);
    }).join('');
    watchIgCrops(feed);
    processInstagram();
  }

  // Instagram's embed.js turns <blockquote class="instagram-media"> into a sized iframe
  function processInstagram() {
    if (window.instgrm) return window.instgrm.Embeds.process();
    if ($('#ig-embed-js')) return; // still loading; it processes every blockquote when ready
    const s = document.createElement('script');
    s.id = 'ig-embed-js'; s.async = true; s.src = 'https://www.instagram.com/embed.js';
    document.body.appendChild(s);
  }
  const igBlockquote = (url) => `<blockquote class="instagram-media" data-instgrm-permalink="${esc(url)}?utm_source=ig_embed" data-instgrm-version="14" style="background:#fff;border:0;margin:0 auto;max-width:500px;width:100%;min-width:280px"><a href="${esc(url)}" target="_blank" rel="noopener">View this post on Instagram</a></blockquote>`;

  // Instagram's embed ends with a fixed 154px strip: "View more on Instagram", the like/comment icons,
  // the likes line and "Add a comment". The frame is Instagram's own page, so it can't be restyled;
  // instead it's wrapped in a box that is that much shorter, cropping the strip off.
  const IG_FOOTER = 154;
  const igCropped = (url) => `<div class="ig-crop">${igBlockquote(url)}</div>`;
  function watchIgCrops(root) {
    $$('.ig-crop:not([data-watch])', root).forEach((box) => {
      box.dataset.watch = 1;
      const fit = new ResizeObserver(() => {
        const f = box.querySelector('iframe');
        if (f && f.offsetHeight > IG_FOOTER * 2) box.style.height = `${f.offsetHeight - IG_FOOTER}px`;
      });
      // embed.js swaps the blockquote for an iframe once it loads, then resizes it to fit the post
      const attach = () => {
        const f = box.querySelector('iframe');
        if (f && !f.dataset.fit) { f.dataset.fit = 1; fit.observe(f); }
      };
      new MutationObserver(attach).observe(box, { childList: true, subtree: true });
      attach();
    });
  }

  // ---------------- inquiry form ----------------
  const inquiry = $('#inquiry');
  inquiry.addEventListener('submit', async (e) => {
    e.preventDefault();
    const status = $('#inquiry-status');
    const btn = inquiry.querySelector('button[type="submit"]');
    const say = (msg, cls) => { status.textContent = msg; status.className = `inquiry-status ${cls || ''}`; };
    const f = Object.fromEntries(new FormData(inquiry));
    if (!f.name.trim()) return say('Please enter your name.', 'err');
    if (!inquiry.email.checkValidity() || !f.email.trim()) return say('Please enter a valid email address.', 'err');
    if (f.message.trim().length < 5) return say('Please write a message.', 'err');
    btn.disabled = true; say('Sending…');
    try {
      const r = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
      const res = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(res.error || 'Something went wrong. Please try again.');
      inquiry.reset();
      say("Thanks! Your message is on its way. I'll reply by email.", 'ok');
    } catch (err) {
      say(err.message === 'Failed to fetch' ? 'Could not connect. Please try again.' : err.message, 'err');
    } finally { btn.disabled = false; }
  });

  // ---------------- nav: dropdown + mobile menu ----------------
  const dd = $('#series-dd');
  const setDd = (open) => { dd.classList.toggle('open', open); $('.dd-btn', dd).setAttribute('aria-expanded', open); };
  if (finePointer) {
    dd.addEventListener('mouseenter', () => setDd(true));
    dd.addEventListener('mouseleave', () => setDd(false));
  }
  // with a mouse, hover already opened it — a click shouldn't toggle it shut again
  $('.dd-btn', dd).addEventListener('click', () => setDd(finePointer || !dd.classList.contains('open')));
  $('#series-menu').addEventListener('click', (e) => { if (e.target.closest('a')) setDd(false); });
  document.addEventListener('click', (e) => { if (!dd.contains(e.target)) setDd(false); });

  const menu = $('#menu');
  const setMenu = (open) => { menu.hidden = !open; document.body.classList.toggle('menu-open', open); syncLock(); };
  $('#burger').addEventListener('click', () => setMenu(menu.hidden));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });

  // ---------------- overlays + routing ----------------
  const appModal = $('#app-modal');
  const videoModal = $('#video-modal');
  const detail = $('#detail');
  let detailId = null;
  let currentVideo = null, currentEp = 0;

  function syncLock() {
    const any = !appModal.hidden || !videoModal.hidden || !detail.hidden || !menu.hidden || !$('#lightbox').hidden;
    document.body.classList.toggle('locked', any);
  }
  function show(el) {
    if (!el.hidden) return;
    el.hidden = false; syncLock();
    requestAnimationFrame(() => el.classList.add('open'));
  }
  function hide(el, after) {
    if (el.hidden) return;
    el.classList.remove('open');
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    setTimeout(() => { if (!el.classList.contains('open')) { el.hidden = true; after?.(); syncLock(); } }, 300);
  }
  const closeApp = () => hide(appModal, () => { $('#app-frame').src = 'about:blank'; });
  const closeVideo = () => hide(videoModal, () => { $('#video-frame').src = 'about:blank'; $('#ig-player').innerHTML = ''; $('#ig-player').dataset.url = ''; });
  const closeDetail = () => { detailId = null; hide(detail); };

  // ---------------- addresses ----------------
  // Each post has a real address (/series/…, /film/…, /app/…, /watch/…) that opens it over the home page.
  const homeTitle = document.title;
  function go(path, replace = false) {
    if (path !== location.pathname + location.hash) history[replace ? 'replaceState' : 'pushState'](null, '', path);
    route();
  }
  function clearHash() { go('/', true); }
  addEventListener('popstate', route);
  // links to posts open in place; menu links (#shorts…) on a post's address go back to the home page first
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target) return;
    const href = a.getAttribute('href');
    if (href.startsWith('/') && parsePath(href.split('#')[0])) { e.preventDefault(); go(href); return; }
    if (href.length > 1 && href.startsWith('#') && location.pathname !== '/') {
      e.preventDefault();
      go('/' + href);
      setTimeout(() => $(href)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' }), 320);
    }
  });

  function route() {
    // links shared before real addresses existed (#/series/id, #/video/id/0) still work
    const old = location.hash.match(/^#\/(app|series|video)\/([^/]+)(?:\/(\d+))?/);
    if (old) {
      const item = old[1] === 'app' ? (content.apps || []).find((x) => x.id === old[2]) : findVideo(old[2]);
      if (item) history.replaceState(null, '', old[1] === 'app' ? appPath(item) : old[1] === 'series' ? detailPath(item) : watchPath(item, Number(old[3]) || 0));
    }
    const r = parsePath(location.pathname) || {};
    const kind = { detail: 'series', watch: 'video', app: 'app' }[r.kind];
    const { ep } = r;
    setMenu(false);
    const item = kind ? findByName(kind === 'app' ? content.apps || [] : content.videos || [], r.key) : null;
    const id = item?.id;
    // an old or renamed address shows the post's current one
    if (item) {
      const canonical = kind === 'app' ? appPath(item) : kind === 'series' ? detailPath(item) : watchPath(item, ep);
      if (canonical !== location.pathname) history.replaceState(null, '', canonical);
    }
    document.title = item ? `${kind === 'video' && item.type === 'series' ? (item.episodes[ep]?.title || '') + ' — ' : ''}${item.title} · P STUDIO` : homeTitle;
    if (kind === 'app') {
      const a = item;
      if (!a) return clearHash();
      closeVideo();
      $('#app-modal-title').textContent = a.title;
      $('#app-newtab').href = appSrc(a);
      const f = $('#app-frame');
      if (f.getAttribute('src') !== appSrc(a)) f.src = appSrc(a);
      show(appModal);
    } else if (kind === 'series') {
      const v = findVideo(id);
      if (!v) return clearHash();
      closeApp(); closeVideo();
      if (detailId !== id) openDetail(v);
      show(detail);
    } else if (kind === 'video') {
      const v = findVideo(id);
      if (!v) return clearHash();
      closeApp();
      if (detailId && detailId !== id) closeDetail();
      playVideo(v, Number(ep) || 0);
      show(videoModal);
    } else {
      closeApp(); closeVideo(); closeDetail();
    }
  }

  // closing the player returns to the detail page it was opened from
  function closeTop() {
    if (!$('#lightbox').hidden) return closeLightbox();
    if (!videoModal.hidden && detailId) { go(detailPath(findVideo(detailId))); return; }
    clearHash();
  }

  // ---------------- detail page ----------------
  function openDetail(v) {
    detailId = v.id;
    const isSeries = v.type === 'series';
    const banner = $('#d-banner');
    banner.removeAttribute('data-fx');
    banner.parentElement.classList.remove('is-portrait'); // re-measured when the new image loads
    banner.src = bannerOf(v);
    banner.dataset.fallback = videoThumb(firstYt(v), 'hqdefault', v.title);
    const when = monthLabel(latestDate(v));
    $('#d-kicker').textContent = isSeries ? `Series · ${epCount(v)}${when ? ' · Updated ' + when : ''}` : `${kindLabel(v)}${when ? ' · ' + when : ''}`;
    $('#d-title').textContent = v.title;
    $('#d-crumb').textContent = kindPlural(v).replace(/^./, (c) => c.toUpperCase()) + ' / ' + v.title;
    $('#d-desc').textContent = v.description || '';
    $('#d-play span').textContent = isSeries ? 'Play episode 1' : 'Play film';

    $('#d-eps-sec').hidden = !isSeries;
    if (isSeries) {
      $('#d-eps').innerHTML = v.episodes.map((e, i) => `
        <button class="ep-row" data-ep="${i}">
          <span class="n">${String(i + 1).padStart(2, '0')}</span>
          <div class="media">${imgTag(epThumb(e), v, '', e.title)}</div>
          <div>${dateTag(e.date)}<h4>${esc(e.title)}</h4><p>${esc(e.description)}</p></div>
          <span class="go">${PLAY_ICON}</span>
        </button>`).join('');
    }

    const imgs = (v.images || []).filter((x) => x?.src);
    $('#d-gallery-sec').hidden = !imgs.length;
    $('#d-gallery').innerHTML = imgs.map((im, i) => `
      <figure data-lb="${i}"><div class="media"><img src="${esc(im.src)}" alt="${esc(im.caption)}" loading="lazy"></div>${im.caption ? `<figcaption>${esc(im.caption)}</figcaption>` : ''}</figure>`).join('');
    lbItems = imgs;

    const others = sameKind(v).filter((x) => x.id !== v.id);
    $('#d-more-sec').hidden = !others.length;
    $('#d-more-title').textContent = 'More ' + kindPlural(v);
    const more = $('#d-more');
    more.className = isSeries ? 'app-grid' : 'more-row';
    more.innerHTML = isSeries
      ? others.map((x, i) => seriesCard(x, i, false)).join('')
      : others.map((x, i) => singleCard(x, i, false)).join('');
    if (isSeries) wireSeriesCards(more);

    fixThumbs(detail);
    markShapes(detail);
    detail.scrollTop = 0;
  }

  $('#d-play').addEventListener('click', () => { if (detailId) go(watchPath(findVideo(detailId))); });
  $('#d-eps').addEventListener('click', (e) => {
    const row = e.target.closest('.ep-row');
    if (row) go(watchPath(findVideo(detailId), +row.dataset.ep));
  });
  $$('[data-close-detail]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); clearHash(); }));
  detail.addEventListener('scroll', () => {
    if (reduceMotion) return;
    const y = detail.scrollTop;
    $('#d-banner').style.transform = `translate3d(0, ${y * 0.35}px, 0) scale(${1 + y * 0.0002})`;
  }, { passive: true });

  // ---------------- lightbox ----------------
  let lbItems = [], lbIndex = 0;
  function openLightbox(i) {
    lbIndex = (i + lbItems.length) % lbItems.length;
    const it = lbItems[lbIndex];
    $('#lb-img').src = it.src;
    $('#lb-img').alt = it.caption || '';
    $('#lb-cap').textContent = it.caption || '';
    $('#lb-count').textContent = `${lbIndex + 1} / ${lbItems.length}`;
    $('#lb-prev').hidden = $('#lb-next').hidden = lbItems.length < 2;
    $('#lightbox').hidden = false; syncLock();
  }
  function closeLightbox() { $('#lightbox').hidden = true; syncLock(); }
  $('#d-gallery').addEventListener('click', (e) => {
    const f = e.target.closest('[data-lb]');
    if (f) openLightbox(+f.dataset.lb);
  });
  $('#lb-close').addEventListener('click', closeLightbox);
  $('#lb-prev').addEventListener('click', () => openLightbox(lbIndex - 1));
  $('#lb-next').addEventListener('click', () => openLightbox(lbIndex + 1));
  $('#lightbox').addEventListener('click', (e) => { if (e.target.classList.contains('lb-stage')) closeLightbox(); });

  // ---------------- video player ----------------
  function playVideo(v, ep) {
    const eps = episodesOf(v);
    ep = Math.min(Math.max(ep, 0), eps.length - 1);
    const e = eps[ep];
    currentVideo = v; currentEp = ep;
    const isSeries = v.type === 'series';
    $('#video-modal-title').textContent = v.title;
    const posted = monthLabel(isSeries ? e.date : v.date);
    $('#video-ep-label').textContent = (isSeries ? `Episode ${ep + 1} of ${eps.length}` : kindLabel(v)) + (posted ? ` · ${posted}` : '');
    $('#video-ep-title').textContent = isSeries ? e.title : v.title;
    $('#video-ep-desc').textContent = (isSeries ? e.description : v.description) || '';
    const f = $('#video-frame');
    const igBox = $('#ig-player');
    const kind = videoKind(e.youtube);
    const isIg = kind === 'instagram';
    // "Open on Instagram / Facebook": your own cover with a play button that links to the post, no embedded
    // player (for posts the platform won't play properly or at all on other sites)
    const igLink = (isIg || kind === 'facebook') && (isSeries ? e : v).igMode === 'link';
    $('#video-frame-wrap').classList.toggle('is-ig', isIg && !igLink);
    $('#video-frame-wrap').classList.toggle('is-iglink', igLink);
    igBox.hidden = !isIg || igLink;
    $('#ig-link').hidden = !igLink;
    $('#video-source').hidden = !isIg || igLink;
    if (igLink) {
      $('#ig-link').href = isIg ? igUrl(e.youtube) : fbUrl(e.youtube);
      $('#ig-link-label').textContent = isIg ? 'Watch on Instagram ↗' : 'Watch on Facebook ↗';
      $('#ig-link-img').src = (isSeries ? e.thumb || v.cover : v.cover || v.poster) || videoThumb(e.youtube, '', isSeries ? e.title : v.title);
      if (f.getAttribute('src') !== 'about:blank') f.src = 'about:blank';
      igBox.innerHTML = ''; igBox.dataset.url = '';
    } else if (isIg) {
      const url = igUrl(e.youtube);
      $('#video-source').href = url;
      if (f.getAttribute('src') !== 'about:blank') f.src = 'about:blank';
      if (igBox.dataset.url !== url) {
        igBox.dataset.url = url;
        igBox.innerHTML = igCropped(url);
        watchIgCrops(igBox);
        processInstagram();
      }
      $('#video-frame-wrap').scrollTop = 0;
    } else {
      igBox.innerHTML = ''; igBox.dataset.url = '';
      const src = videoKind(e.youtube) === 'facebook' ? fbEmbed(e.youtube) : ytEmbed(e.youtube);
      if (f.getAttribute('src') !== src) f.src = src;
    }

    const srcLink = $('#video-source');
    srcLink.textContent = videoKind(e.youtube) === 'facebook' ? 'Open on Facebook ↗' : 'Open on Instagram ↗';
    if (kind === 'facebook' && !igLink) { srcLink.hidden = false; srcLink.href = fbUrl(e.youtube); }

    $('.video-body').classList.toggle('no-list', !isSeries);
    $('#video-nav').hidden = !isSeries;
    $('#ep-prev').disabled = ep === 0;
    $('#ep-next').disabled = ep === eps.length - 1;

    if (isSeries) {
      $('#episode-list').innerHTML = `<h4>Episodes</h4>` + eps.map((x, i) => `
        <button class="ep-item${i === ep ? ' active' : ''}" data-i="${i}">
          <img src="${esc(epThumb(x))}" alt="${esc(x.title)}" loading="lazy">
          <div><small>EP ${String(i + 1).padStart(2, '0')}${x.date ? ' · ' + monthLabel(x.date) : ''}</small><span>${esc(x.title)}</span></div>
        </button>`).join('');
      $('#episode-list .active')?.scrollIntoView({ block: 'nearest' });
      markShapes($('#episode-list'));
    }
  }
  $('#episode-list').addEventListener('click', (e) => {
    const b = e.target.closest('.ep-item');
    if (b && currentVideo) go(watchPath(currentVideo, +b.dataset.i));
  });
  $('#ep-prev').addEventListener('click', () => go(watchPath(currentVideo, currentEp - 1)));
  $('#ep-next').addEventListener('click', () => go(watchPath(currentVideo, currentEp + 1)));

  $('#app-reload').addEventListener('click', () => {
    const f = $('#app-frame'); const src = f.src; f.src = 'about:blank'; setTimeout(() => { f.src = src; }, 30);
  });
  $$('[data-close]').forEach((b) => b.addEventListener('click', closeTop));
  [appModal, videoModal].forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) closeTop(); }));
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.fullscreenElement) {
      if (windowFilled()) return setWindowFill(windowFilled(), false);
      if (!menu.hidden) return setMenu(false);
      if (!appModal.hidden || !videoModal.hidden || !detail.hidden || !$('#lightbox').hidden) closeTop();
    }
    if (!$('#lightbox').hidden && e.key === 'ArrowRight') openLightbox(lbIndex + 1);
    if (!$('#lightbox').hidden && e.key === 'ArrowLeft') openLightbox(lbIndex - 1);
  });

  // Fullscreen: real browser fullscreen where allowed. Where it isn't (iPhone Safari, some in-app
  // browsers that never answer the request), the player is stretched over the whole window instead.
  function setWindowFill(el, on) {
    el.classList.toggle('pseudo-fs', on);
    el.querySelector(':scope > .pfs-exit')?.remove();
    if (on) {
      const x = document.createElement('button');
      x.className = 'pfs-exit'; x.type = 'button'; x.textContent = 'Exit fullscreen ✕';
      x.addEventListener('click', (e) => { e.stopPropagation(); setWindowFill(el, false); });
      el.appendChild(x);
    }
  }
  const windowFilled = () => $('.pseudo-fs');
  $$('[data-fullscreen]').forEach((b) => b.addEventListener('click', () => {
    const el = document.getElementById(b.dataset.fullscreen);
    if (document.fullscreenElement) return document.exitFullscreen();
    if (el.classList.contains('pseudo-fs')) return setWindowFill(el, false);
    const request = el.requestFullscreen?.bind(el) || el.webkitRequestFullscreen?.bind(el);
    if (!request) return setWindowFill(el, true);
    let answered = false;
    const fallback = setTimeout(() => { if (!answered && !document.fullscreenElement) setWindowFill(el, true); }, 1200);
    Promise.resolve(request()).then(
      () => { answered = true; clearTimeout(fallback); },
      () => { answered = true; clearTimeout(fallback); setWindowFill(el, true); },
    );
  }));
  // if real fullscreen arrives late, drop the window-fill version
  document.addEventListener('fullscreenchange', () => { if (document.fullscreenElement) $$('.pseudo-fs').forEach((el) => setWindowFill(el, false)); });

  // ---------------- motion ----------------
  const nav = $('#nav');
  const navTargets = ['play', 'series', 'shorts', 'motions', 'commercials', 'connect'].map((id) => document.getElementById(id));
  function onScrollNav() {
    nav.classList.toggle('scrolled', scrollY > 40);
    const mid = innerHeight * 0.4;
    let active = null;
    navTargets.forEach((s) => { const r = s.getBoundingClientRect(); if (r.top < mid && r.bottom > mid) active = s.id; });
    $$('.nav-links > a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + active));
    $('.dd-btn').classList.toggle('active', active === 'series');
  }

  function initReveal() {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    $$('.reveal').forEach((el) => io.observe(el));
  }

  // parallax: hero layers follow mouse + scroll, section words and series covers drift on scroll
  let mx = 0, my = 0, tx = 0, ty = 0;
  function parallaxFrame() {
    requestAnimationFrame(parallaxFrame);
    if (document.body.classList.contains('locked')) return;
    tx += (mx - tx) * 0.06; ty += (my - ty) * 0.06;
    const sy = scrollY;
    if (sy < innerHeight * 1.2) {
      $$('[data-depth]').forEach((el) => {
        const d = parseFloat(el.dataset.depth);
        const rot = el.dataset.rotate ? ` rotate(${sy * 0.05 + tx * 20}deg)` : '';
        el.style.transform = `translate3d(${tx * d * 40}px, ${ty * d * 40 + sy * d * 0.25}px, 0)${rot}`;
      });
      const heroInner = $('.hero-inner');
      heroInner.style.transform = `translate3d(0, ${sy * 0.35}px, 0)`;
      heroInner.style.opacity = Math.max(0, 1 - sy / (innerHeight * 0.75));
    }
    $$('.bg-word').forEach((el) => {
      const r = el.parentElement.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      el.style.transform = `translate3d(${(r.top - innerHeight / 2) * 0.15}px, ${-r.top * 0.25}px, 0)`;
    });
    const talk = $('#connect');
    const tr = talk.getBoundingClientRect();
    if (tr.bottom > 0 && tr.top < innerHeight) {
      $$('[data-pdepth]', talk).forEach((el) => {
        const d = parseFloat(el.dataset.pdepth);
        const rot = el.dataset.rotate ? ` rotate(${-tr.top * 0.05 + tx * 20}deg)` : '';
        el.style.transform = `translate3d(${tx * d * 40}px, ${ty * d * 40 + tr.top * d * 0.2}px, 0)${rot}`;
      });
    }
  }
  if (!reduceMotion) {
    addEventListener('pointermove', (e) => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; }, { passive: true });
    requestAnimationFrame(parallaxFrame);
  }
  addEventListener('scroll', onScrollNav, { passive: true });
  onScrollNav();

  function addTilt(card) {
    card.addEventListener('pointermove', (e) => {
      card.style.transitionDelay = '0s';
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform = `perspective(900px) rotateY(${x * 5}deg) rotateX(${-y * 5}deg)`;
    });
    card.addEventListener('pointerleave', () => { card.style.transform = ''; });
  }

  // ---------------- drifting particle network (hero + "Let's talk") ----------------
  function netCanvas(cv, area) {
    const ctx = cv.getContext('2d');
    let w, h, dpr, pts = [];
    const mouse = { x: -9999, y: -9999 };

    function resize() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(130, (w * h) / 12000));
      pts = Array.from({ length: n }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3,
        s: Math.random() < 0.15 ? 3 : 1.5, teal: Math.random() < 0.55,
      }));
    }
    resize();
    addEventListener('resize', resize);
    area.addEventListener('pointermove', (e) => {
      const r = cv.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
    });
    area.addEventListener('pointerleave', () => { mouse.x = mouse.y = -9999; });

    let t = 0, visible = true;
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(cv);

    function frame() {
      if (!reduceMotion) requestAnimationFrame(frame);
      if (!visible || document.body.classList.contains('locked')) return;
      t += 0.003;
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        const ang = Math.sin(p.x * 0.004 + t) + Math.cos(p.y * 0.004 - t);
        p.vx += Math.cos(ang) * 0.012; p.vy += Math.sin(ang) * 0.012;
        const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy;
        if (d2 < 22000) { const f = (22000 - d2) / 22000; p.vx += dx * f * 0.004; p.vy += dy * f * 0.004; }
        p.vx *= 0.97; p.vy *= 0.97;
        p.x += p.vx; p.y += p.vy;
        if (p.x < -10) p.x = w + 10; if (p.x > w + 10) p.x = -10;
        if (p.y < -10) p.y = h + 10; if (p.y > h + 10) p.y = -10;
      }
      ctx.lineWidth = 1;
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i], b = pts[j];
          const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
          if (d2 < 13000) {
            ctx.strokeStyle = `rgba(41,177,172,${(1 - d2 / 13000) * 0.2})`;
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      for (const p of pts) {
        ctx.fillStyle = p.teal ? '#29B1AC' : 'rgba(255,255,255,.6)';
        ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s); // square particles — no soft glow
      }
    }
    frame();
  }
  netCanvas($('#hero-canvas'), $('#top'));
  netCanvas($('#connect-canvas'), $('#connect'));
})();
