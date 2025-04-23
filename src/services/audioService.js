const { createWriteStream } = require('fs');
const { pipeline } = require('stream/promises');
const { join } = require('path');
const prism = require('prism-media');
const { EndBehaviorType } = require('@discordjs/voice');
const { OpusEncoder } = require('@discordjs/opus');
const { Writable } = require('stream');

// Aumentar o limite de listeners para evitar avisos de vazamento de memória
require('events').EventEmitter.defaultMaxListeners = 20;

async function startRecording(client, connection, guildId) {
    const receiver = connection.receiver;
    
    const audioStreams = new Map();
    
    console.log('Starting voice recording...');
    
    receiver.speaking.on('start', (userId) => {
        const user = client.users.cache.get(userId);
        console.log(`${user.tag} started speaking`);

        const audioStream = receiver.subscribe(userId, {
            end: {
                behavior: EndBehaviorType.AfterSilence,
                duration: 1000  
            }
        });

        const opusDecoder = new prism.opus.Decoder({
            rate: 48000,
            channels: 2,
            frameSize: 960
        });

        const fileName = `${guildId}_${userId}_${Date.now()}.pcm`;
        const filePath = join(process.env.TEMP_DIRECTORY || './temp', fileName);
        const fileStream = createWriteStream(filePath);

        console.log(`Recording ${user.tag} to file: ${filePath}`);

        const handleError = (error) => {
            console.error(`Stream error for ${user.tag}:`, error);
        };

        audioStream.on('error', handleError);
        opusDecoder.on('error', handleError);
        fileStream.on('error', handleError);

        pipeline(audioStream, opusDecoder, fileStream)
            .then(() => {
                console.log(`Recording of ${user.tag} completed successfully`);
            })
            .catch(error => {
                if (error.code === 'ERR_STREAM_PREMATURE_CLOSE') {
                    console.log(`Audio pipeline for ${user.tag} ended (expected behavior)`);
                } else {
                    console.error(`Error in audio pipeline for ${user.tag}:`, error);
                }
            });

        audioStreams.set(userId, {
            stream: audioStream,
            filePath,
            user: user.tag,
            startTime: Date.now()
        });
    });
    
    receiver.speaking.on('end', (userId) => {
        const userInfo = audioStreams.get(userId);
        if (userInfo) {
            const { user } = userInfo;
            console.log(`${user} stopped speaking`);
        }
    });

    client.activeRecordings.set(guildId, {
        connection,
        audioStreams,
        startTime: Date.now()
    });
    
    console.log(`Recording setup complete for guild ${guildId}`);
}

async function stopRecording(client, guildId) {
    console.log(`Stopping recording for guild ${guildId}`);
    
    const recording = client.activeRecordings.get(guildId);
    if (!recording) {
        console.warn(`No active recording found for guild ${guildId}`);
        throw new Error('No active recording found');
    }

    const { connection, audioStreams } = recording;
    console.log(`Found ${audioStreams.size} audio streams to process`);

    for (const [userId, { stream, user }] of audioStreams) {
        console.log(`Stopping stream for user ${user}`);
        stream.destroy();
    }

    const filePaths = [];
    for (const [userId, { filePath, user, startTime }] of audioStreams) {
        const duration = (Date.now() - startTime) / 1000;
        console.log(`Recording for ${user}: ${filePath}, duration: ${duration.toFixed(2)}s`);
        filePaths.push(filePath);
    }

    console.log('Disconnecting from voice channel');
    connection.destroy();

    client.activeRecordings.delete(guildId);

    console.log(`Stopped recording for guild ${guildId}, processing ${filePaths.length} audio files`);
    
    return filePaths;
}

module.exports = {
    startRecording,
    stopRecording
}; 