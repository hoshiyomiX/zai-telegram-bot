addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  // Handle GET requests for webhook verification
  if (request.method === 'GET') {
    return new Response('Gemini 2.5 Flash Telegram Bot is running!', { status: 200 });
  }

  // Handle POST requests for Telegram updates
  if (request.method === 'POST') {
    try {
      const update = await request.json();
      // Respond immediately to avoid Telegram webhook timeout
      event.waitUntil(processUpdate(update));
      return new Response('OK', { status: 200 });
    } catch (error) {
      console.error('Error parsing request:', error);
      return new Response('Error', { status: 500 });
    }
  }

  return new Response('Method not allowed', { status: 405 });
}

async function processUpdate(update) {
  try {
    // Ensure update contains a message
    if (!update.message || !update.message.chat) {
      console.log('Invalid update: no message or chat');
      return;
    }

    const chatId = update.message.chat.id;
    const text = update.message.text || '';

    console.log(`Received message from chat ${chatId}: ${text}`);

    // Handle commands
    if (text === '/start') {
      await sendMessage(chatId, 
        `🤖 <b>Gemini 2.5 Flash Bot</b>\n\n` +
        `Welcome! I'm powered by Google's Gemini 2.5 Flash model. Send me a message, and I'll respond as an AI assistant.\n\n` +
        `Commands:\n` +
        `/start - Show this welcome message\n` +
        `/help - Display help information\n` +
        `/reasoning - Toggle reasoning mode for detailed responses`
      );
      return;
    }

    if (text === '/help') {
      await sendMessage(chatId, 
        `📖 <b>Help</b>\n\n` +
        `Available commands:\n` +
        `/start - Welcome message\n` +
        `/help - This help message\n` +
        `/reasoning - Toggle reasoning mode\n\n` +
        `Send any text message to get a response from Gemini 2.5 Flash.`
      );
      return;
    }

    if (text === '/reasoning') {
      const currentMode = await getReasoningMode(chatId);
      const newMode = !currentMode;
      await setReasoningMode(chatId, newMode);
      await sendMessage(chatId, 
        `🧠 <b>Reasoning Mode</b>\n\n` +
        `Reasoning mode is now ${newMode ? 'enabled' : 'disabled'}.\n` +
        `When enabled, responses include step-by-step reasoning (may take longer).`
      );
      return;
    }

    // Handle regular messages
    if (text.trim()) {
      await sendChatAction(chatId, 'typing');
      const response = await getGeminiResponse(chatId, text);
      await sendMessage(chatId, response);
    }
  } catch (error) {
    console.error('Error processing update:', error);
    if (update.message?.chat?.id) {
      await sendMessage(update.message.chat.id, 
        'Sorry, I encountered an issue. Please try again later.');
    }
  }
}

// KV storage for reasoning mode
async function getReasoningMode(chatId) {
  try {
    const value = await BOT_CACHE.get(`reasoning:${chatId}`);
    return value === 'true';
  } catch (error) {
    console.error('Error getting reasoning mode:', error);
    return false;
  }
}

async function setReasoningMode(chatId, enabled) {
  try {
    await BOT_CACHE.put(`reasoning:${chatId}`, enabled.toString(), { expirationTtl: 2592000 }); // 30 days
  } catch (error) {
    console.error('Error setting reasoning mode:', error);
  }
}

async function getGeminiResponse(chatId, message) {
  try {
    const apiKey = GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not set');
    }

    const reasoningMode = await getReasoningMode(chatId);
    const truncatedMessage = message.length > 300 ? message.substring(0, 300) + '...' : message;

    const requestBody = {
      contents: [{ parts: [{ text: truncatedMessage }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ],
    };

    if (reasoningMode) {
      requestBody.generationConfig.thinkingConfig = { includeThoughts: true };
    }

    const response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      },
      10000 // 10-second timeout
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('Gemini response:', JSON.stringify(data, null, 2));

    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      return escapeHtml(data.candidates[0].content.parts[0].text);
    }
    throw new Error('Invalid Gemini API response format');
  } catch (error) {
    console.error('Error in getGeminiResponse:', error);
    return `Sorry, I encountered an error: ${error.message}`;
  }
}

async function sendMessage(chatId, text) {
  try {
    const token = TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is not set');
    }

    const maxLength = 4096;
    if (text.length > maxLength) {
      const chunks = splitMessage(text, maxLength);
      for (const chunk of chunks) {
        await sendSingleMessage(chatId, chunk);
      }
    } else {
      await sendSingleMessage(chatId, text);
    }
  } catch (error) {
    console.error('Error sending message:', error);
  }
}

async function sendSingleMessage(chatId, text) {
  const token = TELEGRAM_BOT_TOKEN;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: escapeHtml(text),
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Telegram API error:', errorText);
  }
}

async function sendChatAction(chatId, action) {
  try {
    const token = TELEGRAM_BOT_TOKEN;
    await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action }),
    });
  } catch (error) {
    console.error('Error sending chat action:', error);
  }
}

function splitMessage(text, maxLength) {
  const chunks = [];
  while (text.length > 0) {
    let splitIndex = text.lastIndexOf(' ', maxLength);
    if (splitIndex === -1) splitIndex = maxLength;
    chunks.push(text.substring(0, splitIndex));
    text = text.substring(splitIndex).trim();
  }
  return chunks;
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fetchWithTimeout(url, options, timeout = 10000) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), timeout)
    ),
  ]);
}
