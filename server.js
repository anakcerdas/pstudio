// P STUDIO — zero-dependency server: static site + tiny JSON CMS.
// Run:  ADMIN_PASSWORD=yourpassword node server.js
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const seo = require('./seo');
const mailer = require('./mailer');
const PS = require('./public/js/shared.js');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
// Everything the CMS saves lives in ONE folder, kept out of git and separate from the code:
//   storage/content.json   all text, links, dates and order
//   storage/backups/       the last 30 versions of content.json
//   storage/apps/          uploaded interactive apps   (served at /apps/...)
//   storage/uploads/       uploaded images             (served at /uploads/...)
// On a host, point STORAGE_DIR at its persistent disk, e.g. STORAGE_DIR=/var/data
const STORAGE = path.resolve(process.env.STORAGE_DIR || path.join(ROOT, 'storage'));
const DATA = path.join(STORAGE, 'content.json');
const BACKUPS = path.join(STORAGE, 'backups');
const STORED = { '/apps/': path.join(STORAGE, 'apps'), '/uploads/': path.join(STORAGE, 'uploads') };
const INQUIRIES = path.join(STORAGE, 'inquiries.jsonl'); // every contact-form message, one per line
const CONTACT_TO = process.env.CONTACT_TO || 'pitra.satvika@gmail.com';
const CONTACT_SUBJECT = 'P STUDIO inquiries';
const PASSWORD = process.env.ADMIN_PASSWORD || 'pstudio-admin';
const MAX_BODY = 30 * 1024 * 1024; // 30 MB (base64 uploads)
const SESSION_TTL = 1000 * 60 * 60 * 12; // 12 hours

if (!process.env.ADMIN_PASSWORD) {
  console.warn('[P STUDIO] ADMIN_PASSWORD not set — the default "pstudio-admin" works only on this computer; online, CMS login stays off until you set it.');
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
const IMAGE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.svg']);

const sessions = new Map(); // token -> expiry
const loginAttempts = new Map(); // ip -> { count, until }
const contactAttempts = new Map(); // ip -> list of send times

if (!mailer.configured()) {
  console.warn('[P STUDIO] Email is not set up (SMTP_HOST, SMTP_USER, SMTP_PASS), so contact-form messages are only saved to storage/inquiries.jsonl.');
}

// ---------- helpers ----------
function send(res, status, body, headers = {}) {
  const isObj = typeof body === 'object' && !Buffer.isBuffer(body);
  res.writeHead(status, {
    'Content-Type': isObj ? MIME['.json'] : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(isObj ? JSON.stringify(body) : body);
}

// public forms (login, contact) only need a few KB; the 30 MB limit is for logged-in uploads
function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('Payload too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function getCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function isAuthed(req) {
  const token = getCookie(req, 'ps_admin');
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp || exp < Date.now()) { sessions.delete(token); return false; }
  return true;
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function slugify(s) {
  return String(s || 'file').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'file';
}

// A brand-new storage folder (e.g. a fresh host disk) starts with an empty site instead of crashing
const EMPTY_CONTENT = { site: { tagline: '', marquee: [], contactText: '', email: '', instagram: { username: '', displayName: 'P STUDIO', bio: '', avatar: '', posts: [] } }, apps: [], videos: [] };
function ensureStorage() {
  for (const dir of [STORAGE, BACKUPS, ...Object.values(STORED)]) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DATA)) {
    fs.writeFileSync(DATA, JSON.stringify(EMPTY_CONTENT, null, 2));
    console.log(`[P STUDIO] No content yet — created an empty ${DATA}`);
  }
  // content saved before posts had web address names gets them once (the previous file goes to backups/)
  const c = readContent();
  if ([...(c.videos || []), ...(c.apps || [])].some((x) => !x.slug)) {
    writeContent(PS.ensureSlugs(c));
    console.log('[P STUDIO] Gave every post a web address name');
  }
}

function readContent() {
  return JSON.parse(fs.readFileSync(DATA, 'utf8'));
}

// storage/inquiries.jsonl, one message per line. Messages saved before they had an id get a stable one
// from their own text, so they can still be deleted from the CMS.
function readInquiries() {
  if (!fs.existsSync(INQUIRIES)) return [];
  return fs.readFileSync(INQUIRIES, 'utf8').split('\n').filter(Boolean).flatMap((line) => {
    try {
      const x = JSON.parse(line);
      return [{ ...x, id: x.id || crypto.createHash('sha1').update(line).digest('hex').slice(0, 12) }];
    } catch { return []; }
  });
}

// what visitors get: posts marked hidden in the CMS are left out everywhere (lists, their pages, the sitemap)
function publicContent() {
  const c = readContent();
  const shown = (x) => !x.hidden;
  return { ...c, apps: (c.apps || []).filter(shown), videos: (c.videos || []).filter(shown) };
}

function writeContent(obj) {
  fs.mkdirSync(BACKUPS, { recursive: true });
  if (fs.existsSync(DATA)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.copyFileSync(DATA, path.join(BACKUPS, `content-${stamp}.json`));
    const old = fs.readdirSync(BACKUPS).filter((f) => f.endsWith('.json')).sort();
    old.slice(0, Math.max(0, old.length - 30)).forEach((f) => fs.unlinkSync(path.join(BACKUPS, f)));
  }
  const tmp = DATA + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, DATA);
}

