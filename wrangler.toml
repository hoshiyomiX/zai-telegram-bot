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
    const botUsername = TELEGRAM_BOT_USERNAME || 'your_bot_username' // Set this in environment variables
    
    console.log(`Message from ${chatId} (${chatType}): ${text}`)
    
    // Handle commands first
    if (text.startsWith('/')) {
      await handleCommand(chatId, text)
      return
    }
    
    // Check if bot should respond (private chat or summoned in group)
    const shouldRespond = chatType === 'private' || isBotSummoned(update.message, botUsername)
    
    if (!shouldRespond) {
      console.log('Bot not summoned, ignoring message')
      return
    }
    
    // If the message is not empty, send it to Gemini
    if (text.trim() !== '') {
      // Send a "typing" indicator to show the bot is thinking
      await sendChatAction(chatId, 'typing')
      
      // Get context if replying to a message
      let context = ''
      if (update.message.reply_to_message && update.message.reply_to_message.text) {
        context = update.message.reply_to_message.text
        console.log(`Replying to context: ${context.substring(0, 100)}...`)
      }
      
      // Get response from Gemini with retry logic
      const aiResponse = await getGeminiResponseWithRetry(chatId, text, context)
      
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

// Handle bot commands
async function handleCommand(chatId, text) {
  const command = text.split(' ')[0]
  
  switch (command) {
    case '/start':
      await sendMessage(chatId, 
        `🤖 <b>Gemini 2.5 Flash-Lite Chat Bot</b>\n\n` +
        `Hello! I'm powered by Google's Gemini 2.5 Flash-Lite model. Send me any message and I'll respond as an AI assistant.\n\n` +
        `You can ask me questions, request help with tasks, or just have a conversation!`
      )
      break
      
    case '/help':
      await sendMessage(chatId, 
        `📖 <b>Help</b>\n\n` +
        `Available commands:\n` +
        `/start - Welcome message\n` +
        `/help - Show this help message\n` +
        `/reasoning - Toggle reasoning features on/off\n\n` +
        `In groups, I only respond when:\n` +
        `• You tag me @${TELEGRAM_BOT_USERNAME || 'your_bot_username'}\n` +
        `• You reply to my message\n` +
        `• You reply to a message with a topic I should discuss`
      )
      break
      
    case '/reasoning':
      await toggleReasoning(chatId)
      break
      
    default:
      // Unknown command, but if it's a group and bot is summoned, process as normal message
      if (text.includes(`@${TELEGRAM_BOT_USERNAME || 'your_bot_username'}`)) {
        const cleanText = text.replace(`@${TELEGRAM_BOT_USERNAME || 'your_bot_username'}`, '').trim()
        if (cleanText) {
          await sendChatAction(chatId, 'typing')
          const aiResponse = await getGeminiResponseWithRetry(chatId, cleanText)
          await sendMessage(chatId, aiResponse)
        }
      }
      break
  }
}

// Toggle reasoning mode for a chat
async function toggleReasoning(chatId) {
  try {
    const reasoningKey = `reasoning:${chatId}`
    const currentMode = await BOT_CACHE.get(reasoningKey)
    const newMode = currentMode === 'enabled' ? 'disabled' : 'enabled'
    
    // Save new mode with 30 day expiration
    await BOT_CACHE.put(reasoningKey, newMode, { expirationTtl: 2592000 })
    
    const statusMessage = newMode === 'enabled' 
      ? `✅ Reasoning features have been <b>enabled</b>. I'll now provide more detailed, step-by-step explanations.`
      : `❌ Reasoning features have been <b>disabled</b>. I'll provide more concise responses.`
    
    await sendMessage(chatId, statusMessage)
  } catch (error) {
    console.error('Error toggling reasoning mode:', error)
    await sendMessage(chatId, "Sorry, I couldn't toggle reasoning mode right now. Please try again later.")
  }
}

// Check if bot should respond to the message
function isBotSummoned(message, botUsername) {
  // Check if message is a reply to bot's message
  if (message.reply_to_message && message.reply_to_message.from && 
      message.reply_to_message.from.username === botUsername) {
    console.log('Bot summoned: reply to bot message')
    return true
  }
  
  // Check if message contains bot mention
  if (message.entities) {
    for (const entity of message.entities) {
      if (entity.type === 'mention') {
        const mention = message.text.substring(entity.offset, entity.offset + entity.length)
        if (mention === `@${botUsername}`) {
          console.log('Bot summoned: mention found')
          return true
        }
      }
    }
  }
  
  // Check if message is a reply to a message with a topic
  if (message.reply_to_message && message.reply_to_message.text) {
    console.log('Bot summoned: reply to message with context')
    return true
  }
  
  console.log('Bot not summoned')
  return false
}

async function getGeminiResponseWithRetry(chatId, message, context = '', maxRetries = 2) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await getGeminiResponse(chatId, message, context);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.log(`Retry ${i + 1} after error:`, error.message);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

async function getGeminiResponse(chatId, message, context = '') {
  try {
    console.log('Sending message to Gemini 2.5 Flash-Lite...')
    
    // Get the API key from environment variables
    const apiKey = GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set')
    }
    
    // Check reasoning mode for this chat
    const reasoningKey = `reasoning:${chatId}`
    const reasoningMode = await BOT_CACHE.get(reasoningKey) || 'disabled'
    console.log(`Reasoning mode for chat ${chatId}: ${reasoningMode}`)
    
    // Prepare the full prompt with context if available
    let fullPrompt = message
    if (context) {
      fullPrompt = `Context: ${context}\n\nUser: ${message}\n\nPlease respond to the user's message based on the provided context.`
    }
    
    // Truncate very long messages to prevent timeouts on free tier
    const truncatedPrompt = fullPrompt.length > 300 ? fullPrompt.substring(0, 300) + "..." : fullPrompt;
    
    // Prepare the request body for Gemini API with optimized settings
    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: truncatedPrompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: reasoningMode === 'enabled' ? 2048 : 1024, // More tokens for reasoning mode
      },
      // Add reasoning mode parameter
      ...(reasoningMode === 'enabled' && { reasoning_mode: "enabled" }),
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
    
    // Make the request to Gemini 2.5 Flash-Lite API with shorter timeout
    const response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Gemini Telegram Bot'
        },
        body: JSON.stringify(requestBody)
      },
      reasoningMode === 'enabled' ? 15000 : 10000 // Longer timeout for reasoning mode
    )
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Gemini API error:', errorText)
      throw new Error(`Gemini API returned ${response.status}: ${errorText}`)
    }
    
    const data = await response.json()
    console.log('Gemini response received')
    
    // Extract the AI response text from the Gemini response structure
    if (data.candidates && data.candidates.length > 0 && 
        data.candidates[0].content && data.candidates[0].content.parts && 
        data.candidates[0].content.parts.length > 0) {
      return data.candidates[0].content.parts[0].text
    } else {
      throw new Error('Unexpected response format from Gemini API')
    }
    
  } catch (error) {
    console.error('Error getting Gemini response:', error)
    
    // Check if it's a timeout error
    if (error.message === 'Request timeout') {
      return `Sorry, the request timed out. The AI model is taking too long to respond. Please try again with a shorter query.`
    }
    
    return `Sorry, I encountered an error while processing your request: ${error.message}`
  }
}

async function sendMessage(chatId, text) {
  try {
    console.log(`Sending message to ${chatId}: ${text.substring(0, 100)}...`)
    const token = TELEGRAM_BOT_TOKEN
    
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
    const token = TELEGRAM_BOT_TOKEN
    await fetch(`https://api.telegram.org/bot${token}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        action: action
      })
    })
  } catch (error) {
    console.error('Error sending chat action:', error)
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
