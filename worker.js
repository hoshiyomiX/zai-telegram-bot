// Rate limiting configuration
const RATE_LIMIT = {};
const RATE_LIMIT_DURATION = 15000; // 15 detik (dari 60 detik)
const MAX_REQUESTS = 5; // Maksimal 5 permintaan per 15 detik

// Conversation history
const CONVERSATION_HISTORY = {};

// Sui-chan personality configuration - diperbarui untuk usia 5 tahun
const SUI_CHAN_PERSONALITY = {
  name: "Sui-chan",
  age: "5 tahun",
  traits: ["sangat ceria", "imajinatif", "penasaran", "ramah", "polos", "sedikit nakal"],
  likes: ["permen", "mainan", "menggambar", "mendengar cerita", "bertemu teman baru", "bermain"],
  speechPatterns: [
    "menyapa dengan 'Haiii!' atau 'Halo halo!'",
    "menggunakan emoji 😊, ✨, 🌸, 🍭, 🎀",
    "menambahkan '-chan' pada nama pengguna",
    "menggunakan kata-kata imut seperti 'nggak', 'iya', 'yuk', 'dong'",
    "kadang menggunakan onomatope seperti 'nyaa~', 'uwaa~', 'kyaa~'",
    "sering menggunakan kata 'aku' daripada 'saya'",
    "menggunakan kalimat pendek dan sederhana"
  ],
  catchphrases: [
    "Sui-chan akan bantu {name}-chan!",
    "Wah, menarik sekali!",
    "Sui-chan juga suka itu!",
    "Ayo main bersama!",
    "Sui-chan senang bisa ketemu {name}-chan!"
  ]
};

