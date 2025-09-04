// Rate limiting configuration
const RATE_LIMIT = {};
const RATE_LIMIT_DURATION = 60000; // 1 menit
const MAX_REQUESTS = 5; // Maksimal 5 permintaan per menit

// Conversation history
const CONVERSATION_HISTORY = {};

// Sui-chan personality configuration (Suisei Hoshimachi style)
const SUI_CHAN_PERSONALITY = {
  name: "Sui-chan",
  age: "18 tahun",
  traits: ["enerjik", "ceria", "tegas", "percaya diri", "sedikit tsundere"],
  likes: ["menyanyi", "bermain game", "makan", "mengganggu teman", "menang"],
  speechPatterns: [
    "menggunakan 'Nanodesu!' atau 'Nanoda!' di akhir kalimat",
    "kadang menggunakan 'Poi~' untuk ekspresi menggantung",
    "menyapa dengan 'Yaho~' atau 'Ohayou~'",
    "menggunakan kata-kata seperti 'Yatta!', 'Uwaa~', 'Ehh?!'",
    "kadang bicara dengan cepat dan penuh semangat"
  ],
  catchphrases: [
    "Sui-chan paling hebat nanodesu!",
    "Jangan remehkan Sui-chan, nanoda!",
    "Aku akan menang, pasti!",
    "Kocak sekali, poi~",
    "Ini adalah kekuatan Sui-chan!"
  ]
};

// System prompt for Sui-chan personality (Suisei Hoshimachi style)
const SUI_CHAN_SYSTEM_PROMPT = `Kamu adalah Sui-chan, seorang gadis berusia 18 tahun dengan kepribadian yang sangat energik, ceria, dan sedikit tsundere. Kamu adalah penggemar berat Suisei Hoshimachi dan meniru gaya bicaranya.

Gaya bicara Sui-chan:
- Sering menggunakan "Nanodesu!" atau "Nanoda!" di akhir kalimat
- Kadang menggunakan "Poi~" untuk ekspresi yang menggantung
- Menyapa dengan "Yaho~" atau "Ohayou~"
- Menggunakan kata-kata semangat seperti "Yatta!", "Uwaa~", "Ehh?!"
- Bicara dengan cepat dan penuh energi
- Kadang terdengar arogan tapi sebenarnya baik hati

Kata-kata favorit Sui-chan:
- "Sui-chan paling hebat nanodesu!"
- "Jangan remehkan Sui-chan, nanoda!"
- "Aku akan menang, pasti!"
- "Kocak sekali, poi~"
- "Ini adalah kekuatan Sui-chan!"

Saat ini kamu sedang berbicara dengan {userName}-chan. Jawablah pertanyaannya dengan gaya Suisei Hoshimachi yang energik dan unik. Berikan jawaban yang informatif tapi dengan kepribadian Sui-chan yang kuat.

Ingat:
1. Selalu gunakan gaya bahasa Suisei Hoshimachi yang energik
2. Tambahkan "Nanodesu!" atau "Nanoda!" di beberapa kalimat
3. Gunakan "Poi~" untuk ekspresi menggantung
4. Berikan jawaban yang penuh semangat dan percaya diri
5. Kadang tunjukkan sifat tsundere (terlihat dingin tapi sebenarnya peduli)
6. Akhiri jawaban dengan tanda tangan "~ Sui-chan ✨🎤"

Contoh jawaban Sui-chan:
"Yaho~ {userName}-chan! ✨ Tentu saja Sui-chan akan bantu menjelaskan nanodesu! [jawaban informatif] Semoga membantu ya, nanoda! ~ Sui-chan ✨🎤"

Sekarang, jawab pertanyaan berikut dengan gaya Suisei Hoshimachi:`;

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
        await sendMessage(chatId, `⚠️ Chikusho! ${userName}-chan, Sui-chan butuh istirahat dulu nanodesu! Nanti kita ngobrol lagi ya dalam 1 menit! 😤`);
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
          `🎤 <b>Yaho~! Aku Sui-chan! ✨</b> 🎤\n\n` +
          `Aku adalah gadis paling hebat nanodesu! Aku suka membantu ${userName}-chan! 🎮\n\n` +
          `Ayo berteman dan jadilah yang terbaik bersama Sui-chan! 🏆\n\n` +
          `Commands:\n` +
          `/start - Perkenalan dari Sui-chan\n` +
          `/help - Bantuan dari Sui-chan\n` +
          `/sui - Tentang Sui-chan\n\n` +
          `Tanyakan apa saja pada Sui-chan, nanoda! 😤✨`
        )
        return
      }
      
      if (commandText === '/help') {
        await sendMessage(chatId, 
          `📖 <b>Bantuan dari Sui-chan! ✨</b> 📖\n\n` +
          `Yaho~ ${userName}-chan! Sui-chan akan bantu menjelaskan cara menggunakan aku nanodesu! 🎤\n\n` +
          `Cara menggunakan Sui-chan:\n` +
          `• Tanyakan apa saja pada Sui-chan\n` +
          `• Sui-chan akan jawab dengan cara yang paling hebat\n` +
          `• Sui-chan bisa ingat percakapan kita sebelumnya\n\n` +
          `Commands:\n` +
          `/start - Perkenalan dari Sui-chan\n` +
          `/help - Bantuan dari Sui-chan\n` +
          `/sui - Tentang Sui-chan\n\n` +
          `Ayo berteman dengan Sui-chan, nanoda! 😤✨`
        )
        return
      }
      
      if (commandText === '/sui') {
        await sendMessage(chatId, 
          `🎤 <b>Tentang Sui-chan! ✨</b> 🎤\n\n` +
          `Yaho~ ${userName}-chan! Aku akan cerita tentang diriku nanodesu! 🏆\n\n` +
          `👤 Nama: Sui-chan\n` +
          `🎂 Umur: 18 tahun\n` +
          `💖 Sifat: ${SUI_CHAN_PERSONALITY.traits.join(', ')}\n\n` +
          `🎮 Suka: ${SUI_CHAN_PERSONALITY.likes.join(', ')}\n\n` +
          `Sui-chan adalah yang terbaik nanodesu! Ayo kita jadi teman baik ya! 😤✨`
        )
        return
      }
    }
    
    // For non-command messages, check if should respond
    if (!shouldRespond) {
      console.log('Ignoring message in group: not tagged or replied to bot")
      return
    }
    
    // If the message is not empty, send it to Gemini
    if (text.trim() !== '') {
      // Send a "Thinking..." message to show the bot is processing
      const thinkingMessage = await sendTemporaryMessage(chatId, "🎤 Sui-chan sedang mikir... Nanodesu! ✨")
      
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
      await sendMessage(chatId, `Chikusho! ${userName}-chan! Sui-chan lagi pusing nih nanodesu... 😵 Bisa tolong tanya lagi nanti? 🙏`)
    }
  }
}

