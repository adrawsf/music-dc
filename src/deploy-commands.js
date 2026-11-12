// Jalankan sekali tiap kali lo nambah/ubah command:  npm run deploy
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { REST, Routes } = require('discord.js');

const { DISCORD_TOKEN, CLIENT_ID, GUILD_ID } = process.env;
if (!DISCORD_TOKEN || !CLIENT_ID) {
  console.error('❌ DISCORD_TOKEN dan CLIENT_ID wajib diisi di .env');
  process.exit(1);
}

const commands = fs
  .readdirSync(path.join(__dirname, 'commands'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => require(path.join(__dirname, 'commands', f)).data.toJSON());

const rest = new REST().setToken(DISCORD_TOKEN);

(async () => {
  const route = GUILD_ID
    ? Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
    : Routes.applicationCommands(CLIENT_ID);
  const data = await rest.put(route, { body: commands });
  console.log(`✅ ${data.length} command didaftarkan ${GUILD_ID ? `ke server ${GUILD_ID}` : 'secara global'}`);
})().catch((err) => {
  console.error('❌ Gagal deploy command:', err);
  process.exit(1);
});
