const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { embed, checkVoice } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Hapus lagu dari queue')
    .addIntegerOption((o) =>
      o.setName('posisi').setDescription('Nomor lagu di /queue').setRequired(true).setMinValue(1),
    ),
  async execute(interaction, { distube }) {
    const { queue, error } = checkVoice(interaction, distube);
    if (error) return interaction.reply({ content: error, flags: MessageFlags.Ephemeral });

    const pos = interaction.options.getInteger('posisi', true);
    const upcoming = queue.songs.length - 1;
    if (pos > upcoming) {
      return interaction.reply({ content: `❌ Queue cuma ${upcoming} lagu.`, flags: MessageFlags.Ephemeral });
    }
    // songs[0] = lagu yang lagi diputar, jadi nomor 1 di /queue = songs[1]
    const [removed] = queue.songs.splice(pos, 1);
    return interaction.reply({ embeds: [embed(`🗑️ Dihapus: **${removed.name}**`)] });
  },
};
