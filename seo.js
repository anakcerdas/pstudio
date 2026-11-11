// Search & sharing: every page address gets its own <title>, description, share image (Open Graph /
// Twitter), canonical link and structured data, plus /sitemap.xml and /robots.txt. The site's content
// is also placed in the page itself, so it shows without waiting for a second request.
const PS = require('./public/js/shared.js');

const listedVideo = (v) => (v.type === 'series' ? !!v.episodes?.length : !!v.youtube);
const monthToDate = (ym) => (/^\d{4}-\d{2}$/.test(ym || '') ? `${ym}-01` : '');
const clip = (s, n = 160) => { const t = String(s || '').replace(/[\s\p{Cc}]+/gu, ' ').trim(); return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t; };
const attr = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function baseUrl(req, site) {
  const set = String(site.seo?.url || '').trim().replace(/\/+$/, '');
  if (/^https?:\/\//.test(set)) return set;
  const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0];
  return `${proto}://${req.headers.host || 'localhost'}`;
}
// a share image must be a real JPG/PNG/WebP URL (the Instagram/Facebook placeholders are generated SVGs)
function absImage(base, src) {
  if (!src || /^data:/.test(src) || /\.svg(\?|$)/i.test(src)) return '';
  return /^https?:\/\//.test(src) ? src : base + (src.startsWith('/') ? '' : '/') + src;
}
const ytImage = (link) => (PS.ytId(link) ? PS.ytThumb(link, 'hqdefault') : '');
const videoImage = (v) => v.cover || v.poster || ytImage(v.type === 'series' ? v.episodes?.[0]?.youtube : v.youtube);

function siteInfo(c) {
  const site = c.site || {};
  const seo = site.seo || {};
  const name = 'P STUDIO';
  const firstImage = (c.videos || []).filter(listedVideo).map(videoImage).find(Boolean) || '';
  return {
    name,
    title: seo.title || (site.tagline ? `${name} — ${site.tagline}` : name),
    description: clip(seo.description || site.tagline || 'Interactive experiments and AI-made films by P STUDIO.'),
    image: seo.image || firstImage,
    instagram: PS.igHandle(site.instagram?.username) ? `https://www.instagram.com/${PS.igHandle(site.instagram.username)}/` : '',
  };
}

// → { status, redirect } or { status, meta }
function resolvePage(pathname, c) {
  const info = siteInfo(c);
  if (pathname === '/') return { status: 200, meta: { title: info.title, description: info.description, image: info.image, path: '/', type: 'website', ld: homeLd(info) } };

  const route = PS.parsePath(pathname);
  if (!route) return { status: 404 };
  if (route.kind === 'app') {
    const a = PS.findByName(c.apps || [], route.key);
    if (!a) return { status: 404 };
    const canonical = PS.appPath(a);
    if (pathname !== canonical) return { status: 301, redirect: canonical };
    return { status: 200, meta: {
      title: `${a.title} — Interactive · ${info.name}`, description: clip(a.description || `${a.title}, an interactive piece by ${info.name}.`),
      image: a.thumbnail || info.image, path: canonical, type: 'website',
      ld: { '@context': 'https://schema.org', '@type': 'CreativeWork', name: a.title, description: a.description || undefined, dateCreated: monthToDate(a.date) || undefined, keywords: (a.tags || []).join(', ') || undefined, creator: org(info) },
    } };
  }

  const v = PS.findByName(c.videos || [], route.key);
  if (!v || !listedVideo(v)) return { status: 404 };
  const isSeries = v.type === 'series';
  const kind = isSeries ? 'Series' : { commercial: 'Commercial', motion: 'Motion graphics' }[v.type] || 'Short film';

  if (route.kind === 'detail') {
    const canonical = PS.detailPath(v);
    if (pathname !== canonical) return { status: 301, redirect: canonical };
    return { status: 200, meta: {
      title: `${v.title} — ${kind} · ${info.name}`, description: clip(v.description || `${v.title}, ${kind.toLowerCase()} by ${info.name}.`),
      image: videoImage(v) || info.image, path: canonical, type: isSeries ? 'video.tv_show' : 'video.other',
      ld: isSeries ? seriesLd(v, info) : videoLd(v, v, info),
    } };
  }

  // the player: one page per episode
  const eps = isSeries ? v.episodes : [v];
  if (route.ep >= eps.length) return { status: 301, redirect: PS.watchPath(v) };
  const canonical = PS.watchPath(v, route.ep);
  if (pathname !== canonical) return { status: 301, redirect: canonical };
  const e = eps[route.ep];
  const title = isSeries ? `${e.title || `Episode ${route.ep + 1}`} — ${v.title}` : v.title;
  return { status: 200, meta: {
    title: `Watch ${title} · ${info.name}`, description: clip(e.description || v.description || `${title} by ${info.name}.`),
    image: (isSeries ? e.thumb || ytImage(e.youtube) : '') || videoImage(v) || info.image, path: canonical, type: isSeries ? 'video.episode' : 'video.other',
    ld: videoLd(isSeries ? { ...e, date: e.date || v.date, title } : v, v, info),
  } };
}

