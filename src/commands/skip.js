const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { embed, checkVoice } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder().setName('skip').setDescription('Skip lagu yang lagi diputar'),
  async execute(interaction, { distube, scheduleIdleLeave }) {
    const { queue, error } = checkVoice(interaction, distube);
    if (error) return interaction.reply({ content: error, flags: MessageFlags.Ephemeral });

    const skipped = queue.songs[0];
    if (queue.songs.length > 1) {
      await queue.skip();
      return interaction.reply({ embeds: [embed(`⏭️ Skip **${skipped?.name ?? 'lagu'}**`)] });
    }

    // Nggak ada lagu berikutnya: stop queue, tapi tetap di voice 2 menit kayak queue habis biasa
    await queue.stop();
    await interaction.reply({ embeds: [embed(`⏭️ Skip **${skipped?.name ?? 'lagu'}**`)] });
    scheduleIdleLeave(interaction.guildId);
  },
};
