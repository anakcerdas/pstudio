// Minimal SMTP sender (no dependencies), used for the contact form.
// Settings come from environment variables:
//   SMTP_HOST   e.g. smtp.gmail.com
//   SMTP_PORT   465 (TLS) or 587 (STARTTLS); default 465
//   SMTP_USER   the mailbox that sends, e.g. you@gmail.com
//   SMTP_PASS   its password (for Gmail: an App Password, not your normal password)
//   SMTP_SECURE optional: "true" for TLS from the start, "false" for STARTTLS; default: TLS when the port is 465
//   MAIL_FROM   optional, defaults to SMTP_USER
const net = require('net');
const tls = require('tls');
const os = require('os');

const cfg = () => ({
  host: process.env.SMTP_HOST || '',
  port: Number(process.env.SMTP_PORT) || 465,
  user: process.env.SMTP_USER || '',
  pass: process.env.SMTP_PASS || '',
  from: process.env.MAIL_FROM || process.env.SMTP_USER || '',
  get secure() { return process.env.SMTP_SECURE ? /^(1|true|yes)$/i.test(process.env.SMTP_SECURE) : this.port === 465; },
});
const configured = () => { const c = cfg(); return !!(c.host && c.user && c.pass && c.from); };

// header-safe text: no line breaks, non-ASCII as an RFC 2047 encoded word
const oneLine = (s) => String(s || '').replace(/[\r\n]+/g, ' ').trim();
const encodeHeader = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);
const displayName = (s) => { const n = oneLine(s).replace(/["\\]/g, ''); return /^[\x20-\x7e]*$/.test(n) ? `"${n}"` : encodeHeader(n); };
const b64Lines = (s) => Buffer.from(s, 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n');

function buildMessage({ from, to, replyTo, replyName, subject, text }) {
  const domain = from.split('@')[1] || 'localhost';
  const headers = [
    `From: "P STUDIO website" <${from}>`,
    `To: <${to}>`,
    replyTo ? `Reply-To: ${replyName ? `${displayName(replyName)} ` : ''}<${replyTo}>` : '',
    `Subject: ${encodeHeader(oneLine(subject))}`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${Date.now()}.${Math.random().toString(36).slice(2)}@${domain}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
  ].filter(Boolean);
  return headers.join('\r\n') + '\r\n\r\n' + b64Lines(text).replace(/\r\n$/, '');
}

// Talks to the server one command at a time; rejects on any unexpected reply.
function sendMail({ to, replyTo, replyName, subject, text }) {
  const c = cfg();
  if (!configured()) return Promise.reject(new Error('Email is not set up (SMTP_HOST, SMTP_USER, SMTP_PASS)'));
  return new Promise((resolve, reject) => {
    let sock = c.secure ? tls.connect({ host: c.host, port: c.port, servername: c.host }) : net.connect({ host: c.host, port: c.port });
    let buf = '';
    let waiter = null;
    const fail = (err) => { try { sock.destroy(); } catch {} reject(err); };
    // a reply is complete when its last line is "NNN text" (not "NNN-text")
    const deliver = () => {
      const m = /(?:^|\r\n)(\d{3}) [^\r\n]*\r\n$/.exec(buf);
      if (m && waiter) { const w = waiter; waiter = null; const reply = buf; buf = ''; w(Number(m[1]), reply); }
    };
    const onData = (d) => { buf += d.toString('utf8'); deliver(); };
    const attach = (s) => { s.on('data', onData); s.on('error', fail); s.setTimeout(20000, () => fail(new Error('Email server timed out'))); };
    const expect = (codes) => new Promise((res, rej) => {
      waiter = (code, reply) => (codes.includes(code) ? res(reply) : rej(new Error(`Email server said: ${reply.trim().split('\r\n').pop()}`)));
      deliver();
    });
    const cmd = (line, codes) => { const p = expect(codes); sock.write(line + '\r\n'); return p; };
    attach(sock);

    (async () => {
      const name = os.hostname().replace(/[^\w.-]/g, '') || 'localhost';
      await expect([220]);
      let ehlo = await cmd(`EHLO ${name}`, [250]);
      if (!c.secure) {
        if (!/STARTTLS/i.test(ehlo)) throw new Error('Email server does not offer STARTTLS');
        await cmd('STARTTLS', [220]);
        sock.removeListener('data', onData);
        sock = tls.connect({ socket: sock, servername: c.host });
        attach(sock);
        await new Promise((res, rej) => { sock.once('secureConnect', res); sock.once('error', rej); });
        ehlo = await cmd(`EHLO ${name}`, [250]);
      }
      await cmd('AUTH LOGIN', [334]);
      await cmd(Buffer.from(c.user).toString('base64'), [334]);
      await cmd(Buffer.from(c.pass).toString('base64'), [235]);
      await cmd(`MAIL FROM:<${c.from}>`, [250]);
      await cmd(`RCPT TO:<${to}>`, [250, 251]);
      await cmd('DATA', [354]);
      await cmd(buildMessage({ from: c.from, to, replyTo, replyName, subject, text }) + '\r\n.', [250]);
      await cmd('QUIT', [221]).catch(() => {});
      sock.end();
      resolve();
    })().catch(fail);
  });
}

module.exports = { sendMail, configured };
