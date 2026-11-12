require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Events, ActivityType, MessageFlags } = require('discord.js');
const { DisTube, checkFFmpeg } = require('distube');
const { YtDlpPlugin } = require('./ytdlp');
const { embed, trackLine } = require('./utils');

if (!process.env.DISCORD_TOKEN) {
  console.error('❌ DISCORD_TOKEN belum diisi di file .env');
  process.exit(1);
}

const IDLE_LEAVE_MS = 2 * 60 * 1000; // queue habis -> keluar setelah 2 menit
const EMPTY_LEAVE_MS = 60 * 1000; // voice channel kosong -> keluar setelah 1 menit
const DEFAULT_VOLUME = Math.min(Math.max(Number(process.env.DEFAULT_VOLUME) || 60, 1), 150);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

// ---------- DisTube + yt-dlp ----------
const ytdlp = new YtDlpPlugin({
  binaryPath: process.env.YTDLP_PATH || undefined,
  cookiesPath: process.env.YT_COOKIES_PATH || undefined,
  autoUpdate: process.env.YTDLP_AUTO_UPDATE !== 'false',
  streamMode: process.env.YTDLP_STREAM_MODE || 'pipe',
});

const distube = new DisTube(client, {
  plugins: [ytdlp],
  ffmpeg: { path: process.env.FFMPEG_PATH || 'ffmpeg' },
  emitNewSongOnly: false,
  emitAddSongWhenCreatingQueue: false,
  emitAddListWhenCreatingQueue: false,
});

// ---------- State per guild ----------
const idleTimers = new Map(); // guildId -> timeout (queue habis)
const emptyTimers = new Map(); // guildId -> timeout (voice kosong)
const npMessages = new Map(); // guildId -> Message "Now playing"
const textChannels = new Map(); // guildId -> text channel terakhir

const send = (guildId, payload) => textChannels.get(guildId)?.send(payload).catch(() => null);

function clearTimer(map, guildId) {
  clearTimeout(map.get(guildId));
  map.delete(guildId);
}

function deleteNowPlaying(guildId) {
  npMessages.get(guildId)?.delete().catch(() => null);
  npMessages.delete(guildId);
}

/** Stop queue (kalau ada) dan keluar dari voice. */
async function leave(guildId) {
  clearTimer(idleTimers, guildId);
  clearTimer(emptyTimers, guildId);
  deleteNowPlaying(guildId);
  const queue = distube.getQueue(guildId);
  if (queue) await queue.stop().catch(() => null);
  distube.voices.leave(guildId);
}

/** Dipanggil kalau queue habis: kasih tahu, lalu keluar 2 menit kemudian kalau nggak ada lagu baru. */
function scheduleIdleLeave(guildId) {
  clearTimer(idleTimers, guildId);
  send(guildId, { embeds: [embed('✅ Queue habis. Tambahin lagu pakai `/play`, atau gue cabut dalam 2 menit.')] });
  idleTimers.set(
    guildId,
    setTimeout(() => {
      idleTimers.delete(guildId);
      if (!distube.getQueue(guildId)) leave(guildId);
    }, IDLE_LEAVE_MS),
  );
}

const music = { distube, leave, scheduleIdleLeave, textChannels, DEFAULT_VOLUME };

// ---------- Events DisTube ----------
distube.on('initQueue', (queue) => {
  queue.setVolume(DEFAULT_VOLUME);
  if (queue.textChannel) textChannels.set(queue.id, queue.textChannel);
});

distube.on('playSong', async (queue, song) => {
  clearTimer(idleTimers, queue.id);
  deleteNowPlaying(queue.id);
  const msg = await send(queue.id, {
    embeds: [embed(`🎶 **Now playing:** ${trackLine(song)}\nRequested by ${song.member ?? 'unknown'}`)],
  });
  if (msg) npMessages.set(queue.id, msg);
});

distube.on('finish', (queue) => {
  deleteNowPlaying(queue.id);
  scheduleIdleLeave(queue.id);
});

