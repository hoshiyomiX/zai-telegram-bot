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
    
    console.log(`Message from ${chatId}: ${text}`)
    
    // Handle /start command
    if (text === '/start') {
      await sendMessage(chatId, 
        `🤖 <b>Gemini 1.0 Pro Chat Bot</b>\n\n` +
        `Hello! I'm powered by Google's Gemini 1.0 Pro model. Send me any message and I'll respond as an AI assistant.\n\n` +
        `You can ask me questions, request help with tasks, or just have a conversation!`
      )
      return
    }
    
    // Handle /help command
    if (text === '/help') {
      await sendMessage(chatId, 
        `📖 <b>Help</b>\n\n` +
        `Available commands:\n` +
        `/start - Welcome message\n` +
        `/help - Show this help message\n\n` +
        `Just send me any text message and I'll respond as an AI assistant.`
      )
      return
    }
    
    // If the message is not empty, send it to Gemini
    if (text.trim() !== '') {
      // Send a "typing" indicator to show the bot is thinking
      await sendChatAction(chatId, 'typing')
      
      // Get response from Gemini with retry logic
      const aiResponse = await getGeminiResponseWithRetry(text)
      
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

async function getGeminiResponseWithRetry(message, maxRetries = 2) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await getGeminiResponse(message);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.log(`Retry ${i + 1} after error:`, error.message);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

async function getGeminiResponse(message) {
  try {
    console.log('Sending message to Gemini 1.0 Pro...')
    
    // Get the API key from environment variables
    const apiKey = GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set')
    }
    
    // Truncate very long messages to prevent timeouts on free tier
    const truncatedMessage = message.length > 300 ? message.substring(0, 300) + "..." : message;
    
    // Prepare the request body for Gemini API with optimized settings
    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: truncatedMessage
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024, // Reduced to generate shorter responses faster
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
    
    // Make the request to Gemini 1.0 Pro API with shorter timeout
    const response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.0-pro:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Gemini Telegram Bot'
        },
        body: JSON.stringify(requestBody)
      },
      10000 // 10 second timeout for free tier
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
