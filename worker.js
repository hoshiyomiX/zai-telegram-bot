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
        `Hello! I'm powered by Z.ai's GLM-4.5 model. Send me any message and I'll respond as an AI assistant.\n\n` +
        `Note: To avoid rate limiting, please wait a moment between messages.`
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
        `Note: To avoid rate limiting, please wait a moment between messages.`
      )
      return
    }
    
    // If the message is not empty, send it to Z.ai
    if (text.trim() !== '') {
      // Send a "typing" indicator to show the bot is thinking
      await sendChatAction(chatId, 'typing')
      
      // Get response from Z.ai with rate limiting
      const aiResponse = await getZaiResponseWithRateLimit(chatId, text)
      
      // Send the response back to the user
      await sendMessage(chatId, aiResponse)
    }
  } catch (error) {
    console.error('Error processing update:', error)
  }
}

// Rate limiting and retry logic for Z.ai API
async function getZaiResponseWithRateLimit(chatId, message) {
  const maxRetries = 3;
  const baseDelay = 1000; // 1 second base delay
  const maxDelay = 16000; // 16 seconds max delay
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Add jitter to spread out requests
      const jitter = Math.random() * 1000; // 0-1 second random jitter
      const delay = attempt === 0 ? 0 : Math.min(baseDelay * Math.pow(2, attempt) + jitter, maxDelay);
      
      if (delay > 0) {
        console.log(`Rate limiting: Waiting ${delay.toFixed(0)}ms before attempt ${attempt + 1}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      console.log(`Attempt ${attempt + 1} to call Z.ai API for chat ${chatId}`);
      
      const response = await getZaiResponse(message);
      
      // If we get a successful response, return it
      return response;
      
    } catch (error) {
      console.error(`Attempt ${attempt + 1} failed:`, error.message);
      
      // If it's a 429 error and we have retries left, continue
      if (error.message.includes('429') && attempt < maxRetries) {
        console.log('Rate limit hit, retrying...');
        continue;
      }
      
      // If it's any other error or we're out of retries, throw
      throw error;
    }
  }
  
  throw new Error('Max retries exceeded for Z.ai API');
}

async function getZaiResponse(message) {
  try {
    console.log('Sending message to Z.ai...');
    
    // Get the API key from environment variables
    const apiKey = ZAI_API_KEY;
    if (!apiKey) {
      throw new Error('ZAI_API_KEY environment variable is not set');
    }
    
    // Prepare the request body for Z.ai API
    const requestBody = {
      model: "glm-4.5",
      messages: [
        {
          role: "user",
          content: message
        }
      ]
    }
    
    // Make the request to Z.ai API
    const url = 'https://api.z.ai/api/paas/v4/chat/completions';
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
      const errorText = await response.text();
      console.error('Z.ai API error:', errorText);
      
      // If it's a 429 error, throw a special error that includes the error text
      if (response.status === 429) {
        throw new Error(`429: ${errorText}`);
      }
      
      throw new Error(`Z.ai API returned ${response.status}: ${errorText}`);
    }
    
    const data = await response.json();
    console.log('Z.ai response received');
    
    // Extract the AI response text based on the 200 response format
    if (data.choices &&
