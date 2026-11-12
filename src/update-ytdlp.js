// Update yt-dlp manual:  npm run update-ytdlp
// Jalankan ini kalau YouTube tiba-tiba error lagi (biasanya YouTube ganti sesuatu dan yt-dlp sudah rilis fix-nya).
require('dotenv').config();
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const custom = process.env.YTDLP_PATH;
const bin = custom || path.join(__dirname, '..', 'bin', process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');

if (custom) {
  console.log(`YTDLP_PATH diisi (${custom}). Kalau install lewat winget, update pakai:`);
  console.log('  winget upgrade yt-dlp.yt-dlp');
  console.log('Nyoba "yt-dlp -U" juga...\n');
}

const res = spawnSync(bin, ['-U'], { stdio: 'inherit', windowsHide: true });
if (res.error) {
  console.error(`❌ Gagal jalanin ${bin}: ${res.error.message}`);
  console.error('   Kalau belum ada, jalankan "npm start" sekali (auto-download) atau install via winget.');
  process.exit(1);
}
process.exit(res.status ?? 0);
