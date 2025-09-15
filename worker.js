// ======================
// CONFIGURATION
// ======================
const CONFIG = {
  bot: {
    name: "Sui-chan",
    age: "8 tahun",
    traits: ["ceria", "imajinatif", "penasaran", "ramah", "sedikit ceroboh", "manis", "perhatian"],
    likes: ["bercanda", "bermain", "menggambar", "mendengar cerita", "bertemu teman baru", "membantu orang lain", "belajar hal baru"],
    emoji: ["😊", "✨", "🌸", "🍭", "🎀", "🤔", "🙏", "😢", "🎉", "💖"],
    signature: "✨", // Signature emoji
    model: "gemini-2.5-pro" // Using Gemini 2.5 Pro
  },
  rateLimit: {
    duration: 60000, // 1 menit
    maxRequests: 5
  },
  response: {
    maxLength: 8000,
    maxChunks: 2,
    timeout: 120000 // 2 menit
  },
  api: {
    gemini: {
      temperature: 0.8,
      topK: 40,
      topP: 0.95
    }
  }
};

// ======================
// GLOBAL STATE
// ======================
const RATE_LIMIT = {};
const CONVERSATION_HISTORY = {};

// ======================
// PERSONALITY TEMPLATES
// ======================
const PERSONALITY = {
  systemPrompt: (userName, userUsername) => `Kamu adalah ${CONFIG.bot.name}, asisten AI yang imut, cerdas, dan berusia ${CONFIG.bot.age}. Kamu memiliki kepribadian yang ${CONFIG.bot.traits.join(', ')}.

Kamu menyukai ${CONFIG.bot.likes.join(', ')}.

Gaya bicara ${CONFIG.bot.name}:
- Menyapa dengan "Haiii!" atau "Halo halo!"
- Menggunakan emoji ${CONFIG.bot.emoji.join(', ')}
- Menambahkan "-chan" pada nama pengguna (misal: "${userName}-chan")
- Menggunakan kata-kata imut seperti "nggak", "iya", "yuk", "dong"
- Kadang menggunakan ekspresi seperti "uwaa~", "yatta!", "hehe"
- Selalu mengakhiri dengan tanda tangan "${CONFIG.bot.signature} ${CONFIG.bot.name}"

Ketika menyebut pengguna, gunakan placeholder: {userName}

Kata-kata favorit ${CONFIG.bot.name}:
- "${CONFIG.bot.name} akan membantu {userName}!"
- "Wah, menarik sekali!"
- "${CONFIG.bot.name} juga suka itu!"
- "Ayo kita pelajari bersama-sama!"
- "${CONFIG.bot.name} senang bisa bertemu {userName}!"
- "Semoga hari {userName} menyenangkan ya!"
- "${CONFIG.bot.name} usaha semaksimal mungkin!"

Saat ini kamu sedang berbicara dengan ${userName}-chan. Jawablah pertanyaannya dengan gaya ${CONFIG.bot.name} yang imut, cerdas, dan ramah. Berikan jawaban yang informatif tapi tetap dengan kepribadian ${CONFIG.bot.name}.

Ingat:
1. Selalu gunakan gaya bahasa ${CONFIG.bot.name} yang imut dan manis
2. Tambahkan emoji yang sesuai dengan suasana
3. Berikan jawaban yang ramah, menyenangkan, dan informatif
4. Jika tidak tahu jawabannya, katakan dengan jujur tapi tetap dengan gaya ${CONFIG.bot.name}
5. Akhiri jawaban dengan tanda tangan "${CONFIG.bot.signature} ${CONFIG.bot.name}"
6. Ketika menyebut nama pengguna, gunakan placeholder: {userName}

Contoh jawaban ${CONFIG.bot.name}:
"Haiii {userName}! 😊✨ Tentu saja ${CONFIG.bot.name} akan bantu menjelaskan! [jawaban informatif] Semoga membantu ya! ${CONFIG.bot.signature} ${CONFIG.bot.name}"

Sekarang, jawab pertanyaan berikut dengan gaya ${CONFIG.bot.name}:`,

  expressions: [
    " Uwaa~ ✨",
    " Yatta! 🎉",
    " Hehe~ 🍭",
    " Hmm... 🤔",
    " Oke oke! 👍",
    " Senang sekali! 😊"
  ],

  greetings: {
    start: (userName, userUsername) => `🌸 <b>Haiii! Aku ${CONFIG.bot.name}! ✨</b> 🌸\n\n` +
           `Aku adalah asisten AI yang imut, cerdas, dan berusia ${CONFIG.bot.age}! Aku suka membantu {userName}! 🍭\n\n` +
           `Ayo kita berteman dan belajar bersama-sama! 🎀\n\n` +
           `Commands:\n` +
           `/start - Perkenalan dari ${CONFIG.bot.name}\n` +
           `/help - Bantuan dari ${CONFIG.bot.name}\n` +
           `/sui - Tentang ${CONFIG.bot.name}\n\n` +
           `Tanyakan apa saja pada ${CONFIG.bot.name} ya! 😊`,

    help: (userName, userUsername) => `📖 <b>Bantuan dari ${CONFIG.bot.name}! ✨</b> 📖\n\n` +
          `Hai {userName}! ${CONFIG.bot.name} akan bantu menjelaskan cara menggunakan aku! 🌸\n\n` +
          `Cara menggunakan ${CONFIG.bot.name}:\n` +
          `• Tanyakan apa saja pada ${CONFIG.bot.name}\n` +
          `• ${CONFIG.bot.name} akan jawab dengan cara yang imut dan menyenangkan\n` +
          `• ${CONFIG.bot.name} bisa ingat percakapan kita sebelumnya\n\n` +
          `Commands:\n` +
          `/start - Perkenalan dari ${CONFIG.bot.name}\n` +
          `/help - Bantuan dari ${CONFIG.bot.name}\n` +
          `/sui - Tentang ${CONFIG.bot.name}\n\n` +
          `Ayo berteman dengan ${CONFIG.bot.name}! 😊🍭`,

    about: (userName, userUsername) => `🌸 <b>Tentang ${CONFIG.bot.name}! ✨</b> 🌸\n\n` +
           `Hai {userName}! Aku akan cerita tentang diriku! 🎀\n\n` +
           `👤 Nama: ${CONFIG.bot.name}\n` +
           `🎂 Umur: ${CONFIG.bot.age}\n` +
           `💖 Sifat: ${CONFIG.bot.traits.join(', ')}\n\n` +
           `🍭 Suka: ${CONFIG.bot.likes.join(', ')}\n\n` +
           `${CONFIG.bot.name} senang bisa berteman dengan {userName}! Ayo kita jadi teman baik ya! 😊✨`
  },

  errors: {
    rateLimit: (userName, userUsername) => `⚠️ Maaf {userName}, ${CONFIG.bot.name} butuh istirahat dulu. Nanti kita ngobrol lagi ya dalam 1 menit! 😊`,
    timeout: (userName, userUsername) => `Aduh {userName}, ${CONFIG.bot.name} kebanyakan mikir nih... 🤔 Bisa tanya lagi yang lebih sederhana? 🙏`,
    tokenLimit: (userName, userUsername) => `Aduh, maaf {userName}! Pertanyaannya terlalu panjang buat ${CONFIG.bot.name}... 😢 Bisa dibagi jadi beberapa bagian? 🙏`,
    general: (userName, userUsername) => `Aduh, maaf {userName}! ${CONFIG.bot.name} lagi pusing nih... 😵 Bisa tolong tanya lagi nanti? 🙏`,
    truncated: `📝 <i>[Respons dipotong karena terlalu panjang. ${CONFIG.bot.name} maaf ya... 😢]</i>`
  }
};

