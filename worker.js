addEventListener('fetch', event => {
  event.respondWith(handleRequest(event))
})

async function handleRequest(event) {
  const request = event.request
  
  // Handle GET requests (for webhook verification)
  if (request.method === 'GET') {
    return new Response('OpenAI Telegram Bot is running!')
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
    
    console.log(`Message from ${chatId}: ${text}`)
    
    // Handle /start command
    if (text === '/start') {
      await sendMessage(chatId, 
        `🤖 <b>OpenAI Chat Bot</b>\n\n` +
        `Hello! I'm powered by OpenAI's GPT-4o-mini model. Send me any message and I'll respond as an AI assistant.\n\n` +
        `Commands:\n` +
        `/start - Welcome message\n` +
        `/help - Show this help message\n` +
        `/reasoning - Toggle reasoning mode\n\n` +
        `Just send me any text message and I'll respond as an AI assistant.`
      )
      return
    }
    
    // Handle /help command
    if (text === '/help') {
      await sendMessage(chatId, 
        `📖 <b>Help</b>\n\n` +
        `Available commands:\n` +
        `/start - Welcome message\n` +
        `/help - Show this help message\n` +
        `/reasoning - Toggle reasoning mode\n\n` +
        `Just send me any text message and I'll respond as an AI assistant.`
      )
      return
    }
    
    // Handle /reasoning command
    if (text === '/reasoning') {
      const currentMode = await getReasoningMode(chatId)
      const newMode = !currentMode
      await setReasoningMode(chatId, newMode)
      
      await sendMessage(chatId, 
        `🧠 <b>Reasoning Mode</b>\n\n` +
        `Reasoning mode is now ${newMode ? 'enabled' : 'disabled'}.\n\n` +
        `When enabled, I'll provide step-by-step reasoning for my answers. This may take slightly longer but provides more detailed explanations.`
      )
      return
    }
    
    // If the message is not empty, send it to OpenAI
    if (text.trim() !== '') {
      // Send a "typing" indicator to show the bot is thinking
      await sendChatAction(chatId, 'typing')
      
      // Get response from OpenAI with retry logic
      const aiResponse = await getOpenAIResponseWithRetry(chatId, text)
      
      // Send the response back to the user
      await sendMessage(chatId, aiResponse)
    }
  } catch (error) {
    console.error('Error processing update:', error)
    // Send error message to user
    const chatId = update.message?.chat.id
    if (chatId) {
      await sendMessage(chatId, "Sorry, I'm having trouble responding right now. Please try again later.")
    }
  }
}

// KV storage functions for reasoning mode
async function getReasoningMode(chatId) {
  try {
    const key = `reasoning:${chatId}`
    const value = await BOT_CACHE.get(key)
    return value === 'true'
  } catch (error) {
    console.error('Error getting reasoning mode:', error)
    return false // Default to disabled
  }
}

async function setReasoningMode(chatId, enabled) {
  try {
    const key = `reasoning:${chatId}`
    await BOT_CACHE.put(key, enabled.toString(), { expirationTtl: 86400 * 30 }) // 30 days
  } catch (error) {
    console.error('Error setting reasoning mode:', error)
  }
}

async function getOpenAIResponseWithRetry(chatId, message, maxRetries = 2) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await getOpenAIResponse(chatId, message);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.log(`Retry ${i + 1} after error:`, error.message);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

async function getOpenAIResponse(chatId, message) {
  try {
    console.log('Sending message to OpenAI GPT-4o-mini...');
    
    // Get the API key from environment variables
    const apiKey = OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    
    // Get user's reasoning mode preference
    const reasoningMode = await getReasoningMode(chatId);
    
    // Truncate very long messages to prevent timeouts
    const truncatedMessage = message.length > 300 ? message.substring(0, 300) + "..." : message;
    
    // Prepare the messages array
    const messages = [];
    
    // Add system prompt
    let systemPrompt = 'You are a helpful AI assistant.';
    if (reasoningMode) {
      systemPrompt = 'You are a helpful AI assistant that thinks step-by-step before answering. Provide detailed reasoning in your responses.';
    }
    messages.push({ role: 'system', content: systemPrompt });
    
    // Add user message
    messages.push({ role: 'user', content: truncatedMessage });
    
    // Prepare the request body
    const requestBody = {
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.7,
      top_p: 0.95,
      max_tokens: 1024
    };
    
    // Send request to OpenAI
    const response = await fetchWithTimeout(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'User-Agent': 'OpenAI Telegram Bot'
        },
        body: JSON.stringify(requestBody)
      },
      15000 // 15 second timeout
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      throw new Error(`OpenAI API returned ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    console.log('OpenAI response received');
    
    // Extract the AI response text
    if (data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
      return data.choices[0].message.content.trim();
    } else {
      throw new Error('Unexpected response format from OpenAI API');
    }
    
  } catch (error) {
    console.error('Error getting OpenAI response:', error);
    
    // Check if it's a timeout error
    if (error.message === 'Request timeout') {
      return `Sorry, the request timed out. The AI model is taking too long to respond. Please try again with a shorter query.`;
    }
    
    return `Sorry, I encountered an error while processing your request: ${error.message}`;
  }
}

async function sendMessage(chatId, text) {
  try {
    console.log(`Sending message to ${chatId}: ${text.substring(0, 100)}...`);
    const token = TELEGRAM_BOT_TOKEN;
    
    // Split long messages into chunks to avoid Telegram API limits
    const maxMessageLength = 4096; // Telegram's max message length
    if (text.length > maxMessageLength) {
      const chunks = splitMessage(text, maxMessageLength);
      for (const chunk of chunks) {
        await sendSingleMessage(chatId, chunk);
      }
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
    const errorText = await response.text();
    console.error('Error sending message:', errorText);
  } else {
    console.log('Message sent successfully');
  }
}

function splitMessage(text, maxLength) {
  const chunks = [];
  while (text.length > 0) {
    // Find the last space before maxLength to avoid breaking words
    let splitIndex = text.lastIndexOf(' ', maxLength);
    if (splitIndex === -1) splitIndex = maxLength; // No space found, split at maxLength
    
    chunks.push(text.substring(0, splitIndex));
    text = text.substring(splitIndex).trim();
  }
  return chunks;
}

async function sendChatAction(chatId, action) {
  try {
    const token = TELEGRAM_BOT_TOKEN;
    await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        action: action
      })
    });
  } catch (error) {
    console.error('Error sending chat action:', error);
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Helper function for fetch with timeout
function fetchWithTimeout(url, options, timeout = 10000) {
  console.log(`Fetching ${url} with timeout ${timeout}ms`);
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout')), timeout)
    )
  ]);
}
