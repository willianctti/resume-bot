module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        if (!interaction.isChatInputCommand()) return;

        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: 'Ocorreu um erro ao executar este comando!',
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: 'Ocorreu um erro ao executar este comando!',
                    ephemeral: true
                });
            }
        }
    },
}; 