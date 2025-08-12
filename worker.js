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
      const requestClone = request.clone()
      const update = await requestClone.json()
      const response = new Response('OK')
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
    if (!update.message) {
      console.log('No message in update')
      return
    }
    
    const chatId = update.message.chat.id
    const text = update.message.text || ''
    
    console.log(`Message from ${chatId}: ${text}`)
    
    // Handle commands
    if (text === '/start') {
      await sendMessage(chatId, 
        `🤖 <b>Gemini 2.5 Pro Chat Bot</b>\n\n` +
        `Hello! I'm powered by Google's Gemini 2.5 Pro model. Send me any message and I'll respond as an AI assistant.\n\n` +
        `Commands:\n` +
        `/start - Welcome message\n` +
        `/help - Show this help message\n` +
        `/reasoning - Toggle reasoning mode\n\n` +
        `Just send me any text message and I'll respond as an AI assistant.`
      )
      return
    }
    
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
    
    if (text.trim() !== '') {
      // Check cooldown
      const canProcess = await checkCooldown(chatId)
      if (!canProcess) {
        await sendMessage(chatId, "Please wait a minute before sending another request.")
        return
      }
      
      // Send typing indicator
      await sendChatAction(chatId, 'typing')
      
      // Get response from Gemini
      const aiResponse = await getGeminiResponseWithRetry(chatId, text)
      
      // Send the response
      await sendMessage(chatId, aiResponse)
      
      // Set cooldown
      await setCooldown(chatId)
    }
  } catch (error) {
    console.error('Error processing update:', error)
    const chatId = update.message?.chat.id
    if (chatId) {
      await sendMessage(chatId, "Sorry, I'm having trouble responding right now. Please try again later.")
    }
  }
}

// KV storage functions for reasoning mode and cooldown
async function getReasoningMode(chatId) {
  try {
    const key = `reasoning:${chatId}`
    const value = await BOT_CACHE.get(key)
    return value === 'true'
  } catch (error) {
    console.error('Error getting reasoning mode:', error)
    return false
  }
}

async function setReasoningMode(chatId, enabled) {
  try {
    const key = `reasoning:${chatId}`
    await BOT_CACHE.put(key, enabled.toString(), { expirationTtl: 86400 * 30 })
  } catch (error) {
    console.error('Error setting reasoning mode:', error)
  }
}

async function checkCooldown(chatId) {
  try {
    const key = `cooldown:${chatId}`
    const lastRequest = await BOT_CACHE.get(key)
    if (!lastRequest) return true
    
    const lastTime = parseInt(lastRequest)
    const now = Date.now()
    const cooldownPeriod = 60 * 1000 // 1 minute in milliseconds
    return (now - lastTime) > cooldownPeriod
  } catch (error) {
    console.error('Error checking cooldown:', error)
    return true // Allow request if error checking cooldown
  }
}

async function setCooldown(chatId) {
  try {
    const key = `cooldown:${chatId}`
    await BOT_CACHE.put(key, Date.now().toString(), { expirationTtl: 60 }) // 1 minute
  } catch (error) {
    console.error('Error setting cooldown:', error)
  }
}

async function getGeminiResponseWithRetry(chatId, message, maxRetries = 2) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await getGeminiResponse(chatId, message)
    } catch (error) {
      if (i === maxRetries - 1) throw error
      console.log(`Retry ${i + 1} after error:`, error.message)
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
}

async function getGeminiResponse(chatId, message) {
  try {
    console.log('Sending message to Gemini 2.5 Pro...')
    
    const apiKey = GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set')
    }
    
    const reasoningMode = await getReasoningMode(chatId)
    const truncatedMessage = message.length > 300 ? message.substring(0, 300) + "..." : message
    
    const requestBody = {
      contents: [{
        parts: [{ text: truncatedMessage }]
      }],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
      ]
    }
    
    if (reasoningMode) {
      requestBody.reasoning_mode = "enabled"
    }
    
    const response = await fetchWithTimeout(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Gemini Telegram Bot'
        },
        body: JSON.stringify(requestBody)
      },
      30000 // 30 second timeout
    )
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Gemini API error:', errorText)
      throw new Error(`Gemini API returned ${response.status}: ${errorText}`)
    }
    
    const data = await response.json()
    console.log('Gemini response received')
    
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      return data.candidates[0].content.parts[0].text
    }
    throw new Error('Unexpected response format from Gemini API')
    
  } catch (error) {
    console.error('Error getting Gemini response:', error)
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
    const maxMessageLength = 4096
    
    if (text.length > maxMessageLength) {
      const chunks = splitMessage(text, maxMessageLength)
      for (const chunk of chunks) {
        await sendSingleMessage(chatId, chunk)
      }
    } else {
      await sendSingleMessage(chatId, text)
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
  const chunks = []
  while (text.length > 0) {
    let splitIndex = text.lastIndexOf(' ', maxLength)
    if (splitIndex === -1) splitIndex = maxLength
    chunks.push(text.substring(0, splitIndex))
    text = text.substring(splitIndex).trim()
  }
  return chunks
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

function fetchWithTimeout(url, options, timeout = 30000) {
  console.log(`Fetching ${url} with timeout ${timeout}ms`)
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout')), timeout)
    )
  ])
}
