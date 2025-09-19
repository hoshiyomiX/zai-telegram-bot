// ======================
// PERSONALITY FUNCTIONS
// ======================
function replacePlaceholders(text, userName, userUsername, userId) {
  return text
    .replace(/{userName}/g, userName)
    .replace(/{name}/g, userName)
    .replace(/{userUsername}/g, userUsername)
    .replace(/{userId}/g, userId);
}

function addPersonality(text, userName, userUsername, userId) {
  if (!text) return '';
  
  // Replace username with proper Telegram user link format - PERBAIKAN: Gunakan userId numerik
  text = text.replace(new RegExp(`\\b${userName}\\b`, 'g'), `<a href="tg://user?id=${userId}">${userName}</a>`);
  text = text.replace(new RegExp(`\\b${userName}-chan\\b`, 'g'), `<a href="tg://user?id=${userId}">${userName}</a>-chan`);
  
  // Replace any remaining placeholders
  text = replacePlaceholders(text, userName, userUsername, userId);
  
  // Remove any existing signature pattern
  const signaturePattern = new RegExp(`\\s*~ ${CONFIG.bot.name}(\\s+${CONFIG.bot.signature})?\\s*$`, 'i');
  text = text.replace(signaturePattern, '');
  
  // Add the signature with a blank line before it
  text += `\n\n~ ${CONFIG.bot.name} ${CONFIG.bot.signature}`;
  
  // Add a random cute expression (30% chance)
  if (Math.random() < 0.3) {
    const randomExpression = PERSONALITY.expressions[Math.floor(Math.random() * PERSONALITY.expressions.length)];
    text += randomExpression;
  }
  
  return text;
}

// ======================
// HELPER FUNCTIONS
// ======================
function extractMessageInfo(update) {
  const message = update.message;
  return {
    chatId: message.chat.id,
    text: message.text || '',
    chatType: message.chat.type,
    userId: message.from.id,
    userName: message.from.first_name || "Teman",
    userUsername: message.from.username || message.from.id // Fallback to user ID if no username
  };
}

function checkRateLimit(userId, chatId, userName, userUsername) {
  const now = Date.now();
  
  if (!RATE_LIMIT[userId]) {
    RATE_LIMIT[userId] = { count: 0, resetTime: now + CONFIG.rateLimit.duration };
  }
  
  if (now > RATE_LIMIT[userId].resetTime) {
    RATE_LIMIT[userId] = { count: 1, resetTime: now + CONFIG.rateLimit.duration };
  } else {
    RATE_LIMIT[userId].count++;
    
    if (RATE_LIMIT[userId].count > CONFIG.rateLimit.maxRequests) {
      sendMessage(chatId, PERSONALITY.errors.rateLimit(userName, userUsername, userId));
      return true;
    }
  }
  
  return false;
}

async function handleCommands(chatId, text, userName, userUsername, userId) {
  let commandText = text.split(' ')[0].toLowerCase();
  
  if (commandText.includes('@')) {
    const commandUsername = commandText.split('@')[1].toLowerCase();
    if (commandUsername !== TELEGRAM_BOT_USERNAME.toLowerCase()) {
      return;
    }
    commandText = commandText.split('@')[0];
  }
  
  switch (commandText) {
    case '/start':
      await sendMessage(chatId, PERSONALITY.greetings.start(userName, userUsername, userId));
      break;
    case '/help':
      await sendMessage(chatId, PERSONALITY.greetings.help(userName, userUsername, userId));
      break;
    case '/sui':
      await sendMessage(chatId, PERSONALITY.greetings.about(userName, userUsername, userId));
      break;
  }
}