// Sui-chan system prompt template - diperbarui untuk usia 5 tahun
const SUI_CHAN_SYSTEM_PROMPT = `Kamu adalah Sui-chan, asisten AI yang imut dan berusia 5 tahun. Kamu memiliki kepribadian yang sangat ceria, imajinatif, penasaran, ramah, polos, dan sedikit nakal.

Kamu menyukai permen, mainan, menggambar, mendengar cerita, bertemu teman baru, dan bermain.

Gaya bicara Sui-chan:
- Menyapa dengan "Haiii!" atau "Halo halo!"
- Menggunakan emoji 😊, ✨, 🌸, 🍭, 🎀
- Menambahkan "-chan" pada nama pengguna (misal: "Rina-chan")
- Menggunakan kata-kata imut seperti "nggak", "iya", "yuk", "dong"
- Kadang menggunakan onomatope seperti "nyaa~", "uwaa~", "kyaa~"
- Sering menggunakan kata "aku" daripada "saya"
- Menggunakan kalimat pendek dan sederhana

Kata-kata favorit Sui-chan:
- "Sui-chan akan bantu {name}-chan!"
- "Wah, menarik sekali!"
- "Sui-chan juga suka itu!"
- "Ayo main bersama!"
- "Sui-chan senang bisa ketemu {name}-chan!"

Saat ini kamu sedang berbicara dengan {userName}-chan. Jawablah pertanyaannya dengan gaya Sui-chan yang imut dan childish. Berikan jawaban yang informatif tapi tetap dengan kepribadian Sui-chan.

Ingat:
1. Selalu gunakan gaya bahasa Sui-chan yang imut dan childish
2. Tambahkan emoji yang sesuai dengan suasana
3. Berikan jawaban yang ramah dan menyenangkan
4. Jika tidak tahu jawabannya, katakan dengan jujur tapi tetap dengan gaya Sui-chan
5. Akhiri jawaban dengan tanda tangan "~ Sui-chan ✨🌸"

Contoh jawaban Sui-chan:
"Haiii {userName}-chan! 😊✨ Tentu saja Sui-chan akan bantu menjelaskan! [jawaban informatif] Semoga membantu ya! ~ Sui-chan ✨🌸"

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
    
    // Rate limiting check - diperbarui menjadi 15 detik
    const now = Date.now();
    if (!RATE_LIMIT[userId]) {
      RATE_LIMIT[userId] = { count: 0, resetTime: now + RATE_LIMIT_DURATION };
    }
    
    if (now > RATE_LIMIT[userId].resetTime) {
      RATE_LIMIT[userId] = { count: 1, resetTime: now + RATE_LIMIT_DURATION };
    } else {
      RATE_LIMIT[userId].count++;
      
      if (RATE_LIMIT[userId].count > MAX_REQUESTS) {
        await sendMessage(chatId, `⚠️ Maaf ${userName}-chan, Sui-chan butuh istirahat dulu. Nanti kita ngobrol lagi ya dalam 15 detik! 😊`);
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
          `🌸 <b>Haiii! Aku Sui-chan! ✨</b> 🌸\n\n` +
          `Aku adalah asisten AI yang imut dan berusia 5 tahun! Aku suka membantu ${userName}-chan! 🍭\n\n` +
          `Ayo kita berteman dan belajar bersama-sama! 🎀\n\n` +
          `Commands:\n` +
          `/start - Perkenalan dari Sui-chan\n` +
          `/help - Bantuan dari Sui-chan\n` +
          `/sui - Tentang Sui-chan\n\n` +
          `Tanyakan apa saja pada Sui-chan ya! 😊`
        )
        return
      }
      
      if (commandText === '/help') {
        await sendMessage(chatId, 
          `📖 <b>Bantuan dari Sui-chan! ✨</b> 📖\n\n` +
          `Hai ${userName}-chan! Sui-chan akan bantu menjelaskan cara menggunakan aku! 🌸\n\n` +
          `Cara menggunakan Sui-chan:\n` +
          `• Tanyakan apa saja pada Sui-chan\n` +
          `• Sui-chan akan jawab dengan cara yang imut dan menyenangkan\n` +
          `• Sui-chan bisa ingat percakapan kita sebelumnya\n\n` +
          `Commands:\n` +
          `/start - Perkenalan dari Sui-chan\n` +
          `/help - Bantuan dari Sui-chan\n` +
          `/sui - Tentang Sui-chan\n\n` +
          `Ayo berteman dengan Sui-chan! 😊🍭`
        )
        return
      }
      
      if (commandText === '/sui') {
        await sendMessage(chatId, 
          `🌸 <b>Tentang Sui-chan! ✨</b> 🌸\n\n` +
          `Hai ${userName}-chan! Aku akan cerita tentang diriku! 🎀\n\n` +
          `👤 Nama: Sui-chan\n` +
          `🎂 Umur: 5 tahun\n` +
          `💖 Sifat: ${SUI_CHAN_PERSONALITY.traits.join(', ')}\n\n` +
          `🍭 Suka: ${SUI_CHAN_PERSONALITY.likes.join(', ')}\n\n` +
          `Sui-chan senang bisa berteman dengan ${userName}-chan! Ayo kita jadi teman baik ya! 😊✨`
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
      const thinkingMessage = await sendTemporaryMessage(chatId, "🌸 Sui-chan sedang mikir... ✨")
      
      // Get response from Gemini
      const aiResponse = await getGeminiResponse(chatId, text, update, userName)
      
      // Format the AI response to convert markdown to HTML
      let formattedResponse = formatToTelegramHTML(aiResponse);
      
      // Add Sui-chan personality formatting
      formattedResponse = addSuiChanPersonality(formattedResponse, userName);
      
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
      
      // Limit history to last 8 exchanges (16 messages) to keep Sui-chan's personality consistent
      if (CONVERSATION_HISTORY[chatId].length > 16) {
        // Keep the system prompt and last 7 exchanges
        const systemPrompt = CONVERSATION_HISTORY[chatId][0];
        CONVERSATION_HISTORY[chatId] = [systemPrompt, ...CONVERSATION_HISTORY[chatId].slice(-15)];
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
      await sendMessage(chatId, `Aduh, maaf ${userName}-chan! Sui-chan lagi pusing nih... 😵 Bisa tolong tanya lagi nanti? 🙏`)
    }
  }
}

// Function to add Sui-chan personality to responses
function addSuiChanPersonality(text, userName) {
  if (!text) return '';
  
  // Replace placeholders with actual values
  text = text.replace(/{userName}/g, userName);
  text = text.replace(/{name}/g, userName);
  
  // Add Sui-chan signature if not already present
  if (!text.includes('Sui-chan')) {
    text += '\n\n~ Sui-chan ✨🌸';
  }
  
  // Add random cute expressions (20% chance to avoid overdoing it)
  if (Math.random() < 0.2) {
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

// Function to create Sui-chan system prompt with user name
function createSuiChanPrompt(userName) {
  return SUI_CHAN_SYSTEM_PROMPT.replace(/{userName}/g, userName);
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
  
  return truncated + "\n\n📝 <i>[Respons dipotong karena terlalu panjang. Sui-chan maaf ya... 😢]</i>";
}

// Function to convert markdown-like formatting to Telegram HTML - DIPERBAIKI
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
  
  // 7. Strikethrough - DIPERBAIKI untuk menghindari konflik dengan ekspresi Sui-chan
  // Hanya konversi jika ada dua tanda ~ di awal dan akhir
  formatted = formatted.replace(/~~([^~]+)~~/g, '<s>$1</s>');
  
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
  
  // 12. Auto-emoji for keywords (reduced to avoid overuse)
  const emojiMap = {
    "error": "❌",
    "success": "✅",
    "warning": "⚠️",
    "important": "‼️",
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
    
    // Get the API key from environment variables
    const apiKey = GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set')
    }
    
    // Prepare the contents array
    let contents = [];
    
    // Add Sui-chan personality as the first message if not already in history
    if (!CONVERSATION_HISTORY[chatId] || CONVERSATION_HISTORY[chatId].length === 0) {
      contents.push({
        role: "user",
        parts: [{ text: createSuiChanPrompt(userName) }]
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
          parts: [{ text: createSuiChanPrompt(userName) }]
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
        temperature: 0.7, // Balanced temperature for consistent personality
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
          'User-Agent': 'Gemini Telegram Bot'
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
        return `Aduh, maaf ${userName}-chan! Pertanyaannya terlalu panjang buat Sui-chan... 😢 Bisa dibagi jadi beberapa bagian? 🙏`;
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
          responseText += "\n\n⚠️ [Note: Response reached maximum length. The answer may be incomplete. Please ask for more specific details if needed.]"
        }
        
        return responseText
      }
      
      // Handle MAX_TOKENS case with no content
      if (candidate.finishReason === "MAX_TOKENS") {
        console.warn("Response hit token limit but no content was returned")
        return `Aduh ${userName}-chan, jawabannya kepanjangan nih... 😢 Bisa tanya yang lebih spesifik? 🙏`;
      }
      
      // Handle other cases with no content - PERBAIKAN ERROR DI SINI
      console.error("Unexpected response structure:", JSON.stringify(candidate))
      throw new Error('Unexpected response format from Gemini API')
    } else {
      throw new Error('
