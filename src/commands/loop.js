const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { RepeatMode } = require('distube');
const { embed, checkVoice } = require('../utils');

const MODES = {
  none: [RepeatMode.DISABLED, '➡️ Loop mati'],
  track: [RepeatMode.SONG, '🔂 Loop lagu ini'],
  queue: [RepeatMode.QUEUE, '🔁 Loop seluruh queue'],
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Atur mode loop')
    .addStringOption((o) =>
      o
        .setName('mode')
        .setDescription('Mode loop')
        .setRequired(true)
        .addChoices(
          { name: 'Off', value: 'none' },
          { name: 'Lagu ini', value: 'track' },
          { name: 'Seluruh queue', value: 'queue' },
        ),
    ),
  async execute(interaction, { distube }) {
    const { queue, error } = checkVoice(interaction, distube);
    if (error) return interaction.reply({ content: error, flags: MessageFlags.Ephemeral });

    const [mode, label] = MODES[interaction.options.getString('mode', true)];
    queue.setRepeatMode(mode);
    return interaction.reply({ embeds: [embed(label)] });
  },
};