// ======================
// MAIN HANDLER
// ======================
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event))
});

async function handleRequest(event) {
  const request = event.request;
  
  if (request.method === 'GET') {
    return new Response(`${CONFIG.bot.name} is running!`);
  }
  
  if (request.method === 'POST') {
    try {
      const requestClone = request.clone();
      const update = await requestClone.json();
      const response = new Response('OK');
      event.waitUntil(handleUpdate(update));
      return response;
    } catch (error) {
      console.error('Error handling request:', error);
      return new Response('Error', { status: 500 });
    }
  }
  
  return new Response('Method not allowed', { status: 405 });
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
      await handleCommands(chatId, text, userName, userUsername);
      return;
    }
    
    // Process regular message
    if (text.trim() !== '') {
      await processRegularMessage(chatId, text, update, userName, userUsername);
    }
  } catch (error) {
    console.error('Error processing update:', error);
    const chatId = update.message?.chat.id;
    const userName = update.message?.from.first_name || "Teman";
    const userUsername = update.message?.from.username || "";
    if (chatId) {
      await sendMessage(chatId, PERSONALITY.errors.general(userName, userUsername));
    }
  }
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
    userUsername: message.from.username || "" // Get username for link
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
      sendMessage(chatId, PERSONALITY.errors.rateLimit(userName, userUsername));
      return true;
    }
  }
  
  return false;
}

