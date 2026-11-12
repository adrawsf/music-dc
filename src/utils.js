const { EmbedBuilder } = require('discord.js');

const COLOR = 0x5865f2;

/** Format detik jadi m:ss / h:mm:ss. 0 / kosong = LIVE. */
function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return 'LIVE';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

function progressBar(position, length, size = 15) {
  if (!length) return '🔴 LIVE';
  const ratio = Math.min(position / length, 1);
  const filled = Math.round(ratio * size);
  return '▬'.repeat(filled) + '🔘' + '▬'.repeat(Math.max(size - filled, 0));
}

function embed(description) {
  return new EmbedBuilder().setColor(COLOR).setDescription(description);
}

/** Satu baris info lagu (DisTube Song): [judul](url) `durasi` */
function trackLine(song) {
  const name = (song.name ?? 'Unknown').replace(/[[\]]/g, '');
  const title = song.url ? `[${name}](${song.url})` : name;
  return `${title} \`${formatDuration(song.isLive ? 0 : song.duration)}\``;
}

/**
 * Cek umum sebelum command musik:
 * - user harus di voice channel
 * - (opsional) queue harus sudah ada
 * - user harus di voice channel yang sama dengan bot
 */
function checkVoice(interaction, distube, { needPlayer = true } = {}) {
  const voice = interaction.member?.voice?.channel;
  if (!voice) return { error: '❌ Masuk voice channel dulu, bro.' };

  const queue = distube.getQueue(interaction.guildId);
  if (needPlayer && !queue) return { error: '❌ Lagi nggak ada lagu yang diputar.' };

  const botChannel = distube.voices.get(interaction.guildId)?.channel ?? interaction.guild.members.me?.voice?.channel;
  if (botChannel && botChannel.id !== voice.id) {
    return { error: `❌ Gue lagi dipakai di <#${botChannel.id}>.` };
  }
  return { voice, queue, botChannel };
}

module.exports = { formatDuration, progressBar, embed, trackLine, checkVoice, COLOR };
