const { Configuration, OpenAIApi } = require('openai');
const config = require('../config');

let openai = null;
try {
  if (config.OPENAI_API_KEY && config.OPENAI_API_KEY !== 'sua_openai_api_key') {
    const configuration = new Configuration({
      apiKey: config.OPENAI_API_KEY,
    });
    openai = new OpenAIApi(configuration);
    console.log('Serviço de resumo configurado para usar OpenAI');
  } else {
    console.log('Chave da API do OpenAI não configurada, usando resumo local');
  }
} catch (error) {
  console.error('Erro ao configurar OpenAI:', error);
}

async function generateSummary(transcription) {
  try {
    if (!transcription || 
        transcription.trim() === '' || 
        transcription.includes('(sem fala detectada)') || 
        transcription.includes('(Nenhuma fala detectada na gravação)')) {
      return `# Gravação Processada

Não foi possível detectar fala clara nesta gravação. Isso pode ocorrer por vários motivos:

1. O microfone estava muito baixo ou mudo
2. Houve muito ruído de fundo
3. A fala foi muito curta ou rápida

**Sugestões:**
- Verifique se o microfone está funcionando corretamente
- Tente falar mais próximo ao microfone
- Fale pausadamente e com volume adequado

*Tente gravar novamente com essas sugestões em mente.*`;
    }
    
    // Para textos muito curtos, retornar o próprio texto formatado
    if (transcription.length < 30) {
      return `# Transcrição Completa\n\n${transcription}`;
    }
    
    // Tentar usar OpenAI se disponível
    if (openai) {
      try {
        const response = await openai.createChatCompletion({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: "Você é um assistente especializado em resumir conversas. Crie resumos concisos, bem estruturados e em formato Markdown."
            },
            {
              role: "user",
              content: `Por favor, gere um resumo conciso e bem estruturado da seguinte transcrição de uma conversa:

${transcription}

O resumo deve:
1. Destacar os principais pontos discutidos
2. Identificar as decisões ou conclusões importantes
3. Ser formatado em Markdown
4. Estar em português`
            }
          ],
          temperature: 0.7,
          max_tokens: 500
        });

        return response.data.choices[0].message.content;
      } catch (error) {
        console.error('Erro ao gerar resumo via OpenAI:', error);
        // Se falhar com OpenAI, utiliza o método de fallback
      }
    }
    
    // Se não tem OpenAI ou se falhou, usar resumo local
    return localSummaryGenerator(transcription);
  } catch (error) {
    console.error('Erro ao gerar resumo:', error);
    return "# Resumo\n\nNão foi possível gerar um resumo para esta conversa.";
  }
}

// Função para gerar resumo localmente
function localSummaryGenerator(transcription) {
  console.log('Gerando resumo localmente...');
  
  // Para textos curtos mas não muito curtos, formatar diretamente
  if (transcription.length < 200) {
    return `# Transcrição Completa\n\n${transcription}`;
  }
  
  // Dividir o texto em frases
  const sentences = transcription.split(/[.!?]+/).filter(s => s.trim().length > 5);
  
  // Se houver menos de 3 frases, retornar o texto original
  if (sentences.length <= 3) {
    return "# Resumo\n\n" + transcription;
  }
  
  // Encontrar as palavras mais frequentes (ignorando stopwords)
  const words = transcription.toLowerCase().split(/\s+/);
  const stopwords = ['a', 'o', 'e', 'de', 'que', 'do', 'da', 'em', 'um', 'para', 'com', 'não', 'uma', 'os', 'no', 'se', 'na', 'por', 'mais', 'as', 'dos', 'como', 'mas', 'ao', 'ele', 'das', 'seu', 'sua', 'ou', 'quando', 'muito', 'nos', 'já', 'eu', 'também', 'só', 'pelo', 'pela', 'até', 'isso', 'ela', 'entre', 'depois', 'sem', 'mesmo', 'aos', 'seus', 'quem', 'nas', 'me', 'esse', 'eles', 'você'];
  
  const wordFrequency = {};
  words.forEach(word => {
    if (word.length > 3 && !stopwords.includes(word)) {
      wordFrequency[word] = (wordFrequency[word] || 0) + 1;
    }
  });
  
  // Ordenar palavras por frequência
  const topWords = Object.entries(wordFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(entry => entry[0]);
  
  // Pontuar cada frase com base nas palavras frequentes
  const scoredSentences = sentences.map(sentence => {
    const lowerSentence = sentence.toLowerCase();
    const score = topWords.reduce((sum, word) => {
      return sum + (lowerSentence.includes(word) ? 1 : 0);
    }, 0);
    return { sentence, score };
  });
  
  // Selecionar as melhores frases (até 5 ou 30% do total)
  const topSentences = scoredSentences
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(5, Math.ceil(sentences.length * 0.3)));
  
  // Reordenar as frases na ordem em que aparecem no texto
  const orderedTopSentences = topSentences.sort((a, b) => {
    return sentences.indexOf(a.sentence) - sentences.indexOf(b.sentence);
  });
  
  // Construir o resumo final
  const summaryText = orderedTopSentences.map(item => item.sentence).join('. ');
  
  return `# Resumo da Conversa

${summaryText}.

*Resumo gerado automaticamente baseado nos pontos mais relevantes da conversa.*`;
}

module.exports = {
  generateSummary
}; 