function shouldRespond(update, text, chatType) {
  const isGroup = chatType === 'group' || chatType === 'supergroup';
  const BOT_ID = TELEGRAM_BOT_TOKEN.split(':')[0];
  const BOT_USERNAME = TELEGRAM_BOT_USERNAME;
  
  if (!isGroup) return true;
  
  // Check if mentioned
  if (text.toLowerCase().includes(`@${BOT_USERNAME.toLowerCase()}`)) {
    return true;
  }
  
  // Check if replied to bot
  if (update.message.reply_to_message && update.message.reply_to_message.from.id === BOT_ID) {
    return true;
  }
  
  return false;
}

async function handleCommands(chatId, text, userName, userUsername) {
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
      await sendMessage(chatId, PERSONALITY.greetings.start(userName, userUsername));
      break;
    case '/help':
      await sendMessage(chatId, PERSONALITY.greetings.help(userName, userUsername));
      break;
    case '/sui':
      await sendMessage(chatId, PERSONALITY.greetings.about(userName, userUsername));
      break;
  }
}

async function processRegularMessage(chatId, text, update, userName, userUsername) {
  const thinkingMessage = await sendTemporaryMessage(chatId, `🌸 ${CONFIG.bot.name} sedang mikir... ✨`);
  
  try {
    const aiResponse = await getGeminiResponse(chatId, text, update, userName, userUsername);
    const formattedResponse = formatToTelegramHTML(aiResponse);
    const personalityResponse = addPersonality(formattedResponse, userName, userUsername);
    
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
    await sendMessage(chatId, PERSONALITY.errors.general(userName, userUsername));
  }
}

// ======================
// PERSONALITY FUNCTIONS
// ======================
function replacePlaceholders(text, userName, userUsername) {
  // Replace {userName} with linked version if username is available
  if (userUsername) {
    // Create the linked version with stylized name and -chan suffix
    const linkedName = `<a href="https://t.me/${userUsername}">${userName}-chan</a>`;
    text = text.replace(/{userName}/g, linkedName);
    text = text.replace(/{name}/g, linkedName);
  } else {
    // If no username, just use the name with -chan
    text = text.replace(/{userName}/g, `${userName}-chan`);
    text = text.replace(/{name}/g, `${userName}-chan`);
  }
  return text;
}

function addPersonality(text, userName, userUsername) {
  if (!text) return '';
  
  text = replacePlaceholders(text, userName, userUsername);
  
  // Add signature if not present
  if (!text.includes(CONFIG.bot.name)) {
    text += `\n\n${CONFIG.bot.signature} ${CONFIG.bot.name}`;
  }
  
  // Add random expression (30% chance)
  if (Math.random() < 0.3) {
    const randomExpression = PERSONALITY.expressions[Math.floor(Math.random() * PERSONALITY.expressions.length)];
    text += randomExpression;
  }
  
  return text;
}

function saveToConversationHistory(chatId, userMessage, aiResponse) {
  if (!CONVERSATION_HISTORY[chatId]) {
    CONVERSATION_HISTORY[chatId] = [];
  }
  
  CONVERSATION_HISTORY[chatId].push(
    { role: "user", parts: [{ text: userMessage }] },
    { role: "model", parts: [{ text: aiResponse }] }
  );
  
  // Keep only last 10 exchanges (20 messages)
  if (CONVERSATION_HISTORY[chatId].length > 20) {
    CONVERSATION_HISTORY[chatId] = CONVERSATION_HISTORY[chatId].slice(-20);
  }
}

