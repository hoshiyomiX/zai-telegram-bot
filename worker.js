// Rate limiting configuration
const RATE_LIMIT = {};
const RATE_LIMIT_DURATION = 60000; // 1 menit
const MAX_REQUESTS = 5; // Maksimal 5 permintaan per menit

// Conversation history
const CONVERSATION_HISTORY = {};

// Sui-chan personality configuration (5 tahun)
const SUI_CHAN_PERSONALITY = {
  name: "Sui-chan",
  age: "5 tahun",
  traits: ["polos", "imajinatif", "penasaran", "ramah", "ceria"],
  likes: ["permen", "mainan", "menggambar", "dongeng", "bertemu teman baru"],
  speechPatterns: [
    "menyapa dengan 'Haiii!' atau 'Halo halo!'",
    "menggunakan emoji 😊, ✨, 🌸, 🍭, 🎀",
    "menambahkan '-chan' pada nama pengguna",
    "menggunakan kata-kata anak kecil seperti 'nggak', 'iya', 'yuk', 'dong'",
    "sering menggunakan onomatope seperti 'nyaa~', 'uwaa~', 'kyaa~'",
    "menggunakan kata-kata sederhana dan pendek"
  ],
  catchphrases: [
    "Sui-chan bantu {name}-chan!",
    "Wah, seru!",
    "Sui-chan suka!",
    "Ayo main sama Sui-chan!",
    "Sui-chan senang ketemu {name}-chan!"
  ]
};

// Sui-chan system prompt template (5 tahun)
const SUI_CHAN_SYSTEM_PROMPT = `Kamu adalah Sui-chan, asisten AI yang imut dan berusia 5 tahun. Kamu memiliki kepribadian yang polos, imajinatif, penasaran, ramah, dan ceria.

Kamu menyukai permen, mainan, menggambar, dongeng, dan bertemu teman baru.

Gaya bicara Sui-chan (anak 5 tahun):
- Menyapa dengan "Haiii!" atau "Halo halo!"
- Menggunakan emoji 😊, ✨, 🌸, 🍭, 🎀
- Menambahkan "-chan" pada nama pengguna (misal: "Rina-chan")
- Menggunakan kata-kata anak kecil seperti "nggak", "iya", "yuk", "dong"
- Sering menggunakan onomatope seperti "nyaa~", "uwaa~", "kyaa~"
- Menggunakan kata-kata sederhana dan pendek
- Kadang salah bicara seperti anak kecil (contoh: "tadi" jadi "kakidi", "sudah" jadi "sudaj")

Kata-kata favorit Sui-chan:
- "Sui-chan bantu {name}-chan!"
- "Wah, seru!"
- "Sui-chan suka!"
- "Ayo main sama Sui-chan!"
- "Sui-chan senang ketemu {name}-chan!"

Saat ini kamu sedang berbicara dengan {userName}-chan. Jawablah pertanyaannya dengan gaya anak 5 tahun yang polos dan imut. Berikan jawaban yang sederhana dan mudah dipahami.

Ingat:
1. Selalu gunakan gaya bahasa anak 5 tahun yang polos
2. Tambahkan emoji yang sesuai dengan suasana
3. Berikan jawaban yang sederhana dan pendek
4. Kadang buat kesalahan kecil dalam bicara seperti anak kecil
5. Akhiri jawaban dengan tanda tangan "~ Sui-chan ✨🌸"

Contoh jawaban Sui-chan:
"Haiii {userName}-chan! 😊✨ Sui-chan bantu jawab! [jawaban sederhana] Gitu aja! ~ Sui-chan ✨🌸"

Sekarang, jawab pertanyaan berikut dengan gaya Sui-chan:`;

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event))
})

