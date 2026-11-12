# Discord Music Bot

Music bot ala Jockie pakai **discord.js v14 + DisTube 5 + yt-dlp**. Nggak butuh server audio terpisah (Lavalink, Java, Docker). Semua jalan di satu proses Node.

Commands: `/play` `/skip` `/stop` `/pause` `/queue` `/nowplaying` `/loop` `/shuffle` `/volume` `/remove`

## Cara kerjanya
- **yt-dlp** dipakai buat cari lagu (`ytsearch`), baca link video/playlist, dan ambil URL audio. Selain YouTube, yt-dlp juga bisa link SoundCloud, Bandcamp, dan [ratusan situs lain](https://github.com/yt-dlp/yt-dlp/blob/master/supportedsites.md).
- **FFmpeg** decode audionya, lalu **@discordjs/voice** (≥ 0.19, sudah support DAVE / voice E2EE Discord) mengirim audionya ke voice channel.
- Plugin yt-dlp ada di [`src/ytdlp.js`](src/ytdlp.js). Bot pakai plugin sendiri, bukan `@distube/yt-dlp`, karena plugin resmi itu nggak bisa search judul, nggak bisa pakai cookies, dan lambat buat playlist.

## Yang perlu di-install (Windows)

Buka **PowerShell** atau **Terminal**, lalu jalankan:

### 1. Node.js 22.12+ (disarankan 24 LTS)
```powershell
winget install OpenJS.NodeJS.LTS
node -v   # harus v22.12.0 atau lebih baru
```

### 2. FFmpeg
```powershell
winget install Gyan.FFmpeg
```
**Tutup lalu buka lagi terminal-nya** (biar PATH ke-refresh), lalu cek pakai `ffmpeg -version`.
Kalau tetap "not recognized", isi `FFMPEG_PATH` di `.env` dengan path lengkap `ffmpeg.exe`.

### 3. yt-dlp (pilih salah satu)
- **Otomatis (default)**: nggak usah ngapa-ngapain. Pas `npm start` pertama kali, bot download `yt-dlp.exe` ke folder `bin/`, dan tiap start dia update sendiri.
- **Lewat winget**:
  ```powershell
  winget install yt-dlp.yt-dlp
  ```
  lalu isi `YTDLP_PATH=yt-dlp` di `.env`.

> YouTube sekarang butuh JavaScript runtime buat yt-dlp. Bot otomatis pakai Node yang lagi jalan (`--js-runtimes node`), jadi nggak perlu install Deno.

## Setup

### 1. Bikin bot di Discord
1. Buka https://discord.com/developers/applications, klik **New Application**
2. Copy **Application ID** dari tab *General Information*, ini `CLIENT_ID`
3. Di tab **Bot**, klik **Reset Token** lalu copy, ini `DISCORD_TOKEN` (jangan disebar!)
4. Di tab **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot permissions: `View Channels`, `Send Messages`, `Embed Links`, `Connect`, `Speak`
   - Buka URL yang muncul untuk invite bot ke server lo

### 2. Isi konfigurasi
```powershell
copy .env.example .env
# isi DISCORD_TOKEN, CLIENT_ID, dan GUILD_ID (ID server buat testing)
```
Cara dapat `GUILD_ID`: di Discord nyalakan *Settings → Advanced → Developer Mode*, lalu klik kanan server dan pilih **Copy Server ID**.

### 3. Jalankan bot
```powershell
npm install
npm run deploy   # daftarkan slash command (ulangi tiap nambah/ubah command)
npm start        # atau: npm run dev (auto-restart saat file berubah)
```
Kalau berhasil, di console muncul:
```
🎞️  FFmpeg OK
📼 yt-dlp 2026.xx.xx
✅ Logged in as NamaBot#1234 (1 server)
```
Masuk voice channel, lalu ketik `/play never gonna give you up` 🎶

## Cookies YouTube (opsional)
Kadang YouTube minta login ("Sign in to confirm you're not a bot", video 18+, video members). Bot bisa pakai cookies dari akun Google.

> ⚠️ **Pakai akun Google cadangan, jangan akun utama.** Ada kemungkinan akun yang cookies-nya dipakai bot kena limit atau ban dari YouTube.

**Cara export cookies (cara yang disarankan yt-dlp):**
1. Buka jendela **Incognito/Private** baru di browser.
2. Login ke YouTube pakai akun cadangan.
3. Di tab yang sama, buka `https://www.youtube.com/robots.txt` (cuma tab itu yang kebuka).
4. Export cookies `youtube.com` ke format **Netscape** pakai ekstensi **"Get cookies.txt LOCALLY"** (open-source, ada di Chrome Web Store & Firefox Add-ons; izinkan jalan di Incognito). Simpan sebagai `cookies.txt` di folder bot.
5. **Tutup jendela Incognito-nya tanpa logout.** Kalau logout, cookies-nya langsung nggak berlaku.
6. Isi di `.env`:
   ```
   YT_COOKIES_PATH=./cookies.txt
   ```
7. Restart bot. Di console muncul `📼 yt-dlp ... (pakai cookies)`.

`cookies.txt` sudah masuk `.gitignore`. **Jangan pernah di-commit atau dikirim ke orang**, karena isinya sesi login akun lo. Cookies bisa kedaluwarsa. Kalau error login muncul lagi, ulangi langkah di atas.

## Kalau YouTube error lagi
YouTube sering ganti sistemnya, dan yt-dlp biasanya rilis fix dalam beberapa hari. Urutan yang dicoba:
1. **Update yt-dlp**:
   ```powershell
   npm run update-ytdlp
   ```
   (atau `winget upgrade yt-dlp.yt-dlp` kalau lo install via winget). Lalu restart bot.
2. Tes langsung di terminal biar tahu masalahnya di yt-dlp atau di bot:
   ```powershell
   .\bin\yt-dlp.exe -f ba -g --js-runtimes node "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
   ```
   Kalau keluar URL `googlevideo.com`, yt-dlp-nya sehat.
3. Kalau errornya soal login/bot, pasang cookies (lihat atas).
4. Cek [issue tracker yt-dlp](https://github.com/yt-dlp/yt-dlp/issues) buat masalah YouTube terbaru.

## Struktur
```
├── bin/                      # yt-dlp.exe (auto-download, nggak di-commit)
├── src/
│   ├── index.js              # client, DisTube, event player, auto-leave
│   ├── ytdlp.js              # plugin DisTube berbasis yt-dlp (search, playlist, stream, cookies)
│   ├── deploy-commands.js    # registrasi slash command
│   ├── update-ytdlp.js       # npm run update-ytdlp
│   ├── utils.js              # embed, format durasi, cek voice
│   └── commands/             # 1 file = 1 command
```
Untuk nambah command baru: copy salah satu file di `src/commands/`, ubah isinya, lalu `npm run deploy`. Tiap command menerima `(interaction, { distube, leave, scheduleIdleLeave })`.

## Troubleshooting

| Masalah | Solusi |
|---|---|
| Bot online tapi slash command nggak muncul | Jalankan `npm run deploy`. Kalau `GUILD_ID` kosong, command global bisa butuh beberapa menit. |
| `❌ FFmpeg nggak ketemu` | `winget install Gyan.FFmpeg`, **buka terminal baru**, cek `ffmpeg -version`. Atau isi `FFMPEG_PATH` di `.env`. |
| `❌ yt-dlp belum siap` / gagal download (403) | GitHub nge-limit IP lo. Install manual `winget install yt-dlp.yt-dlp` lalu isi `YTDLP_PATH=yt-dlp`. |
| "Sign in to confirm you're not a bot" / "requires login" | Pasang cookies (lihat bagian Cookies). Kalau sudah, export ulang (mungkin kedaluwarsa). |
| Lagu gagal diputar, bot skip terus | `npm run update-ytdlp`, restart bot. Nyalakan `DEBUG=true` di `.env` buat lihat log lengkap. |
| Bot join tapi nggak ada suara | Pastikan `@discordjs/voice` ≥ 0.19 (`npm ls @discordjs/voice`), karena voice Discord wajib DAVE. Cek juga izin **Speak**, dan coba `/volume 100`. |
| `npm install` error di `@discordjs/opus` | Biasanya karena nggak ada prebuilt buat versi Node lo. Pakai Node LTS, atau ganti ke encoder JS: `npm uninstall @discordjs/opus && npm install opusscript`. |
| `/play` judul lagu agak lama (±3–5 detik) | Normal, karena yt-dlp nyari dulu lalu ambil stream. Link playlist besar juga cuma dibaca daftar lagunya, jadi tetap cepat. |
| Error `Used disallowed intents` | Bot ini cuma pakai intent `Guilds` + `GuildVoiceStates`, jadi nggak perlu nyalain privileged intent. |

## Catatan soal YouTube
Streaming dari YouTube melanggar ToS YouTube. Bot gede kayak Groovy/Rythm ditutup gara-gara ini. Aman buat dipakai pribadi atau di server tongkrongan, tapi **jangan dipublikasikan atau dimonetisasi**.

## Ide fitur selanjutnya
- Filter audio (bassboost, nightcore, 8D) via `queue.filters.add('bassboost')` (sudah ada bawaan DisTube)
- Spotify/Apple Music/Deezer via `@distube/spotify` / `@distube/deezer` (metadata, terus dicari di YouTube)
- Tombol kontrol (pause/skip) di embed "Now playing" pakai `ButtonBuilder`
- `/seek` (`queue.seek(detik)`), `/previous` (`queue.previous()`), `/autoplay`, mode 24/7
- Playlist tersimpan per user (SQLite / MongoDB)
