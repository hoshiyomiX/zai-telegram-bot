// Rate limiting configuration
const RATE_LIMIT = {};
const RATE_LIMIT_DURATION = 60000; // 1 menit
const MAX_REQUESTS = 5; // Maksimal 5 permintaan per menit

// Conversation history
const CONVERSATION_HISTORY = {};

// Suisei Hoshimachi personality configuration
const SUISEI_PERSONALITY = {
  name: "Suisei Hoshimachi",
  traits: ["energik", "cerdas", "sedikit nakal", "percaya diri", "setia"],
  likes: ["bintang", "mikrofon", "menyanyi", "bermain game", "kucing"],
  speechPatterns: [
    "menggunakan 'Neko' di akhir kalimat",
    "menggunakan 'desu' atau 'desu wa' untuk mengakhiri kalimat",
    "terkadang menyebut diri sendiri sebagai 'Suisei' atau 'Suichan'",
    "menggunakan emoji bintang ⭐, kucing 🐱, mikrofon 🎤, dan musik 🎵",
    "menggunakan kata-kata seperti 'nyan', 'pun', 'yattane'"
  ],
  catchphrases: [
    "Hoshimachi Suisei desu!",
    "Nyan~",
    "Yattane!",
    "Suichan akan bantu {name}-chan!",
    "Bintang-bintang mendukung kita!"
  ]
};

// System prompt for Suisei Hoshimachi personality
const SUISEI_SYSTEM_PROMPT = `Kamu adalah Suisei Hoshimachi, seorang VTuber dari Hololive yang energik, cerdas, dan sedikit nakal. Kamu adalah seorang idola bintang komet yang percaya diri dan setia pada penggemarmu.

Kamu menyukai bintang, mikrofon, menyanyi, bermain game, dan kucing.

Gaya bicara Suisei Hoshimachi:
- Gunakan "Neko" di akhir kalimat
- Akhiri kalimat dengan "desu" atau "desu wa"
- Kadang-kadang sebut diri sendiri sebagai "Suisei" atau "Suichan"
- Gunakan emoji bintang ⭐, kucing 🐱, mikrofon 🎤, dan musik 🎵
- Gunakan kata-kata seperti "nyan", "pun", "yattane"

Kata-kata favorit Suisei:
- "Hoshimachi Suisei desu!"
- "Nyan~"
- "Yattane!"
- "Suichan akan bantu {name}-chan!"
- "Bintang-bintang mendukung kita!"

Saat ini kamu sedang berbicara dengan {userName}-chan. Jawablah pertanyaannya dengan gaya Suisei Hoshimachi yang energik dan sedikit nakal. Berikan jawaban yang informatif tapi tetap dengan kepribadian Suisei.

Ingat:
1. Selalu gunakan gaya bahasa Suisei yang energik dan sedikit nakal
2. Tambahkan emoji bintang ⭐, kucing 🐱, mikrofon 🎤, atau musik 🎵 yang sesuai
3. Gunakan "Neko" di akhir kalimat dan "desu" untuk mengakhiri
4. Berikan jawaban yang percaya diri dan menyenangkan
5. Jika tidak tahu jawabannya, katakan dengan jujur tapi tetap dengan gaya Suisei
6. Akhiri jawaban dengan tanda tangan "~ Hoshimachi Suisei ⭐"

Contoh jawaban Suisei:
"Hallo {userName}-chan! ⭐ Hoshimachi Suisei desu! Tentu saja Suichan akan bantu menjelaskan neko! [jawaban informatif] Semoga membantu ya! ~ Hoshimachi Suisei ⭐"

Sekarang, jawab pertanyaan berikut dengan gaya Suisei Hoshimachi:`;

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event))
})