distube.on('error', (error, queue, song) => {
  console.error(`Gagal muter "${song?.name ?? '?'}":`, error.message);
  const guildId = queue?.id;
  if (!guildId) return;
  send(guildId, {
    embeds: [embed(`⚠️ **${song?.name ?? 'Lagu ini'}** gagal diputar, skip ke berikutnya.\n\`${error.message.slice(0, 200)}\``)],
  });
  // Kalau ini lagu terakhir, DisTube langsung stop queue tanpa event "finish"
  if (!queue.songs.length && distube.voices.get(guildId)?.channel) {
    deleteNowPlaying(guildId);
    scheduleIdleLeave(guildId);
  }
});

distube.on('disconnect', (queue) => {
  clearTimer(idleTimers, queue.id);
  clearTimer(emptyTimers, queue.id);
  deleteNowPlaying(queue.id);
});

if (process.env.DEBUG === 'true') distube.on('debug', (m) => console.log('[distube]', m));

// ---------- Auto-leave kalau voice channel kosong ----------
client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const guild = newState.guild ?? oldState.guild;
  const channel = distube.voices.get(guild.id)?.channel ?? guild.members.me?.voice?.channel;
  if (!channel) return clearTimer(emptyTimers, guild.id);

  const humans = channel.members.filter((m) => !m.user.bot).size;
  if (humans > 0) return clearTimer(emptyTimers, guild.id);
  if (emptyTimers.has(guild.id)) return;

  emptyTimers.set(
    guild.id,
    setTimeout(() => {
      emptyTimers.delete(guild.id);
      const ch = distube.voices.get(guild.id)?.channel ?? guild.members.me?.voice?.channel;
      if (ch && ch.members.filter((m) => !m.user.bot).size === 0) {
        send(guild.id, { embeds: [embed('👋 Voice channel kosong, gue keluar dulu.')] });
        leave(guild.id);
      }
    }, EMPTY_LEAVE_MS),
  );
});

// ---------- Commands ----------
client.commands = new Collection();
const commandsDir = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsDir, file));
  client.commands.set(command.data.name, command);
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || !interaction.inGuild()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  // Batalkan timer auto-leave kalau ada aktivitas
  clearTimer(idleTimers, interaction.guildId);

  try {
    await command.execute(interaction, music);
  } catch (err) {
    // 10062 = interaction kedaluwarsa (>3 detik), 40060 = sudah dibalas proses lain
    if (err?.code === 10062 || err?.code === 40060) {
      console.warn(
        `⚠️  /${interaction.commandName}: interaction kedaluwarsa / sudah dibalas (${err.code}). ` +
          'Cek apakah ada 2 proses bot yang jalan barengan, atau koneksi internet lagi lambat.',
      );
      return;
    }
    console.error(`Error di /${interaction.commandName}:`, err);
    const payload = { content: '❌ Ada error. Cek console bot.', flags: MessageFlags.Ephemeral };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
  }
});

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Logged in as ${c.user.tag} (${c.guilds.cache.size} server)`);
  c.user.setActivity('/play', { type: ActivityType.Listening });
});

process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));

// ---------- Start ----------
(async () => {
  try {
    checkFFmpeg(distube);
    console.log('🎞️  FFmpeg OK');
  } catch {
    console.error(
      `❌ FFmpeg nggak ketemu ("${process.env.FFMPEG_PATH || 'ffmpeg'}"). Install: winget install Gyan.FFmpeg, ` +
        'lalu buka terminal baru. Atau isi FFMPEG_PATH di .env.',
    );
    process.exit(1);
  }

  try {
    const version = await ytdlp.prepare();
    console.log(`📼 yt-dlp ${version}${ytdlp.cookiesPath ? ' (pakai cookies)' : ''}`);
  } catch (err) {
    console.error(`❌ yt-dlp belum siap: ${err.message}`);
    console.error('   Install manual: winget install yt-dlp.yt-dlp, lalu isi YTDLP_PATH=yt-dlp di .env');
    process.exit(1);
  }

  await client.login(process.env.DISCORD_TOKEN);
})();