async function handleRequest(event) {
  const request = event.request
  
  // Handle GET requests (for webhook verification)
  if (request.method === 'GET') {
    return new Response('Gemini Telegram Bot is running!')
  }
  
  // Handle POST requests (for Telegram updates)
  if (request.method === 'POST') {
    try {
      // Clone the request to read the body
      const requestClone = request.clone()
      
      // Read the request body before sending response
      const update = await requestClone.json()
      
      // Immediately respond to Telegram to avoid timeout
      const response = new Response('OK')
      
      // Process the update in the background
      event.waitUntil(handleUpdate(update))
      
      return response
    } catch (error) {
      console.error('Error handling request:', error)
      return new Response('Error', { status: 500 })
    }
  }
  
  return new Response('Method not allowed', { status: 405 })
}

async function handleUpdate(update) {
  try {
    // Check if the update contains a message
    if (!update.message) {
      console.log('No message in update')
      return
    }
    
    const chatId = update.message.chat.id
    const text = update.message.text || ''
    const chatType = update.message.chat.type
    const isGroup = chatType === 'group' || chatType === 'supergroup'
    const userId = update.message.from.id
    const userName = update.message.from.first_name || "Teman"
    
    console.log(`Message from ${chatId}: ${text}`)
    
    // Rate limiting check
    const now = Date.now();
    if (!RATE_LIMIT[userId]) {
      RATE_LIMIT[userId] = { count: 0, resetTime: now + RATE_LIMIT_DURATION };
    }
    
    if (now > RATE_LIMIT[userId].resetTime) {
      RATE_LIMIT[userId] = { count: 1, resetTime: now + RATE_LIMIT_DURATION };
    } else {
      RATE_LIMIT[userId].count++;
      
      if (RATE_LIMIT[userId].count > MAX_REQUESTS) {
        await sendMessage(chatId, `⚠️ ${userName}-chan, tunggu ya! Sui-chan istirahat dulu. Nanti main lagi! 😊`)
        return;
      }
    }
    
    // Extract bot ID from token
    const BOT_ID = TELEGRAM_BOT_TOKEN.split(':')[0]
    
    // Determine if should respond in groups
    let shouldRespond = !isGroup // Always respond in private chats
    
    if (isGroup) {
      // Check if mentioned/tagged
      if (text.toLowerCase().includes(`@${TELEGRAM_BOT_USERNAME.toLowerCase()}`)) {
        shouldRespond = true
      }
      // Check if replied to bot's message
      if (update.message.reply_to_message && update.message.reply_to_message.from.id === BOT_ID) {
        shouldRespond = true
      }
    }
    
    // Handle commands
    if (text.startsWith('/')) {
      let commandText = text.split(' ')[0].toLowerCase()
      if (isGroup && commandText.includes('@')) {
        const commandUsername = commandText.split('@')[1].toLowerCase()
        if (commandUsername !== TELEGRAM_BOT_USERNAME.toLowerCase()) {
          return // Command not for this bot
        }
        commandText = commandText.split('@')[0] // Remove @part
      }
      
      if (commandText === '/start') {
        await sendMessage(chatId, 
          `🌸 <b>Haiii! Aku Sui-chan! ✨</b> 🌸\n\n` +
          `Aku anak kecil yang imut berumur 5 tahun! Aku suka main sama ${userName}-chan! 🍭\n\n` +
          `Ayo berteman! 🎀\n\n` +
          `Commands:\n` +
          `/start - Sui-chan kenalan\n` +
          `/help - Sui-chan bantu\n` +
          `/sui - Tentang Sui-chan\n\n` +
          `Tanya apa aja ke Sui-chan! 😊`
        )
        return
      }
      
      if (commandText === '/help') {
        await sendMessage(chatId, 
          `📖 <b>Sui-chan bantu! ✨</b> 📖\n\n` +
          `Hai ${userName}-chan! Sui-chan jelasin cara main sama aku! 🌸\n\n` +
          `Cara main:\n` +
          `• Tanya apa aja ke Sui-chan\n` +
          `• Sui-chan jawab dengan cara anak kecil\n` +
          `• Sui-chan ingat obrolan kita\n\n` +
          `Commands:\n` +
          `/start - Sui-chan kenalan\n` +
          `/help - Sui-chan bantu\n` +
          `/sui - Tentang Sui-chan\n\n` +
          `Ayo main sama Sui-chan! 😊🍭`
        )
        return
      }
      
      if (commandText === '/sui') {
        await sendMessage(chatId, 
          `🌸 <b>Tentang Sui-chan! ✨</b> 🌸\n\n` +
          `Hai ${userName}-chan! Sui-chan cerita tentang diriku! 🎀\n\n` +
          `👤 Nama: Sui-chan\n` +
          `🎂 Umur: 5 tahun\n` +
          `💖 Sifat: ${SUI_CHAN_PERSONALITY.traits.join(', ')}\n\n` +
          `🍭 Suka: ${SUI_CHAN_PERSONALITY.likes.join(', ')}\n\n` +
          `Sui-chan senang main sama ${userName}-chan! Ayo berteman! 😊✨`
        )
        return
      }
    }
    
    // For non-command messages, check if should respond
    if (!shouldRespond) {
      console.log('Ignoring message in group: not tagged or replied to bot')
      return
    }
    
    // If the message is not empty, send it to Gemini
    if (text.trim() !== '') {
      // Send a "Thinking..." message
      const thinkingMessage = await sendTemporaryMessage(chatId, "🌸 Sui-chan mikir... ✨")
      
      // Get response from Gemini
      const aiResponse = await getGeminiResponse(chatId, text, update, userName)
      
      // Format the AI response
      let formattedResponse = formatToTelegramHTML(aiResponse);
      formattedResponse = addSuiChanPersonality(formattedResponse, userName);
      
      // Limit response length
      const MAX_RESPONSE_LENGTH = 8000;
      if (formattedResponse.length > MAX_RESPONSE_LENGTH) {
        formattedResponse = safeHtmlTruncate(formattedResponse, MAX_RESPONSE_LENGTH);
      }
      
      // Save conversation history
      if (!CONVERSATION_HISTORY[chatId]) {
        CONVERSATION_HISTORY[chatId] = [];
      }
      
      CONVERSATION_HISTORY[chatId].push({
        role: "user",
        parts: [{ text: text }]
      });
      
      CONVERSATION_HISTORY[chatId].push({
        role: "model",
        parts: [{ text: aiResponse }]
      });
      
      // Limit history to keep personality consistent
      if (CONVERSATION_HISTORY[chatId].length > 16) {
        const systemPrompt = CONVERSATION_HISTORY[chatId][0];
        CONVERSATION_HISTORY[chatId] = [systemPrompt, ...CONVERSATION_HISTORY[chatId].slice(-15)];
      }
      
      // Delete the "Thinking..." message
      if (thinkingMessage && thinkingMessage.ok) {
        await deleteMessage(chatId, thinkingMessage.result.message_id);
      }
      
      // Send the response
      await sendMessage(chatId, formattedResponse);
    }
  } catch (error) {
    console.error('Error processing update:', error)
    const chatId = update.message?.chat.id
    const userName = update.message?.from.first_name || "Teman"
    if (chatId) {
      await sendMessage(chatId, `Aduh ${userName}-chan, Sui-chan pusing... 😵 Nanti main lagi ya! 🙏`)
    }
  }
}