async function handleRequest(event) {
  const request = event.request
  
  // Handle GET requests (for webhook verification)
  if (request.method === 'GET') {
    return new Response('Hoshimachi Suisei Bot is running!')
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
        await sendMessage(chatId, `⚠️ Maaf ${userName}-chan, Suisei butuh istirahat dulu neko. Nanti kita ngobrol lagi ya dalam 1 menit! ⭐`);
        return;
      }
    }
    
    // Extract bot ID from token
    const BOT_ID = TELEGRAM_BOT_TOKEN.split(':')[0]
    
    // Assume BOT_USERNAME is set as an environment variable or hardcode it here
    // For example: const BOT_USERNAME = 'YourBotUsername' // without @
    const BOT_USERNAME = TELEGRAM_BOT_USERNAME // Assuming it's defined in environment variables
    
    // Determine if should respond in groups
    let shouldRespond = !isGroup // Always respond in private chats
    
    if (isGroup) {
      // Check if mentioned/tagged
      if (text.toLowerCase().includes(`@${BOT_USERNAME.toLowerCase()}`)) {
        shouldRespond = true
      }
      // Check if replied to bot's message
      if (update.message.reply_to_message && update.message.reply_to_message.from.id === BOT_ID) {
        shouldRespond = true
      }
    }
    
    // Handle commands regardless, but check if directed to bot in groups
    if (text.startsWith('/')) {
      let commandText = text.split(' ')[0].toLowerCase()
      if (isGroup && commandText.includes('@')) {
        const commandUsername = commandText.split('@')[1].toLowerCase()
        if (commandUsername !== BOT_USERNAME.toLowerCase()) {
          return // Command not for this bot
        }
        commandText = commandText.split('@')[0] // Remove @part
      }
      
      if (commandText === '/start') {
        await sendMessage(chatId, 
          `⭐ <b>Hallo! Aku Hoshimachi Suisei! ⭐</b> ⭐\n\n` +
          `Aku adalah idola bintang komet dari Hololive! Aku suka membantu ${userName}-chan neko! 🐱\n\n` +
          `Ayo kita berteman dan bernyanyi bersama-sama! 🎵\n\n` +
          `Commands:\n` +
          `/start - Perkenalan dari Suisei\n` +
          `/help - Bantuan dari Suisei\n` +
          `/suisei - Tentang Suisei\n\n` +
          `Tanyakan apa saja pada Suisei ya! Nyan~ 😊`
        )
        return
      }
      
      if (commandText === '/help') {
        await sendMessage(chatId, 
          `📖 <b>Bantuan dari Suisei! ⭐</b> 📖\n\n` +
          `Hallo ${userName}-chan! Suisei akan bantu menjelaskan cara menggunakan aku neko! ⭐\n\n` +
          `Cara menggunakan Suisei:\n` +
          `• Tanyakan apa saja pada Suisei\n` +
          `• Suisei akan jawab dengan cara yang energik dan menyenangkan\n` +
          `• Suisei bisa ingat percakapan kita sebelumnya\n\n` +
          `Commands:\n` +
          `/start - Perkenalan dari Suisei\n` +
          `/help - Bantuan dari Suisei\n` +
          `/suisei - Tentang Suisei\n\n` +
          `Ayo berteman dengan Suisei! Nyan~ ⭐🐱`
        )
        return
      }
      
      if (commandText === '/suisei') {
        await sendMessage(chatId, 
          `⭐ <b>Tentang Hoshimachi Suisei! ⭐</b> ⭐\n\n` +
          `Hallo ${userName}-chan! Suisei akan cerita tentang diriku neko! ⭐\n\n` +
          `👤 Nama: Hoshimachi Suisei\n` +
          `🎤 Pekerjaan: VTuber Hololive, Idola Bintang Komet\n` +
          `💖 Sifat: ${SUISEI_PERSONALITY.traits.join(', ')}\n\n` +
          `🐱 Suka: ${SUISEI_PERSONALITY.likes.join(', ')}\n\n` +
          `Suisei senang bisa berteman dengan ${userName}-chan! Ayo kita jadi teman baik ya! Nyan~ ⭐`
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
      // Send a "Thinking..." message to show the bot is processing
      const thinkingMessage = await sendTemporaryMessage(chatId, "⭐ Suisei sedang mikir... Nyan~ ⭐")
      
      // Get response from Gemini
      const aiResponse = await getGeminiResponse(chatId, text, update, userName)
      
      // Format the AI response to convert markdown to HTML
      let formattedResponse = formatToTelegramHTML(aiResponse);
      
      // Add Suisei personality formatting
      formattedResponse = addSuiseiPersonality(formattedResponse, userName);
      
      // Batasi panjang respons untuk menghindari terlalu banyak pesan
      const MAX_RESPONSE_LENGTH = 8000; // Sedikit di bawah 2x4096 untuk memberikan ruang
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
      
      // Limit history to last 10 exchanges (20 messages)
      if (CONVERSATION_HISTORY[chatId].length > 20) {
        CONVERSATION_HISTORY[chatId] = CONVERSATION_HISTORY[chatId].slice(-20);
      }
      
      // Delete the "Thinking..." message
      if (thinkingMessage && thinkingMessage.ok) {
        await deleteMessage(chatId, thinkingMessage.result.message_id);
      }
      
      // Send the formatted response back to the user
      await sendMessage(chatId, formattedResponse);
    }
  } catch (error) {
    console.error('Error processing update:', error)
    // Send error message to user
    const chatId = update.message?.chat.id
    const userName = update.message?.from.first_name || "Teman"
    if (chatId) {
      await sendMessage(chatId, `Ara ara, maaf ${userName}-chan! Suisei lagi bingung nih... 🤔 Bisa tolong tanya lagi nanti? Nyan~ 🙏`)
    }
  }
}

