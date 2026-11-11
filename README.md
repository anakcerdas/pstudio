# P STUDIO

Personal portfolio: interactive pieces made with Claude, AI films from YouTube (singles + series), and an Instagram contact section, plus a small built-in CMS at `/admin`.

No dependencies. You only need Node.js 18 or newer.

## Run locally

```bash
ADMIN_PASSWORD=choose-a-password node server.js
```

On Windows PowerShell:

```powershell
$env:ADMIN_PASSWORD="choose-a-password"; node server.js
```

Or put your settings (`ADMIN_PASSWORD`, the email settings below) in a `.env` file next to `server.js`, one `NAME=value` per line, and start with `node --env-file-if-exists=.env server.js`. The Claude app's preview already does this. `.env` is in `.gitignore`, so it never goes to GitHub.

- Site: http://localhost:3000
- CMS:  http://localhost:3000/admin/ (the password is `pstudio-admin` if you don't set one; that default only works on your own computer, so online the CMS stays locked until `ADMIN_PASSWORD` is set)

## Using the CMS

- **Interactive**: add a piece by uploading an `.html` file, pasting the HTML code Claude gave you, or linking an external URL. A thumbnail is optional; without one the card shows a live mini-preview.
- **Films** has four sections, each with its own order: **Series**, **Shorts**, **Motions** (motion graphics) and **Commercials**. Motions and Commercials (section + menu link) appear on the site once you add one.
  - **Shorts** show as a Netflix-style row of vertical covers. **Motions** and **Commercials** show every cover at the same height, with the width following the cover (portrait or landscape).
