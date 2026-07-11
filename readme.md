# Audiobookshelf — Discovery Edition

A modified build of [audiobookshelf](https://www.audiobookshelf.org/) (based on **v2.35.1**) that adds a
self-hosted **Discovery** system: search for audiobooks and ebooks, find downloadable releases through
**Prowlarr**, hand them to **qBittorrent**, and have the finished files imported into your library
automatically — plus a persistent Downloads tab, a request/approval workflow with per-role permissions,
and per-user activity stats.

![Discovery page](discovery.png)

## 💬 Community & Support

Join the community for help, updates, and discussion: **https://discord.gg/CTpduhwP6x**

---

## What it adds

### 📚 Discovery (search → download)
- A **Discovery** button in the library sidebar (book libraries).
- **Step 1 – Find the book:** search book metadata via a choice of providers — **Audible, Google
  Books, Open Library, iTunes, FantLab**, plus any custom providers you've configured — so you pick
  the right title, author and cover. If a book isn't listed, use **Search indexers directly** to skip
  the metadata step and query Prowlarr with raw text.
- **Step 2 – Choose a download:** queries **Prowlarr** across your indexers and lists releases
  (size, seeders, source). An **Audiobook / Ebook** toggle controls what's searched, and each result
  is badged so you can tell them apart. An optional "Refine search" box lets you tweak the exact
  indexer query.
- The chosen release is sent to **qBittorrent**; when it finishes, the files are copied into your book
  library folder and scanned in automatically — no manual importing.

### ⬇️ Downloads tab
- A dedicated **Downloads** page showing every job with live progress.
- **Persisted to the database** — history survives restarts, and in-progress downloads **resume
  tracking and auto-import** after a restart.
- **24-hour retention:** finished/failed entries drop off after a day; active/stalled ones stay until
  done. **Clear** buttons for individual entries and "Clear finished".

### 🙋 Requests, roles & approvals
- New per-user permission toggles (Settings → Users → edit user):
  **Discovery: Download Directly**, **Can Request**, **Auto-Approve Requests**.
- Users without direct-download permission see a **Request** button instead of Download.
- Requests land in an **admin approval queue** (Approve → it downloads / Deny). Users with
  auto-approve skip the queue.

### 📊 Per-user stats
- A **Discovery Activity** panel on each user's page: total **downloads**, **requests**,
  **listen time**, and **read time**.
- **Read time** is newly tracked — the ebook reader sends a heartbeat while you read, accumulated per
  user & book.

### 🔒 Admin-only source
- The release **source (indexer/tracker name)** is shown only to admins; everyone else sees
  "Admin only" (redacted on the server, not just hidden in the UI).

---

## Requirements

- **Docker** (this is distributed as a Docker image).
- A running **Prowlarr** instance with at least one indexer, reachable from the container.
- A running **qBittorrent** (Web UI enabled), reachable from the container.
- A **book** library in audiobookshelf.
- Best results when qBittorrent and this container run on the **same host** and share the
  completed-downloads folder (see below).

---

## Install

The image is provided as a tarball: **`abs-discovery.tar.gz`**.

```bash
# 1. Load the image
docker load < abs-discovery.tar.gz          # -> Loaded image: audiobookshelf-discovery:latest

# 2. Edit docker-compose.yml paths (see below), then start it
docker compose up -d
```

Open **http://<server-ip>:13378/** (served at the root path, like the stock image), create your admin
account, and add a book library.

### docker-compose.yml (included)

```yaml
services:
  audiobookshelf:
    image: audiobookshelf-discovery:latest
    container_name: audiobookshelf
    ports:
      - 13378:80
    volumes:
      - /path/to/audiobooks:/audiobooks     # your media
      - /path/to/ebooks:/ebooks
      - ./config:/config                    # database & settings
      - ./metadata:/metadata
      - /path/to/qbittorrent/completed:/downloads   # qBittorrent's finished-downloads dir
    restart: unless-stopped
    # user: "1000:1000"                     # match your media file ownership if needed
```

The paths on the **left** of each `:` must point at real folders on your host.

---

## Configure Discovery

Settings → **Discovery** (admin):

| Field | Value |
|---|---|
| **Prowlarr Host** | `http://<prowlarr-ip>:9696` (use `http://`, not https) |
| **Prowlarr API Key** | from Prowlarr → Settings → General |
| **qBittorrent Host** | `http://<qbittorrent-ip>:8080` |
| **qBittorrent User / Pass** | your Web UI credentials |
| **qBittorrent Category** | e.g. `audiobookshelf` |
| **Download Path** | the container path where finished torrents land — usually `/downloads` |
| **Target Library** | your book library |

Enable it, hit **Test Connection** (both should go green), and Save.

### The Download Path — the one thing to get right
`Download Path` must be the folder **inside the container** where qBittorrent's *completed* files
appear. With the `:/downloads` mount above, that's `/downloads`. Verify:

```bash
docker exec audiobookshelf ls -la /downloads     # should list your completed torrents
```

If qBittorrent saves category downloads into a subfolder, point `Download Path` at that exact
subfolder. The importer locates content by qBittorrent's real `content_path`, so it handles torrents
whose display name differs from the on-disk folder name.

---

## Notes & caveats

- **Legality is the operator's responsibility.** This is a self-hosted media-manager integration
  (same category as Readarr); it is indexer-agnostic and ships no indexers or content. What you search
  for and download is up to you and your local laws.
- **Based on audiobookshelf v2.35.1.** Running it against a database from a *newer* audiobookshelf is a
  downgrade and may not be safe — back up your `/config` before switching an existing install.
- **Ebooks vs audiobooks:** both live in book libraries; a downloaded ebook is imported and readable in
  the built-in reader just like an audiobook.
- **qBittorrent 4.2.1+** recommended (the importer uses the `content_path` field).

---

## Credits & license

Built on **[audiobookshelf](https://github.com/advplyr/audiobookshelf)** by advplyr and contributors.
audiobookshelf is licensed under **GPL-3.0**; this modified build is a derivative work and is
distributed under the same **GPL-3.0** license (see `LICENSE`). The Discovery feature integrates with
[Prowlarr](https://prowlarr.com/) and [qBittorrent](https://www.qbittorrent.org/), which are separate
projects under their own licenses.

**Community:** https://discord.gg/CTpduhwP6x
