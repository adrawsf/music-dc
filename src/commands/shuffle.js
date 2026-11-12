const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { embed, checkVoice } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder().setName('shuffle').setDescription('Acak urutan queue'),
  async execute(interaction, { distube }) {
    const { queue, error } = checkVoice(interaction, distube);
    if (error) return interaction.reply({ content: error, flags: MessageFlags.Ephemeral });

    const upcoming = queue.songs.length - 1;
    if (upcoming < 2) {
      return interaction.reply({ content: '❌ Queue kurang dari 2 lagu.', flags: MessageFlags.Ephemeral });
    }
    await queue.shuffle(); // lagu yang lagi diputar nggak ikut diacak
    return interaction.reply({ embeds: [embed(`🔀 ${upcoming} lagu diacak`)] });
  },
};