- Add a *short*, *motion*, *commercial* or a *series* (as many episodes as you like). A video link can be a **YouTube** video, an **Instagram post or reel**, or a **public Facebook video** (video, reel, watch or fb.watch link); all play in the site's player and go fullscreen. Instagram and Facebook don't provide thumbnails, so upload a cover image (or episode thumbnail) for those.
  - Each Instagram and Facebook post has a choice: **Play on my site** (the platform's player) or **Open on Instagram / Facebook** (your cover image with a play button that opens the post on Instagram). Use Open on Instagram when Instagram's player puts its "View more on Instagram" bar over the video, which happens with landscape videos that have a portrait cover. For Facebook, use it when the player says "Unavailable… content owned by someone else": Facebook blocks embedding of reels with licensed music.
  - Each series and short gets its own page (opened from the Series menu or the library), with its title, description, a cover banner and an **Images** gallery for posters and behind-the-scenes shots.
  - Series can also have a portrait **Poster** used on the Series Library cards.
  - The sample posters in `storage/uploads/samples/` are placeholders; delete them once you've added your own.
- **Show / hide**: the eye button on each post (or *On the website → Shown / Hidden* inside it) takes a post or a whole series off the site without deleting it. A hidden post disappears from the lists, its address shows the 404 page and it leaves the sitemap; it stays in the CMS, dimmed with a **Hidden** label, until you show it again.
- **Dates**: every app, short, series and episode has a Month and a Year dropdown. The site lists everything newest first, and a series counts as updated when its newest episode was posted.
- **Image sizes** (also shown under each upload field; the CMS warns you if an image is too small or the wrong shape):

  | Image | Recommended size |
  |---|---|
  | Interactive thumbnail | 1600 × 1000 px (16:10) |
  | Cover | 1920 × 1080 px (16:9) or 1080 × 1920 px (9:16) |
  | Series poster | 1200 × 1600 px (3:4 portrait) |
  | Gallery images | any shape, at least 1600 px on the long side |
  | Profile photo | 400 × 400 px (square) |

  Use JPG or WebP (PNG for graphics), ideally under 1 MB each.
- **Running text** (the scrolling strip under the hero): edit it in **Profile & contact → Running text**, one item per line.
- **Profile & contact**: your Instagram username (this drives the "DM me" link `ig.me/m/<username>`), bio, photo, and up to a few post URLs to embed.
- Press **Save changes** (or Ctrl/Cmd+S). The site updates right away. Each save also keeps a backup in `storage/backups/` (the last 30).

## Where content lives: the `storage/` folder

Everything the CMS saves is in **one folder**, separate from the site's code:

| What | Where |
|---|---|
| All text, links, dates, ordering | `storage/content.json` |
| The last 30 versions of it | `storage/backups/` |
| Uploaded apps (served at `/apps/…`) | `storage/apps/` |
| Uploaded images (served at `/uploads/…`) | `storage/uploads/` |

- **Back up** your site by copying the `storage/` folder. Restore by putting it back.
- `storage/` is listed in `.gitignore`, so it never goes to GitHub, and deploying new code never overwrites your live content.
- To keep it somewhere else (e.g. a host's disk), set `STORAGE_DIR`, for example `STORAGE_DIR=/var/data node server.js`. If the folder is empty, the site starts empty; it never crashes.

## Deploying

The CMS writes files to disk, so you need a host with a **persistent disk**, and `STORAGE_DIR` pointed at it:

- **Render.com**: a Web Service from your GitHub repo, plus a Disk (e.g. mounted at `/var/data`). Set `STORAGE_DIR=/var/data` and `ADMIN_PASSWORD`.
- **Railway / Fly.io**: attach a volume and set `STORAGE_DIR` to its mount path.
- **Any VPS or cPanel Node.js host**: the default `storage/` next to `server.js` is fine; just don't overwrite it when uploading new code.

**First launch:** deploy the code, log in to `/admin` on the live site, and in *Profile & contact → Import content* choose your local `storage` folder. It uploads your posts, settings, images, apps and contact messages (not the backups). From then on, edit through `/admin` on the live site.

Static-only hosts (Netlify, Vercel, GitHub Pages) can serve the site, but the CMS can't save on them.

**After going live:** in the CMS under *Profile & contact → Search & sharing*, fill in the **Website address** (e.g. `https://pstudio.com`), then add the site in [Google Search Console](https://search.google.com/search-console) and submit `https://yourdomain/sitemap.xml`.

## Contact form (email)

The *Let's talk* section has an inquiry form (name, email, message). Each message is:

1. **saved** to `storage/inquiries.jsonl` (one line per message), so nothing is lost even if email fails, and shown in the CMS under **Inquiries** (newest first, with *Reply by email* and *Delete*), and
2. **emailed** to `pitra.satvika@gmail.com` with the subject **P STUDIO inquiries**. *Reply* in your mail app answers the visitor directly.

Email needs an account to send from. With Gmail:

1. Turn on 2-Step Verification for the Google account, then create an **App Password** at https://myaccount.google.com/apppasswords (a 16-letter code).
2. Start the server with these settings (on a host, add them as environment variables):

```bash
SMTP_HOST=smtp.gmail.com SMTP_PORT=465 SMTP_USER=pitra.satvika@gmail.com SMTP_PASS=your-app-password ADMIN_PASSWORD=choose-a-password node server.js
```

On Windows PowerShell:

```powershell
$env:SMTP_HOST="smtp.gmail.com"; $env:SMTP_PORT="465"; $env:SMTP_USER="pitra.satvika@gmail.com"; $env:SMTP_PASS="your-app-password"; node server.js
```

- Without these settings the form still works, but messages are only saved to `storage/inquiries.jsonl` (the server prints a warning at start).
- Any other mail provider works too: use its SMTP server and port (465, or 587 with STARTTLS). `SMTP_SECURE=true|false` overrides the TLS choice for unusual ports, `MAIL_FROM` sets a different sender address, and `CONTACT_TO` sends to a different inbox.
- Each visitor can send 5 messages per 10 minutes, and a hidden field catches most spam bots.

## Search & sharing (SEO)

- Every post has its own address, used in Google and in shared links:
  `/series/bloodwire` (a series), `/film/days-like-these` (a short, motion or commercial), `/app/midcity` (an interactive piece) and `/watch/bloodwire/2` (the player, episode 2).
- The name in the address is the post's **Web address** field in the CMS. It is made from the title on first save and then kept, so renaming a post doesn't change its link. Posts with the same title get `-2`, `-3`. If you change a Web address, the old one keeps redirecting to the new one and is never given to another post.
- The server fills each address with that post's title, description, cover as the share image (Open Graph / Twitter), a canonical link and structured data (`seo.js`). Older links (with the post's ID, or `#/series/...`) redirect to the current address.
- `/sitemap.xml` and `/robots.txt` update themselves from the content. Unknown addresses get a 404 page (`public/404.html`).
- Images uploaded through the CMS are shrunk to at most 2400 px and saved as WebP when that makes them smaller. Images uploaded before this aren't changed.

## Notes

- Uploaded apps run in a sandboxed iframe, so they can't touch the CMS login. Apps that rely on `localStorage` won't be able to save state there.
- Instagram doesn't allow embedding a whole profile, so the site shows a profile card plus the individual posts you choose.
- Where a browser doesn't allow real fullscreen (iPhone Safari, some in-app browsers), the fullscreen button stretches the player over the whole window instead. Esc or "Exit fullscreen" closes it.
