const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { Playlist } = require('distube');
const { embed, trackLine, checkVoice } = require('../utils');

/** Ubah error DisTube/yt-dlp jadi pesan yang enak dibaca. */
function friendlyError(err) {
  const msg = err?.message ?? String(err);
  if (/Sign in to confirm|login|cookies/i.test(msg)) {
    return `❌ YouTube minta login buat video ini. Pasang cookies (lihat README) lalu coba lagi.\n\`${msg.slice(0, 200)}\``;
  }
  switch (err?.errorCode) {
    case 'NO_RESULT':
      return '❌ Nggak nemu apa-apa.';
    case 'NON_NSFW':
      return '❌ Video ini 18+, cuma bisa diputar di channel NSFW.';
    case 'EMPTY_FILTERED_PLAYLIST':
      return '❌ Semua lagu di playlist itu 18+, cuma bisa diputar di channel NSFW.';
    case 'EMPTY_PLAYLIST':
      return '❌ Playlist-nya kosong.';
    case 'VOICE_MISSING_PERMS':
      return '❌ Gue nggak bisa masuk voice channel itu. Cek izin **View Channel** dan **Connect** buat role bot.';
    case 'VOICE_FULL':
      return '❌ Voice channel-nya lagi penuh.';
    case 'YTDLP_NOT_FOUND':
      return '❌ yt-dlp nggak ketemu. Cek console bot.';
    default:
      return `❌ Gagal memuat: \`${msg.slice(0, 300)}\``;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Putar lagu dari judul atau link')
    .addStringOption((o) => o.setName('query').setDescription('Judul lagu atau URL').setRequired(true)),

  async execute(interaction, { distube }) {
    const { voice, error } = checkVoice(interaction, distube, { needPlayer: false });
    if (error) return interaction.reply({ content: error, flags: MessageFlags.Ephemeral });

    const perms = voice.permissionsFor(interaction.guild.members.me);
    const needed = { 'View Channel': PermissionFlagsBits.ViewChannel, Connect: PermissionFlagsBits.Connect, Speak: PermissionFlagsBits.Speak };
    const missing = Object.keys(needed).filter((name) => !perms?.has(needed[name]));
    if (missing.length) {
      return interaction.reply({
        content:
          `❌ Gue nggak punya izin **${missing.join(', ')}** di <#${voice.id}>.\n` +
          'Minta admin kasih izin itu ke role bot (Edit Channel → Permissions), atau cek pengaturan kategorinya.',
        flags: MessageFlags.Ephemeral,
      });
    }
    if (voice.full && !perms.has(PermissionFlagsBits.MoveMembers)) {
      return interaction.reply({ content: `❌ <#${voice.id}> lagi penuh.`, flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply();
    const query = interaction.options.getString('query', true).trim();

    let resolved;
    try {
      resolved = await distube.handler.resolve(query, { member: interaction.member });
    } catch (err) {
      console.warn(`/play "${query}" gagal:`, err.message);
      return interaction.editReply(friendlyError(err));
    }

    const queue = distube.getQueue(interaction.guildId);
    const willPlayNow = !queue || queue.songs.length === 0;

    try {
      await distube.play(voice, resolved, {
        member: interaction.member,
        textChannel: interaction.channel ?? undefined,
      });
    } catch (err) {
      console.warn(`/play "${query}" gagal:`, err.message);
      return interaction.editReply(friendlyError(err));
    }

    if (resolved instanceof Playlist) {
      return interaction.editReply({
        embeds: [embed(`📃 Nambahin **${resolved.songs.length}** lagu dari **${resolved.name ?? 'playlist'}**`)],
      });
    }
    const position = (distube.getQueue(interaction.guildId)?.songs.length ?? 1) - 1;
    return interaction.editReply({
      embeds: [
        embed(willPlayNow ? `▶️ Memutar ${trackLine(resolved)}` : `➕ Masuk queue (#${position}): ${trackLine(resolved)}`),
      ],
    });
  },
};
