const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { embed, checkVoice } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder().setName('stop').setDescription('Stop musik, hapus queue, dan keluar dari voice'),
  async execute(interaction, { distube, leave }) {
    const { botChannel, error } = checkVoice(interaction, distube, { needPlayer: false });
    if (error) return interaction.reply({ content: error, flags: MessageFlags.Ephemeral });
    if (!botChannel) {
      return interaction.reply({ content: '❌ Lagi nggak ada lagu yang diputar.', flags: MessageFlags.Ephemeral });
    }

    await leave(interaction.guildId);
    return interaction.reply({ embeds: [embed('⏹️ Stop. Sampai jumpa!')] });
  },
};