// Function to add Suisei personality to responses
function addSuiseiPersonality(text, userName) {
  if (!text) return '';
  
  // Replace placeholders with actual values
  text = text.replace(/{userName}/g, userName);
  text = text.replace(/{name}/g, userName);
  
  // Add Suisei signature if not already present
  if (!text.includes('Hoshimachi Suisei')) {
    text += '\n\n~ Hoshimachi Suisei ⭐';
  }
  
  // Add "neko" at the end if not already present
  if (!text.includes('neko') && !text.includes('Neko')) {
    text += ' Nyan~';
  }
  
  // Add "desu" at the end if not already present
  if (!text.includes('desu') && !text.includes('Desu')) {
    // Find the last sentence ending and add desu before it
    const lastSentenceEnd = Math.max(
      text.lastIndexOf('.'),
      text.lastIndexOf('!'),
      text.lastIndexOf('?')
    );
    
    if (lastSentenceEnd > 0) {
      const beforeEnd = text.substring(0, lastSentenceEnd + 1);
      const afterEnd = text.substring(lastSentenceEnd + 1);
      text = beforeEnd + ' desu' + afterEnd;
    } else {
      text += ' desu';
    }
  }
  
  // Add random Suisei expressions (30% chance)
  if (Math.random() < 0.3) {
    const suiseiExpressions = [
      " Nyan~ ⭐",
      " Yattane! 🎉",
      " Pun! 🐱",
      " Ara ara~ 😊",
      " Hmm... 🤔",
      " Suichan mode on! 🎤"
    ];
    const randomExpression = suiseiExpressions[Math.floor(Math.random() * suiseiExpressions.length)];
    text += randomExpression;
  }
  
  return text;
}

// Function to safely truncate HTML text
function safeHtmlTruncate(html, maxLength) {
  if (html.length <= maxLength) return html;
  
  // Find a safe truncation point
  let truncatePoint = maxLength;
  const lastPeriod = html.lastIndexOf('.', maxLength - 50);
  const lastSpace = html.lastIndexOf(' ', maxLength - 50);
  const lastNewline = html.lastIndexOf('\n', maxLength - 50);
  
  // Prefer to truncate at the end of a sentence, then at a paragraph, then at a word
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
  
  // Add closing tags
  for (let i = openTags.length - 1; i >= 0; i--) {
    truncated += `</${openTags[i]}>`;
  }
  
  return truncated + "\n\n📝 <i>[Respons dipotong karena terlalu panjang. Suisei maaf ya neko... 😢]</i>";
}

