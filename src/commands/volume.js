const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { embed, checkVoice } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Atur volume (1-150)')
    .addIntegerOption((o) =>
      o.setName('level').setDescription('Volume dalam persen').setRequired(true).setMinValue(1).setMaxValue(150),
    ),
  async execute(interaction, { distube }) {
    const { queue, error } = checkVoice(interaction, distube);
    if (error) return interaction.reply({ content: error, flags: MessageFlags.Ephemeral });

    const level = interaction.options.getInteger('level', true);
    queue.setVolume(level);
    return interaction.reply({ embeds: [embed(`🔊 Volume: **${level}%**`)] });
  },
};