function validateContent(c) {
  if (!c || typeof c !== 'object') return 'Content must be an object';
  if (!c.site || typeof c.site !== 'object') return 'Missing "site"';
  if (!Array.isArray(c.apps)) return '"apps" must be a list';
  if (!Array.isArray(c.videos)) return '"videos" must be a list';
  return null;
}

// ---------- API ----------
// The visitor's address, for rate limits. On hosts like Render, Railway and Fly every request comes through
// their proxy, which adds the real address as the last entry of X-Forwarded-For.
function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  return fwd.pop() || req.socket.remoteAddress || 'x';
}
// a request made on this computer itself, not through a proxy
const isLocal = (req) => !req.headers['x-forwarded-for'] && /^(::1|127\.|::ffff:127\.)/.test(req.socket.remoteAddress || '');

async function handleApi(req, res, pathname) {
  const ip = clientIp(req);

  if (pathname === '/api/content' && req.method === 'GET') {
    // the CMS (logged in) gets everything, including hidden posts
    return send(res, 200, isAuthed(req) ? readContent() : publicContent(), { 'Cache-Control': 'no-store' });
  }

  if (pathname === '/api/session' && req.method === 'GET') {
    return send(res, 200, { authed: isAuthed(req) });
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    const a = loginAttempts.get(ip);
    const fresh = !a || Date.now() - a.first > 60000;
    if (!fresh && a.count >= 5) return send(res, 429, { error: 'Too many attempts. Try again in a minute.' });
    // the built-in default password only works on this computer, never on a live site
    if (!process.env.ADMIN_PASSWORD && !isLocal(req)) return send(res, 403, { error: 'Login is off: set ADMIN_PASSWORD on the server first.' });
    const body = await readBody(req, 16 * 1024);
    if (!safeEqual(body.password || '', PASSWORD)) {
      loginAttempts.set(ip, fresh ? { count: 1, first: Date.now() } : { count: a.count + 1, first: a.first });
      return send(res, 401, { error: 'Wrong password' });
    }
    loginAttempts.delete(ip);
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, Date.now() + SESSION_TTL);
    const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    return send(res, 200, { ok: true }, {
      'Set-Cookie': `ps_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL / 1000}${secure}`,
    });
  }

  // Contact form: saved to storage/inquiries.jsonl first (so nothing is lost), then emailed to CONTACT_TO
  if (pathname === '/api/contact' && req.method === 'POST') {
    const recent = (contactAttempts.get(ip) || []).filter((t) => Date.now() - t < 10 * 60000);
    if (recent.length >= 5) return send(res, 429, { error: 'Too many messages. Please try again in a few minutes.' });
    const body = await readBody(req, 64 * 1024);
    if (body.website) return send(res, 200, { ok: true }); // hidden field only bots fill in
    const name = String(body.name || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 100);
    const email = String(body.email || '').trim().slice(0, 200);
    const message = String(body.message || '').replace(/\r\n?/g, '\n').trim().slice(0, 5000);
    if (!name) return send(res, 400, { error: 'Please enter your name.' });
    if (!/^[^\s@<>()",;]+@[^\s@<>()",;]+\.[a-z]{2,}$/i.test(email)) return send(res, 400, { error: 'Please enter a valid email address.' });
    if (message.length < 5) return send(res, 400, { error: 'Please write a message.' });
    contactAttempts.set(ip, [...recent, Date.now()]);
    const entry = { id: crypto.randomBytes(6).toString('hex'), date: new Date().toISOString(), name, email, message };
    fs.appendFileSync(INQUIRIES, JSON.stringify(entry) + '\n');
    if (mailer.configured()) {
      const text = `New inquiry from the P STUDIO website\n\nName: ${name}\nEmail: ${email}\nDate: ${entry.date}\n\n${message}\n\n(Reply to this email to answer ${name} directly.)`;
      mailer.sendMail({ to: CONTACT_TO, replyTo: email, replyName: name, subject: CONTACT_SUBJECT, text })
        .then(() => console.log(`[P STUDIO] Inquiry from ${email} emailed to ${CONTACT_TO}`))
        .catch((err) => console.error(`[P STUDIO] Inquiry from ${email} saved but not emailed: ${err.message}`));
    }
    return send(res, 200, { ok: true });
  }

  if (pathname === '/api/logout' && req.method === 'POST') {
    const token = getCookie(req, 'ps_admin');
    if (token) sessions.delete(token);
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'ps_admin=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
  }

  // everything below requires auth
  if (!isAuthed(req)) return send(res, 401, { error: 'Not logged in' });

  if (pathname === '/api/content' && req.method === 'PUT') {
    const body = await readBody(req);
    const err = validateContent(body);
    if (err) return send(res, 400, { error: err });
    PS.ensureSlugs(body, readContent()); // every post gets a unique web address name
    writeContent(body);
    return send(res, 200, { ok: true, content: body });
  }

  if (pathname === '/api/upload' && req.method === 'POST') {
    const { kind, name, data } = await readBody(req);
    if (!data || typeof data !== 'string') return send(res, 400, { error: 'No file data' });
    const ext = path.extname(String(name || '')).toLowerCase();
    let dir, publicDir, finalExt;
    if (kind === 'app') {
      if (ext !== '.html' && ext !== '.htm') return send(res, 400, { error: 'Apps must be .html files' });
      publicDir = '/apps/'; finalExt = '.html';
    } else if (kind === 'image') {
      if (!IMAGE_EXT.has(ext)) return send(res, 400, { error: 'Unsupported image type' });
      publicDir = '/uploads/'; finalExt = ext;
    } else {
      return send(res, 400, { error: 'Unknown upload kind' });
    }
    dir = STORED[publicDir];
    fs.mkdirSync(dir, { recursive: true });
    const file = `${slugify(name)}-${crypto.randomBytes(3).toString('hex')}${finalExt}`;
    fs.writeFileSync(path.join(dir, file), Buffer.from(data, 'base64'));
    return send(res, 200, { ok: true, path: publicDir + file });
  }

  // contact-form messages for the CMS Inquiries tab, newest first
  if (pathname === '/api/inquiries' && req.method === 'GET') {
    return send(res, 200, { inquiries: readInquiries().reverse() });
  }
  const del = /^\/api\/inquiries\/([\w-]+)$/.exec(pathname);
  if (del && req.method === 'DELETE') {
    const all = readInquiries();
    const kept = all.filter((x) => x.id !== del[1]);
    if (kept.length === all.length) return send(res, 404, { error: 'Message not found' });
    const tmp = INQUIRIES + '.tmp';
    fs.writeFileSync(tmp, kept.map((x) => JSON.stringify(x) + '\n').join(''));
    fs.renameSync(tmp, INQUIRIES);
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'Not found' });
}