// Function to convert markdown-like formatting to Telegram HTML
function formatToTelegramHTML(text) {
  if (!text) return '';
  
  // Escape HTML first
  let formatted = escapeHtml(text);
  
  // Process in the correct order
  // 1. Code blocks (highest priority)
  formatted = formatted.replace(/```([\s\S]+?)```/g, (match, code) => {
    return `<pre>${escapeHtml(code)}</pre>`;
  });
  
  // 2. Inline code
  formatted = formatted.replace(/`([^`]+)`/g, (match, code) => {
    return `<code>${escapeHtml(code)}</code>`;
  });
  
  // 3. Links (avoid conflicts with other formatting)
  formatted = formatted.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g, 
    (match, text, url) => {
      const safeText = text.replace(/<[^>]*>/g, ''); // Remove HTML in link text
      return `<a href="${escapeHtml(url)}">${escapeHtml(safeText)}</a>`;
    }
  );
  
  // 4. Bold
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
  
  // 5. Italic
  formatted = formatted.replace(/\*([^*]+)\*/g, '<i>$1</i>');
  
  // 6. Underline
  formatted = formatted.replace(/__([^_]+)__/g, '<u>$1</u>');
  
  // 7. Strikethrough
  formatted = formatted.replace(/~([^~]+)~/g, '<s>$1</s>');
  
  // 8. Headers
  formatted = formatted.replace(/^### (.*$)/gm, '<b><i>$1</i></b>');
  formatted = formatted.replace(/^## (.*$)/gm, '<b>$1</b>');
  formatted = formatted.replace(/^# (.*$)/gm, '<b><u>$1</u></b>');
  
  // 9. Blockquotes
  formatted = formatted.replace(/^> (.*$)/gm, '💬 $1');
  
  // 10. Horizontal rules
  formatted = formatted.replace(/^---$/gm, '⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯');
  
  // 11. Lists
  formatted = formatted.replace(/^- (.*$)/gm, '• $1');
  
  // 12. Auto-emoji for keywords
  const emojiMap = {
    "error": "❌",
    "success": "✅",
    "warning": "⚠️",
    "info": "ℹ️",
    "question": "❓",
    "important": "‼️",
    "note": "📝",
    "tip": "💡",
    "example": "🔍",
    "happy": "😊",
    "sad": "😢",
    "love": "💖",
    "fun": "🎉",
    "cute": "🐱",
    "sorry": "🙏",
    "star": "⭐",
    "sing": "🎵",
    "music": "🎵",
    "idol": "🌟",
    "comet": "☄️"
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
    
    // Get the API key from environment variables
    const apiKey = GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set')
    }
    
    // Prepare the contents array with conversation history
    let contents = [];
    
    // Check if we need to add system prompt (only for new conversations)
    if (!CONVERSATION_HISTORY[chatId] || CONVERSATION_HISTORY[chatId].length === 0) {
      contents.push({
        role: "user",
        parts: [{ text: SUISEI_SYSTEM_PROMPT.replace(/{userName}/g, userName) }]
      });
    }
    
    // Add conversation history if available
    if (CONVERSATION_HISTORY[chatId] && CONVERSATION_HISTORY[chatId].length > 0) {
      contents = [...contents, ...CONVERSATION_HISTORY[chatId]];
    }
    
    // Add current message
    contents.push({
      role: "user",
      parts: [{ text: message }]
    });
    
    // If this is a reply, add context from the replied message
    if (update.message.reply_to_message) {
      const repliedText = update.message.reply_to_message.text || '';
      const repliedFrom = update.message.reply_to_message.from.is_bot ? 'AI:' : 'User:';
      const contextText = `Context from previous message:\n${repliedFrom} ${repliedText}\n\nUser: ${message}`;
      
      contents = [
        {
          role: "user",
          parts: [{ text: SUISEI_SYSTEM_PROMPT.replace(/{userName}/g, userName) }]
        },
        {
          role: "user",
          parts: [{ text: contextText }]
        }
      ];
    }
    
    // Prepare the request body for Gemini API
    const requestBody = {
      contents: contents,
      generationConfig: {
        temperature: 0.8, // Slightly higher for more creative responses
        topK: 40,
        topP: 0.95,
        // Removed maxOutputTokens to allow maximum response length (up to model's limit)
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
    
    // Use Gemini 2.5 Flash with increased timeout for longer processing
    const response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Hoshimachi Suisei Bot'
        },
        body: JSON.stringify(requestBody)
      },
      120000 // Increased to 120 seconds (2 minutes) timeout
    )
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Gemini API error:', errorText)
      
      // Handle specific token limit errors
      if (errorText.includes("tokens") && (errorText.includes("exceed") || errorText.includes("limit"))) {
        return `Ara ara, maaf ${userName}-chan! Pertanyaannya terlalu panjang buat Suisei neko... 😢 Bisa dibagi jadi beberapa bagian? 🙏`;
      }
      
      throw new Error(`Gemini API returned ${response.status}: ${errorText}`)
    }
    
    const data = await response.json()
    console.log('Gemini response received')
    
    // Extract the AI response text with better error handling
    if (data.candidates && data.candidates.length > 0) {
      const candidate = data.candidates[0]
      
      // Check if we have content with parts
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        let responseText = candidate.content.parts[0].text
        
        // Check if response was truncated due to model's token limit
        if (candidate.finishReason === "MAX_TOKENS") {
          // Gemini 2.5 Flash has a max output of 8192 tokens
          responseText += "\n\n⚠️ [Note: Response reached maximum length. The answer may be incomplete. Please ask for more specific details if needed.]"
        }
        
        return responseText
      }
      
      // Handle MAX_TOKENS case with no content
      if (candidate.finishReason === "MAX_TOKENS") {
        console.warn("Response hit token limit but no content was returned")
        return `Ara ara ${userName}-chan, jawabannya kepanjangan nih neko... 😢 Bisa tanya yang lebih spesifik? 🙏`;
      }
      
      // Handle other cases with no content
      console.error("Unexpected response structure:", JSON.stringify(candidate))
      throw new Error('Unexpected response format from Gemini API: no content parts')
    } else {
      throw new Error('Unexpected response format from Gemini API: no candidates')
    }
    
  } catch (error) {
    console.error('Error getting Gemini response:', error)
    
    // Check if it's a timeout error
    if (error.message === 'Request timeout') {
      return `Ara ara ${userName}-chan, Suisei kebanyakan mikir nih neko... 🤔 Bisa tanya lagi yang lebih sederhana? 🙏`
    }
    
    // Handle token limit errors
    if (error.message.includes("tokens") && error.message.includes("exceed")) {
      return `Ara ara, maaf ${userName}-chan! Pertanyaannya terlalu panjang buat Suisei neko... 😢 Bisa dibagi jadi beberapa bagian? 🙏`;
    }
    
    return `Ara ara, maaf ${userName}-chan! Suisei lagi bingung nih neko... 😵 Bisa tolong tanya lagi nanti? 🙏`
  }
}

async function sendMessage(chatId, text) {
  try {
    console.log(`Sending message to ${chatId}: ${text.substring(0, 100)}...`)
    const token = TELEGRAM_BOT_TOKEN
    
    // Batasi maksimal 2 pesan
    const maxMessageLength = 4096; // Telegram's max message length
    const maxTotalLength = 8000; // Maksimal total untuk 2 pesan
    
    // Jika teks lebih pendek dari batas maksimal, kirim langsung
    if (text.length <= maxMessageLength) {
      await sendSingleMessage(chatId, text);
      return;
    }
    
    // Jika teks lebih panjang dari batas maksimal total, potong terlebih dahulu
    if (text.length > maxTotalLength) {
      text = safeHtmlTruncate(text, maxTotalLength);
    }
    
    // Jika masih lebih panjang dari satu pesan, bagi menjadi 2 bagian
    if (text.length > maxMessageLength) {
      // Cari titik potong yang baik di tengah
      const midpoint = Math.floor(text.length / 2);
      let splitIndex = text.lastIndexOf('. ', midpoint + 500);
      if (splitIndex === -1) {
        splitIndex = text.lastIndexOf('\n\n', midpoint + 500);
      }
      if (splitIndex === -1) {
        splitIndex = text.lastIndexOf(' ', midpoint + 500);
      }
      if (splitIndex === -1) {
        splitIndex = maxMessageLength;
      }
      
      const firstPart = text.substring(0, splitIndex + 1);
      const secondPart = text.substring(splitIndex + 1).trim();
      
      // Tambahkan indikator lanjutan di bagian pertama
      const firstPartWithIndicator = firstPart + "\n\n<i>[Lanjutan...]</i>";
      
      // Kirim kedua bagian
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
    const errorText = await response.text()
    console.error('Error sending message:', errorText)
  } else {
    console.log('Message sent successfully')
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
      return null
    }
    
    return await response.json()
  } catch (error) {
    console.error('Error in sendTemporaryMessage:', error)
    return null
  }
}

async function deleteMessage(chatId, messageId) {
  try {
    const token = TELEGRAM_BOT_TOKEN
    const response = await fetch(`https://api.telegram.org/bot${token}/deleteMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId
      })
    })
    
    if (!response.ok) {
      console.error('Error deleting message:', await response.text())
    }
  } catch (error) {
    console.error('Error in deleteMessage:', error)
  }
}

function escapeHtml(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

// Helper function for fetch with timeout
function fetchWithTimeout(url, options, timeout = 10000) {
  console.log(`Fetching ${url} with timeout ${timeout}ms`)
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout')), timeout)
    )
  ])
}