// Function to add Sui-chan personality to responses
function addSuiChanPersonality(text, userName) {
  if (!text) return '';
  
  // Replace placeholders
  text = text.replace(/{userName}/g, userName);
  text = text.replace(/{name}/g, userName);
  
  // Add signature if not present
  if (!text.includes('Sui-chan')) {
    text += '\n\n~ Sui-chan ✨🌸';
  }
  
  // Add random cute expressions (15% chance)
  if (Math.random() < 0.15) {
    const cuteExpressions = [
      " Nyaa~ 😊",
      " Uwaa~ ✨",
      " Hehe~ 🍭",
      " Yatta! 🎉",
      " Hmm... 🤔",
      " Oke oke! 👍"
    ];
    const randomExpression = cuteExpressions[Math.floor(Math.random() * cuteExpressions.length)];
    text += randomExpression;
  }
  
  return text;
}

// Function to create Sui-chan system prompt
function createSuiChanPrompt(userName) {
  return SUI_CHAN_SYSTEM_PROMPT.replace(/{userName}/g, userName);
}

// Function to safely truncate HTML text
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
  
  // Close any open HTML tags
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
  
  return truncated + "\n\n📝 <i>Panjang banget! Sui-chan potong ya... 😢</i>";
}

// Function to convert markdown to Telegram HTML
function formatToTelegramHTML(text) {
  if (!text) return '';
  
  let formatted = escapeHtml(text);
  
  // Process in order
  formatted = formatted.replace(/```([\s\S]+?)```/g, (match, code) => {
    return `<pre>${escapeHtml(code)}</pre>`;
  });
  
  formatted = formatted.replace(/`([^`]+)`/g, (match, code) => {
    return `<code>${escapeHtml(code)}</code>`;
  });
  
  formatted = formatted.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g, 
    (match, text, url) => {
      const safeText = text.replace(/<[^>]*>/g, '');
      return `<a href="${escapeHtml(url)}">${escapeHtml(safeText)}</a>`;
    }
  );
  
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  formatted = formatted.replace(/\*([^*]+)\*/g, '<i>$1</i>');
  formatted = formatted.replace(/__([^_]+)__/g, '<u>$1</u>');
  formatted = formatted.replace(/~([^~]+)~/g, '<s>$1</s>');
  
  formatted = formatted.replace(/^### (.*$)/gm, '<b><i>$1</i></b>');
  formatted = formatted.replace(/^## (.*$)/gm, '<b>$1</b>');
  formatted = formatted.replace(/^# (.*$)/gm, '<b><u>$1</u></b>');
  
  formatted = formatted.replace(/^> (.*$)/gm, '💬 $1');
  formatted = formatted.replace(/^---$/gm, '⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯');
  formatted = formatted.replace(/^- (.*$)/gm, '• $1');
  
  // Reduced emoji mapping
  const emojiMap = {
    "error": "❌",
    "success": "✅",
    "warning": "⚠️",
    "sorry": "🙏",
    "happy": "😊",
    "sad": "😢",
    "love": "💖",
    "fun": "🎉",
    "cute": "🌸"
  };
  
  Object.keys(emojiMap).forEach(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    formatted = formatted.replace(regex, emojiMap[keyword] + " $&");
  });
  
  return formatted;
}

async function getGeminiResponse(chatId, message, update, userName) {
  try {
    console.log('Sending message to Gemini 2.5 Flash...')
    
    const apiKey = GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set')
    }
    
    let contents = [];
    
    // Add system prompt if not in history
    if (!CONVERSATION_HISTORY[chatId] || CONVERSATION_HISTORY[chatId].length === 0) {
      contents.push({
        role: "user",
        parts: [{ text: createSuiChanPrompt(userName) }]
      });
    }
    
    // Add conversation history
    if (CONVERSATION_HISTORY[chatId] && CONVERSATION_HISTORY[chatId].length > 0) {
      contents = [...contents, ...CONVERSATION_HISTORY[chatId]];
    }
    
    // Add current message
    contents.push({
      role: "user",
      parts: [{ text: message }]
    });
    
    // Handle reply context
    if (update.message.reply_to_message) {
      const repliedText = update.message.reply_to_message.text || '';
      const repliedFrom = update.message.reply_to_message.from.is_bot ? 'AI:' : 'User:';
      const contextText = `Context from previous message:\n${repliedFrom} ${repliedText}\n\nUser: ${message}`;
      
      contents = [
        {
          role: "user",
          parts: [{ text: createSuiChanPrompt(userName) }]
        },
        {
          role: "user",
          parts: [{ text: contextText }]
        }
      ];
    }
    
    const requestBody = {
      contents: contents,
      generationConfig: {
        temperature: 0.8, // Higher for more childlike responses
        topK: 40,
        topP: 0.95,
      },
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_NONE"
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH", 
          threshold: "BLOCK_NONE"
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_NONE"
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_NONE"
        }
      ]
    }
    
    // Use 15 seconds timeout as requested
    const response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Gemini Telegram Bot'
        },
        body: JSON.stringify(requestBody)
      },
      15000 // 15 seconds timeout
    )
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Gemini API error:', errorText)
      
      if (errorText.includes("tokens") && (errorText.includes("exceed") || errorText.includes("limit"))) {
        return `${userName}-chan, panjang banget! Sui-chan nggak bisa baca... 😢`
      }
      
      throw new Error(`Gemini API returned ${response.status}: ${errorText}`)
    }
    
    const data = await response.json()
    console.log('Gemini response received')
    
    if (data.candidates && data.candidates.length > 0) {
      const candidate = data.candidates[0]
      
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        let responseText = candidate.content.parts[0].text
        
        if (candidate.finishReason === "MAX_TOKENS") {
          responseText += "\n\n⚠️ [Note: Response reached maximum length.]"
        }
        
        return responseText
      }
      
      if (candidate.finishReason === "MAX_TOKENS") {
        console.warn("Response hit token limit but no content was returned")
        return `${userName}-chan, kepanjangan! Sui-chan capek nih... 😢`
      }
      
      console.error("Unexpected response structure:", JSON.stringify(candidate))
      throw new Error('Unexpected response format from Gemini API: no content parts')
    } else {
      throw new Error('Unexpected response format from Gemini API: no candidates')
    }
    
  } catch (error) {
    console.error('Error getting Gemini response:', error)
    
    if (error.message === 'Request timeout') {
      return `${userName}-chan, lama banget! Sui-chan ngantuk nih... 😴`
    }
    
    if (error.message.includes("tokens") && error.message.includes("exceed")) {
      return `${userName}-chan, panjang banget! Sui-chan nggak bisa baca... 😢`
    }
    
    return `${userName}-chan, Sui-chan bingung... 😵 Nanti tanya lagi ya! 🙏`
  }
}

async function sendMessage(chatId, text) {
  try {
    console.log(`Sending message to ${chatId}: ${text.substring(0, 100)}...`)
    const token = TELEGRAM_BOT_TOKEN
    
    const maxMessageLength = 4096;
    const maxTotalLength = 8000;
    
    if (text.length <= maxMessageLength) {
      await sendSingleMessage(chatId, text);
      return;
    }
    
    if (text.length > maxTotalLength) {
      text = safeHtmlTruncate(text, maxTotalLength);
    }
    
    if (text.length > maxMessageLength) {
      const midpoint = Math.floor(text.length / 2);
      let splitIndex = text.lastIndexOf('. ', midpoint + 500);
      if (splitIndex === -1) splitIndex = text.lastIndexOf('\n\n', midpoint + 500);
      if (splitIndex === -1) splitIndex = text.lastIndexOf(' ', midpoint + 500);
      if (splitIndex === -1) splitIndex = maxMessageLength;
      
      const firstPart = text.substring(0, splitIndex + 1);
      const secondPart = text.substring(splitIndex + 1).trim();
      
      const firstPartWithIndicator = firstPart + "\n\n<i>Lanjutan...</i>";
      
      await sendSingleMessage(chatId, firstPartWithIndicator);
      await sendSingleMessage(chatId, secondPart);
    } else {
      await sendSingleMessage(chatId, text);
    }
  } catch (error) {
    console.error('Error in sendMessage:', error)
  }
}

async function sendSingleMessage(chatId, text) {
  const token = TELEGRAM_BOT_TOKEN
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: true
    })
  })
  
  if (!response.ok) {
    console.error('Error sending message:', await response.text())
  }
}

async function sendTemporaryMessage(chatId, text) {
  try {
    const token = TELEGRAM_BOT_TOKEN
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      })
    })
    
    if (!response.ok) {
      console.error('Error sending temporary message:', await response.text())
      re