const org = (info) => ({ '@type': 'Organization', name: info.name, sameAs: info.instagram ? [info.instagram] : undefined });
function homeLd(info) {
  return [
    { '@context': 'https://schema.org', '@type': 'WebSite', name: info.name, description: info.description },
    { '@context': 'https://schema.org', ...org(info) },
  ];
}
function seriesLd(v, info) {
  return { '@context': 'https://schema.org', '@type': 'TVSeries', name: v.title, description: v.description || undefined,
    numberOfEpisodes: v.episodes.length, startDate: monthToDate(v.date) || undefined, creator: org(info),
    episode: v.episodes.map((e, i) => ({ '@type': 'Episode', episodeNumber: i + 1, name: e.title || `Episode ${i + 1}`, url: PS.watchPath(v, i) })) };
}
function videoLd(item, v, info) {
  const link = item.youtube || '';
  return { '@context': 'https://schema.org', '@type': 'VideoObject', name: item.title, description: item.description || v.description || item.title,
    uploadDate: monthToDate(PS.latestDate(item)) || undefined, thumbnailUrl: item.thumb || item.cover || videoImage(v) || undefined,
    embedUrl: PS.ytId(link) ? `https://www.youtube.com/embed/${PS.ytId(link)}` : undefined,
    contentUrl: !PS.ytId(link) && /^https?:\/\//.test(link) ? link : undefined, creator: org(info) };
}

// relative links inside structured data become full addresses
function absolutize(node, base) {
  if (Array.isArray(node)) return node.map((n) => absolutize(n, base));
  if (node && typeof node === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(node)) {
      if (val === undefined) continue;
      out[k] = (k === 'url' || k === 'thumbnailUrl') && typeof val === 'string' ? absImage(base, val) || (val.startsWith('/') ? base + val : val) : absolutize(val, base);
    }
    return out;
  }
  return node;
}

// safe inside <script>: no closing tags, and the two line-separator characters JS strings dislike
const json = (obj) => JSON.stringify(obj).replace(/[<\u2028\u2029]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

function renderPage(html, meta, c, req) {
  const base = baseUrl(req, c.site || {});
  const url = base + meta.path;
  const image = absImage(base, meta.image);
  const ld = absolutize([].concat(meta.ld).map((n) => (n['@type'] === 'WebSite' || n['@type'] === 'TVSeries' || n['@type'] === 'CreativeWork' ? { ...n, url } : n)), base);
  const tags = [
    `<link rel="canonical" href="${attr(url)}">`,
    `<meta property="og:site_name" content="P STUDIO">`,
    `<meta property="og:type" content="${meta.type}">`,
    `<meta property="og:title" content="${attr(meta.title)}">`,
    `<meta property="og:description" content="${attr(meta.description)}">`,
    `<meta property="og:url" content="${attr(url)}">`,
    image && `<meta property="og:image" content="${attr(image)}">`,
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${attr(meta.title)}">`,
    `<meta name="twitter:description" content="${attr(meta.description)}">`,
    image && `<meta name="twitter:image" content="${attr(image)}">`,
    ...ld.map((n) => `<script type="application/ld+json">${json(n)}</script>`),
    `<script>window.__CONTENT__ = ${json(c)};</script>`,
  ].filter(Boolean).join('\n  ');
  return html
    .replace(/<title>[^<]*<\/title>/, () => `<title>${attr(meta.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, () => `<meta name="description" content="${attr(meta.description)}">`)
    .replace('</head>', () => `  ${tags}\n</head>`);
}

function sitemap(c, req) {
  const base = baseUrl(req, c.site || {});
  const rows = [['/', [...(c.videos || []), ...(c.apps || [])].map(PS.latestDate).sort().pop()]];
  for (const v of PS.byLatest((c.videos || []).filter(listedVideo))) rows.push([PS.detailPath(v), PS.latestDate(v)]);
  for (const a of PS.byLatest(c.apps || [])) rows.push([PS.appPath(a), a.date]);
  const body = rows.map(([p, ym]) => `  <url><loc>${attr(base + p)}</loc>${monthToDate(ym) ? `<lastmod>${monthToDate(ym)}</lastmod>` : ''}</url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function robots(c, req) {
  return `User-agent: *\nDisallow: /admin/\nDisallow: /api/\n\nSitemap: ${baseUrl(req, c.site || {})}/sitemap.xml\n`;
}

module.exports = { resolvePage, renderPage, sitemap, robots };
