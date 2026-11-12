const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { embed, trackLine, formatDuration, checkVoice } = require('../utils');

const PER_PAGE = 10;
const LOOP_LABEL = ['off', '🔂 lagu', '🔁 queue'];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('Lihat antrian lagu')
    .addIntegerOption((o) => o.setName('page').setDescription('Halaman').setMinValue(1)),
  async execute(interaction, { distube }) {
    const { queue, error } = checkVoice(interaction, distube);
    if (error) return interaction.reply({ content: error, flags: MessageFlags.Ephemeral });

    const [current, ...upcoming] = queue.songs;
    const pages = Math.max(1, Math.ceil(upcoming.length / PER_PAGE));
    const page = Math.min(interaction.options.getInteger('page') ?? 1, pages);
    const start = (page - 1) * PER_PAGE;
    const list = upcoming
      .slice(start, start + PER_PAGE)
      .map((s, i) => `\`${start + i + 1}.\` ${trackLine(s)}`)
      .join('\n');
    const total = upcoming.reduce((sum, s) => sum + (s.duration || 0), 0);

    const e = embed(
      `**Now playing:** ${current ? trackLine(current) : '-'}\n\n` +
        (list || '_Queue kosong_') +
        `\n\n${upcoming.length} lagu • total ${formatDuration(total)} • loop: ${LOOP_LABEL[queue.repeatMode]}`,
    ).setFooter({ text: `Halaman ${page}/${pages}` });

    return interaction.reply({ embeds: [e] });
  },
};
