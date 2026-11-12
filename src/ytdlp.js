// Plugin DisTube berbasis yt-dlp: search, resolve link/playlist, dan ambil stream URL.
// Dibikin sendiri (bukan @distube/yt-dlp) supaya bisa: search dari judul, cookies, dan
// load playlist cepat (--flat-playlist).
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { ExtractorPlugin, Playlist, Song, DisTubeError } = require('distube');

const IS_WIN = process.platform === 'win32';
const BUNDLED_PATH = path.join(__dirname, '..', 'bin', IS_WIN ? 'yt-dlp.exe' : 'yt-dlp');
const DOWNLOAD_URL = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${IS_WIN ? 'yt-dlp.exe' : 'yt-dlp'}`;
const TIMEOUT_MS = 90 * 1000;
const UNAVAILABLE = new Set(['[Private video]', '[Deleted video]', '[Unavailable video]']);

/** Ambil baris "ERROR: ..." dari output yt-dlp supaya pesan error-nya pendek. */
function shortError(output) {
  const line = output.split(/\r?\n/).find((l) => l.startsWith('ERROR:'));
  return (line ?? output.trim().split(/\r?\n/).pop() ?? 'yt-dlp error').replace(/^ERROR:\s*/, '').slice(0, 300);
}

class YtDlpPlugin extends ExtractorPlugin {
  /**
   * @param {object} [opts]
   * @param {string} [opts.binaryPath]  path/command yt-dlp. Kosong = pakai bin/yt-dlp(.exe) yang didownload otomatis
   * @param {string} [opts.cookiesPath] path cookies.txt (format Netscape) buat video yang minta login
   * @param {boolean} [opts.autoUpdate] update binary bawaan saat start (yt-dlp -U)
   */
  constructor({ binaryPath, cookiesPath, autoUpdate = true, streamMode = 'pipe' } = {}) {
    super();
    this.streamMode = streamMode === 'direct' ? 'direct' : 'pipe';
    this.streams = new Map(); // token -> { child, first, unclaimed }
    this.serverReady = null;
    this.bundled = !binaryPath;
    this.binaryPath = binaryPath || BUNDLED_PATH;
    this.autoUpdate = autoUpdate;
    this.cookiesPath = null;
    if (cookiesPath) {
      const resolved = path.resolve(cookiesPath);
      if (fs.existsSync(resolved)) this.cookiesPath = resolved;
      else console.warn(`⚠️  YT_COOKIES_PATH diisi tapi file nggak ada: ${resolved} (lanjut tanpa cookies)`);
    }
  }

  /** Pastikan binary ada (download kalau belum), update kalau perlu, lalu return versinya. */
  async prepare() {
    if (this.bundled && !fs.existsSync(this.binaryPath)) {
      console.log('⬇️  yt-dlp belum ada, download dari GitHub...');
      const res = await fetch(DOWNLOAD_URL, { redirect: 'follow' });
      if (!res.ok) throw new Error(`Gagal download yt-dlp (HTTP ${res.status})`);
      fs.mkdirSync(path.dirname(this.binaryPath), { recursive: true });
      const tmp = `${this.binaryPath}.part`;
      fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()), { mode: 0o755 });
      fs.renameSync(tmp, this.binaryPath);
    } else if (this.bundled && this.autoUpdate) {
      const out = await this.run(['-U'], { raw: true }).catch((e) => e.message);
      const line = out.split(/\r?\n/).find((l) => /up to date|Updated yt-dlp|Updating to/i.test(l));
      if (line) console.log(`🔄 yt-dlp: ${line.trim()}`);
    }
    return (await this.run(['--version'], { raw: true })).trim();
  }

  /** Jalankan yt-dlp. Return JSON (default) atau stdout mentah. */
  run(args, { raw = false } = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(this.binaryPath, args, { windowsHide: true });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => child.kill(), TIMEOUT_MS);
      child.stdout.on('data', (d) => (stdout += d));
      child.stderr.on('data', (d) => (stderr += d));
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(
          err.code === 'ENOENT'
            ? new DisTubeError('YTDLP_NOT_FOUND', `yt-dlp nggak ketemu di "${this.binaryPath}"`)
            : err,
        );
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (code !== 0) return reject(new DisTubeError('YTDLP_ERROR', shortError(stderr || stdout)));
        if (raw) return resolve(stdout);
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new DisTubeError('YTDLP_ERROR', 'Output yt-dlp nggak valid'));
        }
      });
    });
  }

  /** Argumen umum: JS runtime (Node yang lagi jalan) buat challenge YouTube + cookies. */
  baseArgs() {
    const args = ['--no-warnings', '--js-runtimes', `node:${process.execPath}`];
    if (this.cookiesPath) args.push('--cookies', this.cookiesPath);
    return args;
  }

  info(target, extra = []) {
    return this.run([...this.baseArgs(), '-J', '--flat-playlist', ...extra, '--', target]);
  }

  // ----- DisTube plugin API -----
  validate() {
    return true; // yt-dlp support ratusan situs, jadi taruh plugin ini paling akhir
  }

  async resolve(url, options) {
    const info = await this.info(url);
    if (Array.isArray(info.entries)) {
      const songs = info.entries
        .filter((e) => e && !UNAVAILABLE.has(e.title))
        .map((e) => this.toSong(e, info, options));
      if (!songs.length) throw new DisTubeError('YTDLP_ERROR', 'Playlist kosong / semua videonya nggak tersedia');
      return new Playlist(
        {
          source: (info.extractor_key || info.ie_key || 'yt-dlp').toLowerCase(),
          songs,
          id: String(info.id),
          name: info.title,
          url: info.webpage_url || url,
          thumbnail: info.thumbnails?.at(-1)?.url,
        },
        options,
      );
    }
    return this.toSong(info, null, options);
  }

  async searchSong(query, options) {
    const info = await this.info(`ytsearch1:${query}`);
    const first = info.entries?.find((e) => e && !UNAVAILABLE.has(e.title));
    return first ? this.toSong(first, info, options) : null;
  }

  async getStreamURL(song) {
    if (!song.url) throw new DisTubeError('YTDLP_ERROR', 'Lagu ini nggak punya URL');
    if (this.streamMode === 'direct') {
      // Mode lama: FFmpeg buka URL googlevideo langsung (bisa kena HTTP 403 dari YouTube)
      const out = await this.run([...this.baseArgs(), '--no-playlist', '-f', 'ba/ba*/b', '-g', '--', song.url], {
        raw: true,
      });
      const streamUrl = out.split(/\r?\n/).find((l) => l.startsWith('http'));
      if (!streamUrl) throw new DisTubeError('YTDLP_ERROR', 'Nggak dapet stream URL');
      return streamUrl;
    }
    return this.pipeStream(song.url);
  }

  /**
   * Mode pipe (default): yt-dlp sendiri yang download audio (-o -), lalu FFmpeg baca dari
   * server HTTP lokal (127.0.0.1). yt-dlp download per potongan dengan header yang benar,
   * jadi nggak kena "ffmpeg exited with code 3436169992" (= HTTP 403 Forbidden dari YouTube).
   */
  async pipeStream(url) {
    const port = await this.startServer();
    const child = spawn(
      this.binaryPath,
      [...this.baseArgs(), '--no-playlist', '--quiet', '--no-part', '-f', 'ba/ba*/b', '-o', '-', '--', url],
      { windowsHide: true },
    );
    let stderr = '';
    child.stderr.on('data', (d) => (stderr = (stderr + d).slice(-4000)));

    // Tunggu byte pertama, biar error (login, video private, dll.) kelihatan di sini
    const first = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill();
        reject(new DisTubeError('YTDLP_ERROR', 'yt-dlp kelamaan (timeout) mulai download'));
      }, TIMEOUT_MS);
      child.stdout.once('data', (chunk) => {
        clearTimeout(timer);
        child.stdout.pause();
        resolve(chunk);
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        reject(new DisTubeError('YTDLP_ERROR', shortError(stderr || `yt-dlp exited with code ${code}`)));
      });
    });

    child.on('close', (code) => {
      if (code && !child.killed) console.warn(`yt-dlp stream berhenti (code ${code}): ${shortError(stderr)}`);
    });

    const token = crypto.randomBytes(16).toString('hex');
    // Kalau FFmpeg nggak pernah ngambil (misal lagu di-skip duluan), bersihin
    const unclaimed = setTimeout(() => {
      this.streams.delete(token);
      child.kill();
    }, 2 * 60 * 1000);
    this.streams.set(token, { child, first, unclaimed });
    return `http://127.0.0.1:${port}/${token}`;
  }

  startServer() {
    this.serverReady ??= new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const token = req.url.slice(1);
        const entry = this.streams.get(token);
        if (!entry) {
          res.writeHead(404).end();
          return;
        }
        this.streams.delete(token); // sekali pakai
        clearTimeout(entry.unclaimed);
        const { child, first } = entry;
        res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
        res.write(first);
        child.stdout.pipe(res);
        // FFmpeg ditutup (skip/stop) -> matiin yt-dlp-nya juga
        res.on('close', () => child.kill());
      });
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.unref();
        resolve(server.address().port);
      });
    });
    return this.serverReady;
  }

  getRelatedSongs() {
    return [];
  }

  toSong(e, parent, options) {
    const isYouTube = /youtube/i.test(e.ie_key || e.extractor_key || parent?.extractor_key || '');
    let url = e.webpage_url || e.original_url || e.url;
    if (isYouTube && e.id && !/^https?:/.test(url ?? '')) url = `https://www.youtube.com/watch?v=${e.id}`;
    const isLive = e.is_live === true || e.live_status === 'is_live';
    return new Song(
      {
        plugin: this,
        source: (e.extractor_key || e.ie_key || 'yt-dlp').toLowerCase(),
        playFromSource: true,
        id: String(e.id ?? url),
        name: e.title || e.fulltitle || url,
        url,
        isLive,
        duration: isLive ? 0 : Number(e.duration) || 0,
        thumbnail:
          e.thumbnail || e.thumbnails?.at(-1)?.url || (isYouTube && e.id ? `https://i.ytimg.com/vi/${e.id}/hqdefault.jpg` : undefined),
        uploader: { name: e.uploader || e.channel, url: e.uploader_url || e.channel_url },
        views: e.view_count,
        ageRestricted: Number(e.age_limit) >= 18,
      },
      options,
    );
  }
}

module.exports = { YtDlpPlugin };
