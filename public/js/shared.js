// Helpers shared by the site, the admin panel and the server (page addresses, video links).
const PS = (typeof window !== 'undefined' ? window : globalThis).PS = {
  // Accepts any YouTube URL form (watch, youtu.be, shorts, embed, live) or a bare 11-char ID.
  ytId(input) {
    const s = String(input || '').trim();
    if (/^[\w-]{11}$/.test(s)) return s;
    const m = s.match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/|\/v\/)([\w-]{11})/);
    return m ? m[1] : '';
  },
  ytThumb(input, quality = 'hqdefault') {
    const id = PS.ytId(input);
    return id ? `https://i.ytimg.com/vi/${id}/${quality}.jpg` : '';
  },
  // vq=hd1080 asks YouTube to start in 1080p. YouTube treats it as a hint and may still pick a lower
  // quality on slow connections; viewers can change it in the player's settings.
  ytEmbed(input) {
    const id = PS.ytId(input);
    return id ? `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1&vq=hd1080` : '';
  },
  // Instagram post / reel / IGTV link → shortcode
  igPost(input) {
    const m = String(input || '').match(/instagram\.com\/(?:[\w.]+\/)?(?:p|reels?|tv)\/([\w-]+)/);
    return m ? m[1] : '';
  },
  igUrl(input) { const c = PS.igPost(input); return c ? `https://www.instagram.com/p/${c}/` : ''; },
  // Facebook video / reel / watch / share link → the link itself (Facebook's player takes the full URL)
  fbUrl(input) {
    const s = String(input || '').trim();
    return /(?:facebook\.com\/(?:[^/?#]+\/videos\/|watch\/?\?v=|reel\/|share\/[vr]\/|video\.php\?v=)|fb\.watch\/)/.test(s) ? s : '';
  },
  fbEmbed(input) {
    const u = PS.fbUrl(input);
    return u ? `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(u)}&show_text=false&autoplay=true&width=1280` : '';
  },
  videoKind(input) { return PS.ytId(input) ? 'youtube' : PS.igPost(input) ? 'instagram' : PS.fbUrl(input) ? 'facebook' : ''; },
  // thumbnail for any video link. Instagram has no public thumbnail URL, so it gets a flat placeholder.
  videoThumb(input, quality = 'hqdefault', title = '') {
    if (PS.ytId(input)) return PS.ytThumb(input, quality);
    if (PS.igPost(input)) return PS.igPlaceholder(title);
    if (PS.fbUrl(input)) return PS.igPlaceholder(title, 'FACEBOOK');
    return '';
  },
  igPlaceholder(title = '', label = 'INSTAGRAM') {
    const t = String(title).replace(/[&<>"]/g, '').toUpperCase(); const tt = t.length > 16 ? t.slice(0, 15).trim() + '…' : t; // short enough to fit a vertical crop
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#121415"/><rect x="0" y="0" width="14" height="720" fill="#29B1AC"/><rect x="560" y="200" width="160" height="160" fill="none" stroke="#29B1AC" stroke-width="10"/><circle cx="640" cy="280" r="40" fill="none" stroke="#29B1AC" stroke-width="10"/><rect x="684" y="222" width="14" height="14" fill="#29B1AC"/><text x="640" y="450" text-anchor="middle" font-family="Montserrat,Arial,sans-serif" font-size="28" letter-spacing="8" fill="#8b9496">${label}</text><text x="640" y="510" text-anchor="middle" font-family="Montserrat,Arial,sans-serif" font-weight="600" font-size="34" fill="#f2f4f4">${tt}</text></svg>`;
    return 'data:image/svg+xml,' + encodeURIComponent(svg).replace(/'/g, '%27');
  },
  igHandle(input) {
    return String(input || '').trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/[/?#].*$/, '');
  },
  dmLink(handle) { return `https://ig.me/m/${PS.igHandle(handle)}`; },
  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  // "Days Like These [あの日々]" → "days-like-these", "Café Noir" → "cafe-noir".
  // A title with no Latin letters at all keeps its own script ("괴력소녀").
  slug(s) {
    const clean = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
    const latin = clean(String(s || '').replace(/['’]/g, '').normalize('NFKD').replace(/\p{M}/gu, '').replace(/[^a-zA-Z0-9]+/g, ' '));
    return latin || clean(String(s || ''));
  },
  // Every post has a short web address name (`slug`), made from its title once and then kept, so renaming
  // a post never breaks its links. The server answers each address with that post's title, description and image.
  //   /series/<name>   a series          /film/<name>   a short, motion or commercial
  //   /app/<name>      an interactive piece            /watch/<name>[/<episode number>]   the player
  nameOf(x) { return x.slug || x.id; },
  detailPath(v) { return `/${v.type === 'series' ? 'series' : 'film'}/${encodeURIComponent(PS.nameOf(v))}`; },
  appPath(a) { return `/app/${encodeURIComponent(PS.nameOf(a))}`; },
  watchPath(v, ep = 0) { return `/watch/${encodeURIComponent(PS.nameOf(v))}${ep > 0 ? '/' + (ep + 1) : ''}`; },
  // the post an address points to: by its name, a name it used to have, or its ID (older links)
  findByName(list, key) {
    return list.find((x) => x.slug === key) || list.find((x) => (x.formerSlugs || []).includes(key)) || list.find((x) => x.id === key);
  },
  parsePath(pathname) {
    let m = /^\/(series|film|app)\/([^/]+)(?:\/[^/]*)?\/?$/.exec(pathname);
    if (m) return { kind: m[1] === 'app' ? 'app' : 'detail', key: decodeURIComponent(m[2]) };
    m = /^\/watch\/([^/]+)(?:\/(\d+))?\/?$/.exec(pathname);
    if (m) return { kind: 'watch', key: decodeURIComponent(m[1]), ep: Math.max(0, (Number(m[2]) || 1) - 1) };
    return null;
  },
  // Gives every video and app a unique address name. Names already saved keep priority, so a new post with
  // the same title becomes "<name>-2". With `before` (the saved content), a changed name is remembered in
  // formerSlugs so the old address keeps redirecting.
  ensureSlugs(c, before) {
    for (const key of ['videos', 'apps']) {
      const list = c[key] || [];
      const saved = new Map((before?.[key] || []).map((x) => [x.id, x.slug]));
      const keeps = (x) => !!x.slug && (before ? saved.get(x.id) === x.slug : true);
      // a name a post used before stays reserved for it, so its old links never lead to another post
      const owner = new Map();
      for (const x of list) [saved.get(x.id), ...(x.formerSlugs || [])].forEach((s) => s && !owner.has(s) && owner.set(s, x.id));
      const taken = new Set();
      const free = (name, x) => !taken.has(name) && (owner.get(name) ?? x.id) === x.id;
      for (const x of [...list.filter(keeps), ...list.filter((x) => !keeps(x))]) {
        const base = PS.slug(x.slug || '') || PS.slug(x.title) || x.id;
        let name = base;
        for (let n = 2; !free(name, x); n++) name = `${base}-${n}`;
        taken.add(name);
        const prev = saved.get(x.id);
        if (prev && prev !== name) x.formerSlugs = [...new Set([...(x.formerSlugs || []), prev])];
        if (x.formerSlugs) x.formerSlugs = x.formerSlugs.filter((s) => s !== name);
        x.slug = name;
      }
    }
    return c;
  },
  uid() { return Math.random().toString(36).slice(2, 10); },
  thisMonth() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; },
  // "2026-10" → "Oct 2026"
  monthLabel(ym) {
    const m = /^(\d{4})-(\d{2})/.exec(ym || '');
    return m ? new Date(+m[1], +m[2] - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '';
  },
  // a series counts as updated when its newest episode was posted
  latestDate(item) {
    return [item.date, ...(item.episodes || []).map((e) => e.date)].filter(Boolean).sort().pop() || '';
  },
  // newest first; within the same month, the most recently added comes first
  byLatest(list) {
    return list.map((x, i) => [x, i])
      .sort((a, b) => PS.latestDate(b[0]).localeCompare(PS.latestDate(a[0])) || b[1] - a[1])
      .map(([x]) => x);
  },
};
if (typeof module !== 'undefined') module.exports = PS;