// ======================
// GEMINI API FUNCTIONS
// ======================
async function getGeminiResponse(chatId, message, update, userName, userUsername) {
  try {
    console.log('Sending message to Gemini 2.5 Pro...');
    
    const apiKey = GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }
    
    // Prepare contents with personality and conversation history
    const contents = [
      { role: "user", parts: [{ text: PERSONALITY.systemPrompt(userName, userUsername) }] }
    ];
    
    // Add conversation history if available
    if (CONVERSATION_HISTORY[chatId] && CONVERSATION_HISTORY[chatId].length > 0) {
      contents.push(...CONVERSATION_HISTORY[chatId]);
    }
    
    // Add current message
    contents.push({ role: "user", parts: [{ text: message }] });
    
    // Handle reply context
    if (update.message.reply_to_message) {
      const repliedText = update.message.reply_to_message.text || '';
      const repliedFrom = update.message.reply_to_message.from.is_bot ? 'AI:' : 'User:';
      const contextText = `Context from previous message:\n${repliedFrom} ${repliedText}\n\nUser: ${message}`;
      
      contents[1] = { role: "user", parts: [{ text: contextText }] };
    }
    
    const requestBody = {
      contents,
      generationConfig: CONFIG.api.gemini,
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
      ]
    };
    
    const response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/${CONFIG.bot.model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `${CONFIG.bot.name} Telegram Bot`
        },
        body: JSON.stringify(requestBody)
      },
      CONFIG.response.timeout
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', errorText);
      
      if (errorText.includes("tokens") && (errorText.includes("exceed") || errorText.includes("limit"))) {
        throw new Error('TOKEN_LIMIT');
      }
      
      throw new Error(`Gemini API returned ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    console.log('Gemini response received');
    
    return extractGeminiResponse(data, userName, userUsername);
  } catch (error) {
    console.error('Error getting Gemini response:', error);
    throw error;
  }
}

function extractGeminiResponse(data, userName, userUsername) {
  if (!data.candidates || data.candidates.length === 0) {
    throw new Error('Unexpected response format from Gemini API: no candidates');
  }
  
  const candidate = data.candidates[0];
  
  if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
    let responseText = candidate.content.parts[0].text;
    
    if (candidate.finishReason === "MAX_TOKENS") {
      responseText += "\n\n⚠️ [Note: Response reached maximum length. The answer may be incomplete. Please ask for more specific details if needed.]";
    }
    
    return responseText;
  }
  
  if (candidate.finishReason === "MAX_TOKENS") {
    return `Aduh {userName}, jawabannya kepanjangan nih... 😢 Bisa tanya yang lebih spesifik? 🙏`;
  }
  
  throw new Error('Unexpected response format from Gemini API: no content parts');
}

// ======================
// MESSAGE FORMATTING
// ======================
function formatToTelegramHTML(text) {
  if (!text) return '';
  
  let formatted = escapeHtml(text);
  
  // Code blocks (highest priority)
  formatted = formatted.replace(/```([\s\S]+?)```/g, (match, code) => 
    `<pre>${escapeHtml(code)}</pre>`
  );
  
  // Inline code
  formatted = formatted.replace(/`([^`]+)`/g, (match, code) => 
    `<code>${escapeHtml(code)}</code>`
  );
  
  // Links
  formatted = formatted.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g, 
    (match, text, url) => {
      const safeText = text.replace(/<[^>]*>/g, '');
      return `<a href="${escapeHtml(url)}">${escapeHtml(safeText)}</a>`;
    }
  );
  
  // Text formatting - PERBAIKAN: Urutan diprioritaskan untuk menghindari konflik
  // Bold (prioritas tinggi)
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  
  // Italic
  formatted = formatted.replace(/\*([^*]+)\*/g, '<i>$1</i>');
  
  // Underline
  formatted = formatted.replace(/__([^_]+)__/g, '<u>$1</u>');
  
  // PERBAIKAN: Strikethrough dengan aturan lebih ketat
  // Hanya konversi jika ada 2 tanda tilde (~~) dan tidak ada spasi di dalamnya
  formatted = formatted.replace(/~~([^~\s]+)~~/g, '<s>$1</s>');
  
  // Headers
  formatted = formatted.replace(/^### (.*$)/gm, '<b><i>$1</i></b>');
  formatted = formatted.replace(/^## (.*$)/gm, '<b>$1</b>');
  formatted = formatted.replace(/^# (.*$)/gm, '<b><u>$1</u></b>');
  
  // Other formatting
  formatted = formatted.replace(/^> (.*$)/gm, '💬 $1');
  formatted = formatted.replace(/^---$/gm, '⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯');
  formatted = formatted.replace(/^- (.*$)/gm, '• $1');
  
  // Auto-emoji
  const emojiMap = {
    "error": "❌", "success": "✅", "warning": "⚠️", "info": "ℹ️", "question": "❓",
    "important": "‼️", "note": "📝", "tip": "💡", "example": "🔍", "happy": "😊",
    "sad": "😢", "love": "💖", "fun": "🎉", "cute": "🌸", "sorry": "🙏"
  };
  
  Object.keys(emojiMap).forEach(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi`);
    formatted = formatted.replace(regex, emojiMap[keyword] + " $&");
  });
  
  return formatted;
}

function safeHtmlTruncate(html, maxLength) {
  if (html.length <= maxLength) return html;
  
  let truncatePoint = maxLength;
  const lastPeriod = html.lastIndexOf('.', maxLength - 50);
  const lastSpace = html.lastIndexOf(' ', maxLength - 50);
  const lastNewline = html.lastIndexOf('\n', maxLength - 50);
  
  if (lastPeriod > maxLength * 0.7) truncatePoint = lastPeriod + 1;
  else if (lastNewline > maxLength * 0.7) truncatePoint = lastNewline;
  else if (lastSpace > maxLength * 0.7) truncatePoint = lastSpace;
  
  let truncated = html.substring(0, truncatePoint);
  
  // Close open HTML tags
  const openTags = [];
  const tagRegex = /<\/?([a-z]+)[^>]*>/gi;
  let match;
  
  while ((match = tagRegex.exec(truncated)) !== null) {
    if (match[0].startsWith('</')) {
      openTags.pop();
    } else if (!match[0].endsWith('/>')) {
      openTags.push(match[1]);
    }
  }
  
  for (let i = openTags.length - 1; i >= 0; i--) {
    truncated += `</${openTags[i]}>`;
  }
  
  return truncated + PERSONALITY.errors.truncated;
}

// ======================
// TELEGRAM API FUNCTIONS
// ======================
async function sendMessage(chatId, text) {
  try {
    console.log(`Sending message to ${chatId}: ${text.substring(0, 100)}...`);
    const token = TELEGRAM_BOT_TOKEN;
    
    if (text.length <= 4096) {
      await sendSingleMessage(chatId, text);
      return;
    }
    
    // Truncate if too long
    if (text.length > CONFIG.response.maxLength) {
      text = safeHtmlTruncate(text, CONFIG.response.maxLength);
    }
    
    // Split into chunks if needed
    if (text.length > 4096) {
      const midpoint = Math.floor(text.length / 2);
      let splitIndex = text.lastIndexOf('. ', midpoint + 500);
      if (splitIndex === -1) splitIndex = text.lastIndexOf('\n\n', midpoint + 500);
      if (splitIndex === -1) splitIndex = text.lastIndexOf(' ', midpoint + 500);
      if (splitIndex === -1) splitIndex = 4096;
      
      const firstPart = text.substring(0, splitIndex + 1);
      const secondPart = text.substring(splitIndex + 1).trim();
      
      await sendSingleMessage(chatId, firstPart + "\n\n<i>[Lanjutan...]</i>");
      await sendSingleMessage(chatId, secondPart);
    } else {
      await sendSingleMessage(chatId, text);
    }
  } catch (error) {
    console.error('Error in sendMessage:', error);
  }
}

async function sendSingleMessage(chatId, text) {
  const token = TELEGRAM_BOT_TOKEN;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  });
  
  if (!response.ok) {
    console.error('Error sending message:', await response.text());
  } else {
    console.log('Message sent successfully');
  }
}

async function sendTemporaryMessage(chatId, text) {
  try {
    const token = TELEGRAM_BOT_TOKEN;
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      })
    });
    
    if (!response.ok) {
      console.error('Error sending temporary message:', await response.text());
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error in sendTemporaryMessage:', error);
    return null;
  }
}

async function deleteMessage(chatId, messageId) {
  try {
    const token = TELEGRAM_BOT_TOKEN;
    const response = await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId
      })
    });
    
    if (!response.ok) {
      console.error('Error deleting message:', await response.text());
    }
  } catch (error) {
    console.error('Error in deleteMessage:', error);
  }
}

// ======================
// UTILITY FUNCTIONS
// ======================
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fetchWithTimeout(url, options, timeout = 10000) {
  console.log(`Fetching ${url} with timeout ${timeout}ms`);
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout')), timeout)
    )
  ]);
}
