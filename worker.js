addEventListener('fetch', event => {
  event.respondWith(handleRequest(event))
})

async function handleRequest(event) {
  const request = event.request
  
  // Handle GET requests (for webhook verification)
  if (request.method === 'GET') {
    return new Response('Z.ai Telegram Bot is running!')
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
        `🤖 <b>GLM-4.5 Chat Bot</b>\n\n` +
        `Hello! I'm powered by Z.ai's GLM-4.5 model. I can handle up to 128k tokens of context.\n\n` +
        `Send me any message and I'll respond as an AI assistant. You can ask questions, request help with tasks, or just have a conversation!`
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
        `Just send me any text message and I'll respond as an AI assistant.\n\n` +
        `I'm powered by GLM-4.5 with 128k context length!`
      )
      return
    }
    
    // If the message is not empty, send it to Z.ai
    if (text.trim() !== '') {
      // Send a "typing" indicator to show the bot is thinking
      await sendChatAction(chatId, 'typing')
      
      // Get response from Z.ai
      const aiResponse = await getZaiResponse(text)
      
      // Send the response back to the user
      await sendMessage(chatId, aiResponse)
    }
  } catch (error) {
    console.error('Error processing update:', error)
  }
}

async function getZaiResponse(message) {
  try {
    console.log('Sending message to Z.ai GLM-4.5...')
    
    // Get the API key from environment variables
    const apiKey = ZAI_API_KEY
    if (!apiKey) {
      throw new Error('ZAI_API_KEY environment variable is not set')
    }
    
    // Prepare the request body for Z.ai API
    // Based on the official GLM-4.5 documentation
    const requestBody = {
      model: "glm-4-5", // Using GLM-4-5 model
      messages: [
        {
          role: "user",
          content: message
        }
      ]
      // Note: max_tokens is optional and will be determined by the model
      // Temperature is optional and defaults to 0.7
    }
    
    // Make the request to Z.ai API using the official endpoint
    const response = await fetchWithTimeout(
      'https://open.bigmodel.cn/paas/v4/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'User-Agent': 'GLM-4.5 Telegram Bot'
        },
        body: JSON.stringify(requestBody)
      },
      60000 // 60 second timeout for longer responses
    )
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Z.ai API error:', errorText)
      throw new Error(`Z.ai API returned ${response.status}: ${errorText}`)
    }
    
    const data = await response.json()
    console.log('Z.ai GLM-4.5 response received')
    
    // Extract the AI response text based on the official documentation
    if (data.choices && data.choices.length > 0 && data.choices[0].message) {
      return data.choices[0].message.content
    } else {
      throw new Error('Unexpected response format from Z.ai API')
    }
    
  } catch (error) {
    console.error('Error getting Z.ai response:', error)
    return `Sorry, I encountered an error while processing your request: ${error.message}`
  }
}

async function sendMessage(chatId, text) {
  try {
    console.log(`Sending message to ${chatId}: ${text.substring(0, 100)}...`)
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
  } catch (error) {
    console.error('Error in sendMessage:', error)
  }
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