// ---------- pages ----------
// The home page and every post address (/series/…, /film/…, /app/…, /watch/…) are index.html with
// that page's title, description, share image and the site content filled in. See seo.js.
function servePage(req, res, pathname, search) {
  const c = publicContent();
  const page = seo.resolvePage(pathname, c);
  if (page.status === 301) { res.writeHead(301, { Location: page.redirect + search }); return res.end(); }
  if (page.status === 404) return notFound(res, true);
  const html = seo.renderPage(fs.readFileSync(path.join(PUB, 'index.html'), 'utf8'), page.meta, c, req);
  send(res, 200, html, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
}

function notFound(res, asPage) {
  if (!asPage) return send(res, 404, 'Not found');
  send(res, 404, fs.readFileSync(path.join(PUB, '404.html')), { 'Content-Type': MIME['.html'] });
}
// a missing file that was asked for as a page (no extension, e.g. /about) gets the 404 page
const looksLikePage = (rel) => !path.extname(rel) || rel.endsWith('.html');

// ---------- static ----------
function serveStatic(req, res, pathname) {
  if (pathname === '/admin') { res.writeHead(301, { Location: '/admin/' }); return res.end(); }
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  // /apps/... and /uploads/... come from the storage folder; everything else is the site's code in public/
  const prefix = Object.keys(STORED).find((p) => rel.startsWith(p));
  const base = prefix ? STORED[prefix] : PUB;
  const file = path.normalize(path.join(base, prefix ? rel.slice(prefix.length) : rel));
  if (file !== base && !file.startsWith(base + path.sep)) return send(res, 403, 'Forbidden');

  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return notFound(res, !prefix && looksLikePage(rel));
    const ext = path.extname(file).toLowerCase();
    const headers = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': rel.startsWith('/uploads/') ? 'public, max-age=86400' : 'no-cache',
    };
    // Uploaded apps run in a sandbox (opaque origin) even when opened directly,
    // so they can never touch the admin session.
    if (rel.startsWith('/apps/')) {
      headers['Content-Security-Policy'] =
        'sandbox allow-scripts allow-pointer-lock allow-popups allow-modals allow-forms allow-downloads';
    }
    // an uploaded SVG is a picture; if opened directly, any script inside it must not run on the site
    if (rel.startsWith('/uploads/') && ext === '.svg') headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox";
    if (rel.startsWith('/admin/')) headers['X-Frame-Options'] = 'DENY';
    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });
}

ensureStorage();
http.createServer(async (req, res) => {
  const { pathname, search } = new URL(req.url, 'http://localhost');
  try {
    if (pathname.startsWith('/api/')) await handleApi(req, res, pathname);
    else if (pathname === '/index.html') { res.writeHead(301, { Location: '/' + search }); res.end(); }
    else if (pathname === '/sitemap.xml') send(res, 200, seo.sitemap(publicContent(), req), { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-cache' });
    else if (pathname === '/robots.txt') send(res, 200, seo.robots(publicContent(), req), { 'Cache-Control': 'no-cache' });
    else if (pathname === '/' || /^\/(series|film|app|watch)\//.test(pathname)) servePage(req, res, pathname, search);
    else serveStatic(req, res, pathname);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, e.message === 'Payload too large' ? 413 : 400, { error: e.message });
  }
}).listen(PORT, () => {
  console.log(`P STUDIO running →  http://localhost:${PORT}   (admin: http://localhost:${PORT}/admin/)`);
  console.log(`Storage folder   →  ${STORAGE}`);
});