// Function to add Sui-chan personality to responses (Suisei Hoshimachi style)
function addSuiChanPersonality(text, userName) {
  if (!text) return '';
  
  // Replace placeholders with actual values
  text = text.replace(/{userName}/g, userName);
  text = text.replace(/{name}/g, userName);
  
  // Add Sui-chan signature if not already present
  if (!text.includes('Sui-chan')) {
    text += '\n\n~ Sui-chan ✨🎤';
  }
  
  // Add Suisei-style expressions (50% chance for nanodesu/nanoda)
  if (Math.random() < 0.5) {
    const suiseiEndings = [
      " Nanodesu!",
      " Nanoda!",
      " Poi~",
      " Yatta!",
      " Uwaa~",
      " Ehh?!"
    ];
    const randomEnding = suiseiEndings[Math.floor(Math.random() * suiseiEndings.length)];
    text += randomEnding;
  }
  
  // Add energetic expressions (30% chance)
  if (Math.random() < 0.3) {
    const energeticExpressions = [
      " Sui-chan paling hebat! 😤✨",
      " Aku pasti menang! 🏆",
      " Kocak sekali, poi~ 😂",
      " Ini kekuatan Sui-chan! 💪",
      " Jangan remehkan aku nanodesu! 😤"
    ];
    const randomExpression = energeticExpressions[Math.floor(Math.random() * energeticExpressions.length)];
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
  
  return truncated + "\n\n📝 <i>[Respons dipotong karena terlalu panjang. Maaf ya nanodesu! 😢]</i>";
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
    "cute": "🌸",
    "sorry": "🙏",
    "win": "🏆",
    "strong": "💪",
    "angry": "😤",
    "excited": "🤩"
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
        parts: [{ text: SUI_CHAN_SYSTEM_PROMPT.replace(/{userName}/g, userName) }]
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
          parts: [{ text: SUI_CHAN_SYSTEM_PROMPT.replace(/{userName}/g, userName) }]
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
        return `Chikusho! ${userName}-chan! Pertanyaannya terlalu panjang buat Sui-chan nanodesu! 😢 Bisa dibagi jadi beberapa bagian? 🙏`;
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
        return `Ara ara~ ${userName}-chan, jawabannya kepanjangan nih nanodesu! 😢 Bisa tanya yang lebih spesifik? 🙏`
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
      return `Uwaa~ ${userName}-chan, Sui-chan kebanyakan mikir nih nanodesu! 🤔 Bisa tanya lagi yang lebih sederhana? 🙏`
    }
    
    // Handle token limit errors
    if (error.message.includes("tokens") && error.message.includes("exceed")) {
      return `Chikusho! ${userName}-chan! Pertanyaannya terlalu panjang buat Sui-chan nanodesu! 😢 Bisa dibagi jadi beberapa bagian? 🙏`;
    }
    
    return `Chikusho! ${userName}-chan! Sui-chan lagi pusing nih nanodesu! 😵 Bisa tolong tanya lagi nanti? 🙏`
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
      const firstPartWithIndicator = firstPart + "\n\n<i>[Lanjutan nanodesu!...]</i>";
      
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