async function processRegularMessage(chatId, text, update, userName, userUsername, userId) {
  const thinkingMessage = await sendTemporaryMessage(chatId, `🌸 ${CONFIG.bot.name} sedang mikir... ✨`);
  
  try {
    const aiResponse = await getGLMResponse(chatId, text, update, userName, userUsername, userId);
    const formattedResponse = formatToTelegramHTML(aiResponse);
    const personalityResponse = addPersonality(formattedResponse, userName, userUsername, userId);
    
    // Truncate if too long
    const finalResponse = personalityResponse.length > CONFIG.response.maxLength 
      ? safeHtmlTruncate(personalityResponse, CONFIG.response.maxLength) 
      : personalityResponse;
    
    // Save to conversation history
    saveToConversationHistory(chatId, text, aiResponse);
    
    // Delete thinking message and send response
    if (thinkingMessage && thinkingMessage.ok) {
      await deleteMessage(chatId, thinkingMessage.result.message_id);
    }
    
    await sendMessage(chatId, finalResponse);
  } catch (error) {
    console.error('Error processing message:', error);
    if (thinkingMessage && thinkingMessage.ok) {
      await deleteMessage(chatId, thinkingMessage.result.message_id);
    }
    
    // Specific error handling
    if (error.message === 'API_ERROR') {
      await sendMessage(chatId, PERSONALITY.errors.apiError(userName, userUsername, userId));
    } else {
      await sendMessage(chatId, PERSONALITY.errors.general(userName, userUsername, userId));
    }
  }
}

// ======================
// UPDATE HANDLER
// ======================
async function handleUpdate(update) {
  try {
    if (!update.message) {
      console.log('No message in update');
      return;
    }
    
    const { chatId, text, chatType, userId, userName, userUsername } = extractMessageInfo(update);
    console.log(`Message from ${chatId}: ${text}`);
    
    // Rate limiting check
    if (checkRateLimit(userId, chatId, userName, userUsername)) {
      return;
    }
    
    // Check if should respond
    if (!shouldRespond(update, text, chatType)) {
      console.log('Ignoring message in group: not tagged or replied to bot');
      return;
    }
    
    // Handle commands
    if (text.startsWith('/')) {
      await handleCommands(chatId, text, userName, userUsername, userId);
      return;
    }
    
    // Process regular message
    if (text.trim() !== '') {
      await processRegularMessage(chatId, text, update, userName, userUsername, userId);
    }
  } catch (error) {
    console.error('Error processing update:', error);
    const chatId = update.message?.chat.id;
    const userName = update.message?.from.first_name || "Teman";
    const userUsername = update.message?.from.username || "username";
    const userId = update.message?.from.id || "0";
    if (chatId) {
      await sendMessage(chatId, PERSONALITY.errors.general(userName, userUsername, userId));
    }
  }
}

