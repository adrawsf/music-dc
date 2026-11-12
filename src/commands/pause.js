const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { embed, checkVoice } = require('../utils');

module.exports = {
  data: new SlashCommandBuilder().setName('pause').setDescription('Pause / resume lagu (toggle)'),
  async execute(interaction, { distube }) {
    const { queue, error } = checkVoice(interaction, distube);
    if (error) return interaction.reply({ content: error, flags: MessageFlags.Ephemeral });

    const pausing = !queue.paused;
    if (pausing) await queue.pause();
    else await queue.resume();
    return interaction.reply({ embeds: [embed(pausing ? '⏸️ Di-pause' : '▶️ Lanjut')] });
  },
};
