const { SlashCommandBuilder } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource } = require('@discordjs/voice');
const { startRecording, stopRecording } = require('../services/audioService');
const { transcribeAudio } = require('../services/transcriptionService');
const { generateSummary } = require('../services/summaryService');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resumir')
        .setDescription('Gerencia a gravação e resumo de conversas em canais de voz')
        .addSubcommand(subcommand =>
            subcommand
                .setName('iniciar')
                .setDescription('Inicia a gravação da conversa'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('parar')
                .setDescription('Para a gravação e gera o resumo'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('testar-microfone')
                .setDescription('Testa se o microfone está funcionando corretamente'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('enviar-para')
                .setDescription('Define o canal para enviar o resumo')
                .addChannelOption(option =>
                    option
                        .setName('canal')
                        .setDescription('O canal onde o resumo será enviado')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('modo')
                .setDescription('Define o tipo de resumo')
                .addStringOption(option =>
                    option
                        .setName('tipo')
                        .setDescription('O tipo de resumo a ser gerado')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Simples', value: 'simples' },
                            { name: 'Detalhado', value: 'detalhado' },
                            { name: 'Tópicos', value: 'topicos' }
                        ))),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'iniciar':
                await handleStart(interaction);
                break;
            case 'parar':
                await handleStop(interaction);
                break;
            case 'testar-microfone':
                await handleTestMic(interaction);
                break;
            case 'enviar-para':
                await handleSetChannel(interaction);
                break;
            case 'modo':
                await handleSetMode(interaction);
                break;
        }
    }
};

async function handleStart(interaction) {
    try {
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return interaction.reply({
                content: 'Você precisa estar em um canal de voz para usar este comando!',
                ephemeral: true
            });
        }

        if (interaction.client.activeRecordings.has(interaction.guildId)) {
            return interaction.reply({
                content: 'Já existe uma gravação em andamento neste servidor!',
                ephemeral: true
            });
        }

        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });

        await startRecording(interaction.client, connection, interaction.guildId);

        await interaction.reply('🎙️ Iniciando gravação da conversa...');
    } catch (error) {
        console.error('Error starting recording:', error);
        await interaction.reply({
            content: 'Ocorreu um erro ao iniciar a gravação.',
            ephemeral: true
        });
    }
}

async function handleStop(interaction) {
    try {
        const recording = interaction.client.activeRecordings.get(interaction.guildId);
        if (!recording) {
            return interaction.reply({
                content: 'Não há gravação em andamento neste servidor!',
                ephemeral: true
            });
        }

        await interaction.deferReply();

        const audioFile = await stopRecording(interaction.client, interaction.guildId);

        // Transcribe audio
        await interaction.editReply('🔄 Transcrevendo o áudio...');
        const transcription = await transcribeAudio(audioFile);

        // Generate summary
        await interaction.editReply('🤖 Gerando resumo...');
        const summary = await generateSummary(transcription);

        // Send summary
        await interaction.editReply({
            content: '✅ Resumo da conversa:\n\n' + summary,
            files: summary.files || []
        });

    } catch (error) {
        console.error('Error stopping recording:', error);
        await interaction.editReply('Ocorreu um erro ao processar a gravação.');
    }
}

async function handleTestMic(interaction) {
    try {
        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
            return interaction.reply({
                content: 'Você precisa estar em um canal de voz para testar o microfone!',
                ephemeral: true
            });
        }

        if (interaction.client.activeRecordings.has(interaction.guildId)) {
            return interaction.reply({
                content: 'Já existe uma gravação em andamento neste servidor. Pare a gravação atual antes de testar o microfone.',
                ephemeral: true
            });
        }

        await interaction.deferReply();
        await interaction.editReply('🎙️ Iniciando teste de microfone. Fale algo nos próximos 5 segundos...');

        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guild.id,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        });

        interaction.client.micTest = true;
        
        await startRecording(interaction.client, connection, interaction.guildId);
        
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        await interaction.editReply('⏳ Processando áudio do teste...');
        
        const audioFiles = await stopRecording(interaction.client, interaction.guildId);
        
        if (!audioFiles || audioFiles.length === 0) {
            return interaction.editReply('❌ Nenhum áudio foi capturado durante o teste. Verifique se seu microfone está funcionando e não está mudo.');
        }
        
        let totalSize = 0;
        let fileDetails = [];
        
        for (const file of audioFiles) {
            try {
                const stats = fs.statSync(file);
                totalSize += stats.size;
                fileDetails.push(`- Arquivo: ${path.basename(file)}, Tamanho: ${(stats.size / 1024).toFixed(2)} KB`);
            } catch (error) {
                console.error(`Erro ao verificar arquivo ${file}:`, error);
            }
        }
        
        if (totalSize < 1000) {
            return interaction.editReply(`❌ Áudio muito pequeno detectado (${(totalSize / 1024).toFixed(2)} KB). Seu microfone parece estar mudo ou com volume muito baixo.`);
        }
        
        try {
            const transcription = await transcribeAudio(audioFiles);
            
            if (transcription.includes('Não foi possível reconhecer') || 
                transcription.includes('sem fala detectada')) {
                
                return interaction.editReply(`⚠️ Seu microfone parece estar funcionando, mas não conseguimos reconhecer palavras claras.

**Detalhes técnicos:**
- Tamanho total do áudio: ${(totalSize / 1024).toFixed(2)} KB
- Arquivos capturados: ${audioFiles.length}
${fileDetails.join('\n')}

**Sugestões:**
- Fale mais alto e claramente
- Verifique se há muito ruído de fundo
- Tente se aproximar mais do microfone`);
            }
            
            return interaction.editReply(`✅ Teste de microfone concluído com sucesso!

**Texto detectado:**
${transcription}

**Detalhes técnicos:**
- Tamanho total do áudio: ${(totalSize / 1024).toFixed(2)} KB
- Arquivos capturados: ${audioFiles.length}
${fileDetails.join('\n')}

Seu microfone está funcionando corretamente! Você pode usar o comando \`/resumir iniciar\` para começar a gravar.`);
            
        } catch (error) {
            console.error('Erro ao transcrever áudio de teste:', error);
            
            return interaction.editReply(`⚠️ Seu microfone está funcionando, mas houve um erro ao processar o áudio.

**Detalhes técnicos:**
- Tamanho total do áudio: ${(totalSize / 1024).toFixed(2)} KB
- Arquivos capturados: ${audioFiles.length}
${fileDetails.join('\n')}

Tente novamente ou use o comando \`/resumir iniciar\` para iniciar uma gravação normal.`);
        }
        
    } catch (error) {
        console.error('Erro ao testar microfone:', error);
        await interaction.editReply('❌ Ocorreu um erro ao testar o microfone. Por favor, tente novamente.');
    } finally {
        if (interaction.client.micTest) {
            delete interaction.client.micTest;
        }
    }
}

async function handleSetChannel(interaction) {
    const channel = interaction.options.getChannel('canal');
    await interaction.reply(`✅ Os resumos serão enviados para ${channel}`);
}

async function handleSetMode(interaction) {
    const mode = interaction.options.getString('tipo');
    await interaction.reply(`✅ Modo de resumo definido para: ${mode}`);
} 