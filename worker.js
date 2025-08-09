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
        `🤖 <b>Z.ai Chat Bot</b>\n\n` +
        `Hello! I'm powered by Z.ai's GLM-4.5-flash model. Send me any message and I'll respond as an AI assistant.\n\n` +
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
    console.log('Sending message to Z.ai...')
    
    // Get the API key from environment variables
    const apiKey = ZAI_API_KEY
    if (!apiKey) {
      throw new Error('ZAI_API_KEY environment variable is not set')
    }
    
    // Prepare the request body for Z.ai API
    // Based on the JavaScript example, we use the correct endpoint and structure
    const requestBody = {
      model: "glm-4.5-flash",
      messages: [
        {
          role: "user",
          content: message
        }
      ]
    }
    
    // Make the request to Z.ai API
    const url = 'https://api.z.ai/api/paas/v4/chat/completions'
    const options = {
      method: 'POST',
      headers: {
        'Accept-Language': 'en-US,en;q=0.9',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    }
    
    const response = await fetchWithTimeout(url, options, 30000)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Z.ai API error:', errorText)
      throw new Error(`Z.ai API returned ${response.status}: ${errorText}`)
    }
    
    const data = await response.json()
    console.log('Z.ai response received:', JSON.stringify(data))
    
    // Extract the AI response text based on the 200 response format
    if (data.choices && data.choices.length > 0 && data.choices[0].message) {
      // Check if there's reasoning content
      let responseText = data.choices[0].message.content
      if (data.choices[0].message.reasoning_content) {
        responseText += `\n\n📝 <b>Reasoning:</b>\n${data.choices[0].message.reasoning_content}`
      }
      
      // Check if there are tool calls
      if (data.choices[0].message.tool_calls && data.choices[0].message.tool_calls.length > 0) {
        responseText += `\n\n🔧 <b>Tool Calls:</b>\n`
        data.choices[0].message.tool_calls.forEach(tool => {
          responseText += `- ${tool.function.name}\n`
        })
      }
      
      // Check if there's web search information
      if (data.web_search && data.web_search.length > 0) {
        responseText += `\n\n🔍 <b>Web Search Results:</b>\n`
        data.web_search.forEach(result => {
          responseText += `- ${result.title}: ${result.link}\n`
        })
      }
      
      return responseText
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
