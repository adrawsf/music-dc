const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { embed, trackLine, formatDuration, progressBar, checkVoice } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder().setName('nowplaying').setDescription('Lagu yang lagi diputar'),
  async execute(interaction, { distube }) {
    const { queue, error } = checkVoice(interaction, distube);
    if (error) return interaction.reply({ content: error, flags: MessageFlags.Ephemeral });

    const song = queue.songs[0];
    if (!song) return interaction.reply({ content: '❌ Nggak ada lagu.', flags: MessageFlags.Ephemeral });

    const pos = queue.currentTime;
    const length = song.isLive ? 0 : song.duration;
    const e = embed(
      `🎶 ${trackLine(song)}\n${song.uploader?.name ?? ''}\n\n` +
        `${progressBar(pos, length)}\n\`${formatDuration(pos)} / ${formatDuration(length)}\`` +
        `\n🔊 ${queue.volume}%${queue.paused ? ' • ⏸️ paused' : ''}`,
    );
    if (song.thumbnail) e.setThumbnail(song.thumbnail);
    return interaction.reply({ embeds: [e] });
  },
};