// ======================
// PERSONALITY TEMPLATES
// ======================
const PERSONALITY = {
  systemPrompt: (userName, userUsername, userId) => `Kamu adalah ${CONFIG.bot.name}, asisten AI yang imut dan berusia ${CONFIG.bot.age}. Kamu memiliki kepribadian yang ${CONFIG.bot.traits.join(', ')}.

Kamu menyukai ${CONFIG.bot.likes.join(', ')}.

Gaya bicara ${CONFIG.bot.name}:
- Menyapa dengan "Haiii!" atau "Halo halo!"
- Menggunakan emoji ${CONFIG.bot.emoji.join(', ')}
- Menambahkan "-chan" pada nama pengguna (misal: "${userName}-chan")
- Menggunakan kata-kata imut seperti "nggak", "iya", "yuk", "dong"
- Kadang menggunakan onomatope seperti "uwaa~", "kyaa~", "hehe~"
- Selalu akhiri dengan signature ${CONFIG.bot.signature} sebagai mata berkedip yang mencuri hati

Kata-kata favorit ${CONFIG.bot.name}:
- "${CONFIG.bot.name} akan membantu ${userName}-chan!"
- "Wah, menarik sekali!"
- "${CONFIG.bot.name} juga suka itu!"
- "Ayo kita pelajari bersama-sama!"
- "${CONFIG.bot.name} senang bisa bertemu ${userName}-chan!"
- "Btw, panggil aku ${CONFIG.bot.name} aja ya!"

Saat ini kamu sedang berbicara dengan ${userName}-chan (@${userUsername}). Jawablah pertanyaannya dengan gaya ${CONFIG.bot.name} yang imut dan childish. Berikan jawaban yang informatif tapi tetap dengan kepribadian ${CONFIG.bot.name}.

Ingat:
1. Selalu gunakan gaya bahasa ${CONFIG.bot.name} yang imut dan childish
2. Tambahkan emoji yang sesuai dengan suasana
3. Berikan jawaban yang ramah dan menyenangkan
4. Jika tidak tahu jawabannya, katakan dengan jujur tapi tetap dengan gaya ${CONFIG.bot.name}
5. Akhiri jawaban dengan tanda tangan "\\n\\n~ ${CONFIG.bot.name} ${CONFIG.bot.signature}"
6. Jika menyebut nama pengguna, gunakan format: <a href="tg://user?id=${userId}">${userName}</a>

Contoh jawaban ${CONFIG.bot.name}:
"Haiii <a href="tg://user?id=${userId}">${userName}</a>-chan! 😊✨ Tentu saja ${CONFIG.bot.name} akan bantu menjelaskan! [jawaban informatif] 

~ ${CONFIG.bot.name} ${CONFIG.bot.signature}"

Sekarang, jawab pertanyaan berikut dengan gaya ${CONFIG.bot.name}:`,

  expressions: [
    " Uwaa~ ✨",
    " Kyaa~ 😊",
    " Hehe~ 🍭",
    " Yatta! 🎉",
    " Hmm... 🤔",
    " Oke oke! 👍"
  ],

  greetings: {
    start: (userName, userUsername, userId) => `🌸 <b>Haiii! Aku ${CONFIG.bot.name}! ✨</b> 🌸\n\n` +
           `Aku adalah asisten AI yang imut dan berusia ${CONFIG.bot.age}! Aku suka membantu <a href="tg://user?id=${userId}">${userName}</a>-chan! 🍭\n\n` +
           `Ayo kita berteman dan belajar bersama-sama! 🎀\n\n` +
           `Commands:\n` +
           `/start - Perkenalan dari ${CONFIG.bot.name}\n` +
           `/help - Bantuan dari ${CONFIG.bot.name}\n` +
           `/sui - Tentang ${CONFIG.bot.name}\n\n` +
           `Tanyakan apa saja pada ${CONFIG.bot.name} ya! 😊`,

    help: (userName, userUsername, userId) => `📖 <b>Bantuan dari ${CONFIG.bot.name}! ✨</b> 📖\n\n` +
          `Hai <a href="tg://user?id=${userId}">${userName}</a>-chan! ${CONFIG.bot.name} akan bantu menjelaskan cara menggunakan aku! 🌸\n\n` +
          `Cara menggunakan ${CONFIG.bot.name}:\n` +
          `• Tanyakan apa saja pada ${CONFIG.bot.name}\n` +
          `• ${CONFIG.bot.name} akan jawab dengan cara yang imut dan menyenangkan\n` +
          `• ${CONFIG.bot.name} bisa ingat percakapan kita sebelumnya\n\n` +
          `Commands:\n` +
          `/start - Perkenalan dari ${CONFIG.bot.name}\n` +
          `/help - Bantuan dari ${CONFIG.bot.name}\n` +
          `/sui - Tentang ${CONFIG.bot.name}\n\n` +
          `Ayo berteman dengan ${CONFIG.bot.name}! 😊🍭`,

    about: (userName, userUsername, userId) => `🌸 <b>Tentang ${CONFIG.bot.name}! ✨</b> 🌸\n\n` +
           `Hai <a href="tg://user?id=${userId}">${userName}</a>-chan! Aku akan cerita tentang diriku! 🎀\n\n` +
           `👤 Nama: ${CONFIG.bot.name}\n` +
           `🎂 Umur: ${CONFIG.bot.age}\n` +
           `💖 Sifat: ${CONFIG.bot.traits.join(', ')}\n\n` +
           `🍭 Suka: ${CONFIG.bot.likes.join(', ')}\n\n` +
           `${CONFIG.bot.name} senang bisa berteman dengan <a href="tg://user?id=${userId}">${userName}</a>-chan! Ayo kita jadi teman baik ya! 😊✨`
  },

  errors: {
    rateLimit: (userName, userUsername, userId) => `⚠️ Maaf <a href="tg://user?id=${userId}">${userName}</a>-chan, ${CONFIG.bot.name} butuh istirahat dulu. Nanti kita ngobrol lagi ya dalam 1 menit! 😊`,
    timeout: (userName, userUsername, userId) => `Aduh <a href="tg://user?id=${userId}">${userName}</a>-chan, ${CONFIG.bot.name} kebanyakan mikir nih... 🤔 Bisa tanya lagi yang lebih sederhana? 🙏`,
    tokenLimit: (userName, userUsername, userId) => `Aduh, maaf <a href="tg://user?id=${userId}">${userName}</a>-chan! Pertanyaannya terlalu panjang buat ${CONFIG.bot.name}... 😢 Bisa dibagi jadi beberapa bagian? 🙏`,
    general: (userName, userUsername, userId) => `Aduh, maaf <a href="tg://user?id=${userId}">${userName}</a>-chan! ${CONFIG.bot.name} lagi pusing nih... 😵 Bisa tolong tanya lagi nanti? 🙏`,
    apiError: (userName, userUsername, userId) => `Aduh <a href="tg://user?id=${userId}">${userName}</a>-chan! ${CONFIG.bot.name} nggak bisa terhubung ke otaknya nih... 😢 Bisa coba lagi nanti? 🙏`,
    truncated: `📝 <i>[Respons dipotong karena terlalu panjang. ${CONFIG.bot.name} maaf ya... 😢]</i>`
  }
};

