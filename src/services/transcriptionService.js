const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { Readable } = require('stream');
const wav = require('node-wav');
const vosk = require('vosk');
const { spawn } = require('child_process');

const MODEL_PATH = './model'; 
let model;

async function ensureModel() {
    if (!fs.existsSync(MODEL_PATH)) {
        console.log('Downloading Portuguese model...');
        fs.mkdirSync(MODEL_PATH, { recursive: true });
        
        const modelUrl = 'https://alphacephei.com/vosk/models/vosk-model-small-pt-0.3.zip';
        const response = await fetch(modelUrl);
        const buffer = await response.buffer();
        
        const zipPath = path.join(MODEL_PATH, 'model.zip');
        fs.writeFileSync(zipPath, buffer);
        
        await new Promise((resolve, reject) => {
            const process = spawn('powershell', [
                'Expand-Archive',
                '-Path',
                zipPath,
                '-DestinationPath',
                MODEL_PATH
            ]);
            process.on('close', resolve);
            process.on('error', reject);
        });
        
        fs.unlinkSync(zipPath);
    }
    
    if (!model) {
        vosk.setLogLevel(-1);
        model = new vosk.Model(path.join(MODEL_PATH, 'vosk-model-small-pt-0.3'));
    }
}

async function convertPcmToWav(pcmPath) {
    const wavPath = pcmPath.replace('.pcm', '.wav');
    
    try {
        const stats = fs.statSync(pcmPath);
        console.log(`PCM file size: ${stats.size} bytes`);
        if (stats.size < 1000) {
            console.log('WARNING: PCM file is very small, may not contain audio data');
        }
    } catch (error) {
        console.error(`Cannot read PCM file stats: ${error.message}`);
    }
    
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
            '-f', 's16le',        
            '-ar', '48000',       
            '-ac', '2',           
            '-i', pcmPath,        
            '-af', 'volume=2.0,highpass=f=200,lowpass=f=3000',  // Amplificar volume e remover frequências que não são de voz
            '-ac', '1',           // Converter para mono (melhor para reconhecimento de voz)
            '-ar', '16000',       // Taxa de amostragem de 16kHz (ideal para Vosk)
            '-acodec', 'pcm_s16le', // Output codec
            '-y',                 // Overwrite output file
            wavPath               // Output file
        ]);

        let ffmpegOutput = '';
        ffmpeg.stderr.on('data', (data) => {
            ffmpegOutput += data.toString();
        });

        ffmpeg.on('close', (code) => {
            if (code === 0) {
                console.log(`Successfully converted PCM to WAV: ${wavPath}`);
                try {
                    const stats = fs.statSync(wavPath);
                    console.log(`WAV file size: ${stats.size} bytes`);
                } catch (error) {
                    console.error(`Cannot read WAV file stats: ${error.message}`);
                }
                resolve(wavPath);
            } else {
                console.error(`FFmpeg output: ${ffmpegOutput}`);
                reject(new Error(`FFmpeg process exited with code ${code}`));
            }
        });

        ffmpeg.on('error', (err) => {
            console.error(`FFmpeg error: ${err.message}`);
            reject(err);
        });
    });
}

async function transcribeAudio(audioFilePaths) {
    try {
        await ensureModel();
        const transcriptions = [];

        console.log(`Attempting to transcribe ${audioFilePaths.length} audio files`);
        
        for (const pcmPath of audioFilePaths) {
            console.log(`Converting and transcribing file: ${pcmPath}`);
            
            try {
                // Convert PCM to WAV
                const wavPath = await convertPcmToWav(pcmPath);
                
                const wavFile = fs.readFileSync(wavPath);
                const { sampleRate, channelData } = wav.decode(wavFile);
                
                console.log(`WAV file loaded: ${sampleRate}Hz, ${channelData.length} channels, ${channelData[0].length} samples`);

                const rec = new vosk.Recognizer({ 
                    model: model, 
                    sampleRate: sampleRate
                });
                
                // Configurar para sensibilidade adequada
                rec.setMaxAlternatives(5);  // Obter alternativas de reconhecimento
                rec.setWords(true);         // Incluir detalhes de palavras

                // Process audio in chunks
                const chunkSize = 4096;
                const audioData = channelData[0]; // Use first channel
                let transcriptionProgress = 0;
                
                for (let i = 0; i < audioData.length; i += chunkSize) {
                    const chunk = audioData.slice(i, i + chunkSize);
                    const end = i + chunkSize >= audioData.length;
                    rec.acceptWaveform(chunk, end);
                    
                    // Log progress for long files
                    const newProgress = Math.floor((i / audioData.length) * 100);
                    if (newProgress >= transcriptionProgress + 20) {
                        transcriptionProgress = newProgress;
                        console.log(`Transcription progress: ${transcriptionProgress}%`);
                    }
                }

                const result = rec.finalResult();
                rec.free();
                
                console.log(`Transcription result: ${JSON.stringify(result, null, 2)}`);

                const segments = result.result || [];
                const text = result.text || '';
                
                if (!text.trim()) {
                    console.log('No transcription text produced for this audio');
                }
                
                transcriptions.push({
                    text: text,
                    segments,
                    fileName: path.basename(pcmPath)
                });

                if (process.env.DELETE_AUDIO_AFTER_PROCESSING === 'true') {
                    try {
                        fs.unlinkSync(pcmPath);
                        fs.unlinkSync(wavPath);
                        console.log('Temporary audio files deleted');
                    } catch (error) {
                        console.error('Error deleting temporary files:', error);
                    }
                }
            } catch (error) {
                console.error(`Error transcribing file ${pcmPath}:`, error);
                continue;
            }
        }

        if (transcriptions.length === 0) {
            console.log('Não foi possível gerar transcrições com sucesso para nenhum arquivo de áudio');
            return '(Não foi possível reconhecer fala nos arquivos de áudio. Verifique se o microfone está funcionando corretamente e tente novamente.)';
        }

        let formattedTranscription = '';
        
        for (const t of transcriptions) {
            const speaker = extractSpeakerFromFileName(t.fileName);
            
            if (t.segments && t.segments.length > 0) {
                const segmentTexts = t.segments.map(segment => {
                    const timestamp = formatTimestamp(segment.start);
                    return `[${timestamp}] ${speaker}: ${segment.word}`;
                }).join(' ');
                
                formattedTranscription += segmentTexts + '\n\n';
            } else if (t.text && t.text.trim()) {
                formattedTranscription += `[${speaker}] ${t.text}\n\n`;
            } else {
                formattedTranscription += `[${speaker}] (sem fala detectada)\n\n`;
            }
        }

        if (!formattedTranscription.trim()) {
            formattedTranscription = '(Nenhuma fala detectada na gravação)';
        }
        
        console.log('Final transcription:', formattedTranscription);
        return formattedTranscription;
    } catch (error) {
        console.error('Error in transcription:', error);
        throw new Error('Failed to transcribe audio: ' + error.message);
    }
}

function formatTimestamp(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

function extractSpeakerFromFileName(fileName) {
    try {
        const parts = fileName.split('_');
        if (parts.length >= 2) {
            const userId = parts[1];
            return `Usuário ${userId}`;
        }
    } catch (error) {
        console.error('Error extracting speaker from filename:', error);
    }
    return 'Usuário';
}

module.exports = {
    transcribeAudio
}; 