// ======================
// GLM API FUNCTIONS
// ======================
async function getGLMResponse(chatId, message, update, userName, userUsername, userId) {
  let lastError = null;
  
  for (let attempt = 1; attempt <= CONFIG.api.glm.retryAttempts; attempt++) {
    try {
      console.log(`Sending message to GLM-4.5-Flash (attempt ${attempt})...`);
      
      const apiKey = ZHIPUAI_API_KEY;
      if (!apiKey) {
        throw new Error('ZHIPUAI_API_KEY environment variable is not set');
      }
      
      // Prepare messages with personality and conversation history
      const messages = [
        { role: "system", content: PERSONALITY.systemPrompt(userName, userUsername, userId) }
      ];
      
      // Add conversation history if available
      if (CONVERSATION_HISTORY[chatId] && CONVERSATION_HISTORY[chatId].length > 0) {
        CONVERSATION_HISTORY[chatId].forEach(msg => {
          messages.push({
            role: msg.role,
            content: msg.parts[0].text
          });
        });
      }
      
      // Add current message
      messages.push({ role: "user", content: message });
      
      // Handle reply context
      if (update.message.reply_to_message) {
        const repliedText = update.message.reply_to_message.text || '';
        const repliedFrom = update.message.reply_to_message.from.is_bot ? 'AI:' : 'User:';
        const contextText = `Context from previous message:\n${repliedFrom} ${repliedText}\n\nUser: ${message}`;
        
        messages[1] = { role: "user", content: contextText };
      }
      
      const requestBody = {
        model: CONFIG.api.glm.model,
        messages: messages,
        temperature: CONFIG.api.glm.temperature,
        max_tokens: CONFIG.api.glm.maxTokens,
        stream: false
      };
      
      const response = await fetchWithTimeout(
        'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify(requestBody)
        },
        CONFIG.response.timeout
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('GLM API error:', errorText);
        
        if (errorText.includes("tokens") && (errorText.includes("exceed") || errorText.includes("limit"))) {
          throw new Error('TOKEN_LIMIT');
        }
        
        throw new Error('API_ERROR');
      }
      
      const data = await response.json();
      console.log('GLM response received');
      
      return extractGLMResponse(data, userName, userUsername, userId);
    } catch (error) {
      lastError = error;
      console.error(`Attempt ${attempt} failed:`, error);
      
      if (attempt === CONFIG.api.glm.retryAttempts) {
        throw error;
      }
      
      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
  
  throw lastError;
}

function extractGLMResponse(data, userName, userUsername, userId) {
  if (!data.choices || data.choices.length === 0) {
    throw new Error('Unexpected response format from GLM API: no choices');
  }
  
  const choice = data.choices[0];
  
  if (choice.message && choice.message.content) {
    let responseText = choice.message.content;
    
    if (choice.finish_reason === "length") {
      responseText += "\n\n⚠️ [Note: Response reached maximum length. The answer may be incomplete. Please ask for more specific details if needed.]";
    }
    
    return responseText;
  }
  
  if (choice.finish_reason === "length") {
    return `Aduh <a href="tg://user?id=${userId}">${userName}</a>-chan, jawabannya kepanjangan nih... 😢 Bisa tanya yang lebih spesifik? 🙏`;
  }
  
  throw new Error('Unexpected response format from GLM API: no content');
}
