addEventListener('fetch', event => {
  event.respondWith(handleRequest(event))
})

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 60000; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 5; // Maximum requests per minute
const requestTimestamps = [];

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
        `Hello! I'm powered by Z.ai's GLM-4-5 model. Send me any message and I'll respond as an AI assistant.\n\n` +
        `Note: To avoid rate limits, please wait a moment between messages.`
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
        `/status - Check bot status\n\n` +
        `Note: To avoid rate limits, please wait a moment between messages.`
      )
      return
    }
    
    // Handle /status command
    if (text === '/status') {
      const status = getRateLimitStatus();
      await sendMessage(chatId, status);
      return
    }
    
    // If the message is not empty, check rate limit and send to Z.ai
    if (text.trim() !== '') {
      // Check rate limit
      if (!isRateLimited()) {
        // Send a "typing" indicator to show the bot is thinking
        await sendChatAction(chatId, 'typing')
        
        // Get response from Z.ai
        const aiResponse = await getZaiResponse(text)
        
        // Send the response back to the user
        await sendMessage(chatId, aiResponse)
      } else {
        // Rate limit exceeded
        const waitTime = getWaitTime();
        await sendMessage(chatId, 
          `⚠️ <b>Rate Limit Exceeded</b>\n\n` +
          `I'm receiving too many requests right now. Please wait ${waitTime} before trying again.`
        )
      }
    }
  } catch (error) {
    console.error('Error processing update:', error)
  }
}

function isRateLimited() {
  const now = Date.now();
  
  // Remove timestamps outside the rate limit window
  while (requestTimestamps.length > 0 && requestTimestamps[0] < now - RATE_LIMIT_WINDOW) {
    requestTimestamps.shift();
  }
  
  // Check if we've exceeded the rate limit
  if (requestTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }
  
  // Add the current timestamp
  requestTimestamps.push(now);
  return false;
}

function getWaitTime() {
  const now = Date.now();
  const oldestTimestamp = requestTimestamps[0];
  const waitTimeMs = RATE_LIMIT_WINDOW - (now - oldestTimestamp);
  const waitTimeSeconds = Math.ceil(waitTimeMs / 1000);
  
  if (waitTimeSeconds < 60) {
    return `${waitTimeSeconds} seconds`;
  } else {
    const minutes = Math.floor(waitTimeSeconds / 60);
    const seconds = waitTimeSeconds % 60;
    return `${minutes} minute${minutes > 1 ? 's' : ''}${seconds > 0 ? ` ${seconds} second${seconds > 1 ? 's' : ''}` : ''}`;
  }
}

function getRateLimitStatus() {
  const now = Date.now();
  
  // Remove timestamps outside the rate limit window
  while (requestTimestamps.length > 0 && requestTimestamps[0] < now - RATE_LIMIT_WINDOW) {
    requestTimestamps.shift();
  }
  
  const requestsInWindow = requestTimestamps.length;
  const remainingRequests = MAX_REQUESTS_PER_WINDOW - requestsInWindow;
  
  if (requestsInWindow >= MAX_REQUESTS_PER_WINDOW) {
    const oldestTimestamp = requestTimestamps[0];
    const waitTimeMs = RATE_LIMIT_WINDOW - (now - oldestTimestamp);
    const waitTimeSeconds = Math.ceil(waitTimeMs / 1000);
    
    return `⚠️ <b>Rate Limit Status</b>\n\n` +
           `Status: <code>LIMIT EXCEEDED</code>\n` +
           `Requests in last minute: ${requestsInWindow}/${MAX_REQUESTS_PER_WINDOW}\n` +
           `Please wait: ${getWaitTime()}`;
  } else {
    return `✅ <b>Rate Limit Status</b>\n\n` +
           `Status: <code>OK</code>\n` +
           `Requests in last minute: ${requestsInWindow}/${MAX_REQUESTS_PER_WINDOW}\n` +
           `Remaining requests: ${remainingRequests}`;
  }
}

async function getZaiResponse(message) {
  try {
    console.log('Sending message to Z.ai...')
    
    // Get the API key from environment variables
    const apiKey = ZAI_API_KEY
    if (!apiKey) {
      throw new Error('ZAI_API_KEY environment variable is not set');
    }
    
    // Prepare the request body for Z.ai API
    const requestBody = {
      model: "glm-4-5",
      messages: [
        {
          role: "user",
          content: message
        }
      ],
      max_tokens: 1000,
      temperature: 0.7,
      stream: false
    }
    
    // Make the request to Z.ai API with retry logic
    const maxRetries = 2;
    let retryCount = 0;
    
    while (retryCount <= maxRetries) {
      try {
        const response = await fetchWithTimeout(
          'https://api.z.ai/v1/chat/completions',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
              'User-Agent': 'Z.ai Telegram Bot'
            },
            body: JSON.stringify(requestBody)
          },
          30000 // 30 second timeout for AI responses
        );
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Attempt ${retryCount + 1} - Z.ai API error:`, errorText);
          
          // If it's a 429 error, throw immediately without retry
          if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please wait before trying again.');
          }
          
          // For other errors, retry if we haven't reached max retries
          if (retryCount < maxRetries) {
            retryCount++;
            // Exponential backoff
            const delay = Math.pow(2, retryCount) * 1000;
            console.log(`Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          
          throw new Error(`Z.ai API returned ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        console.log('Z.ai response received');
        
        // Extract the AI response text
        if (data.choices && data.choices.length > 0 && data.choices[0].message) {
          return data.choices[0].message.content;
        } else {
          throw new Error('Unexpected response format from Z.ai API');
        }
        
      } catch (error) {
        console.error(`Attempt ${retryCount + 1} - Error:`, error);
        
        // If this is the last attempt, throw the error
        if (retryCount >= maxRetries) {
          throw error;
        }
        
        // Otherwise, retry
        retryCount++;
        // Exponential backoff
        const delay = Math.pow(2, retryCount) * 1000;
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
  } catch (error) {
    console.error('Error getting Z.ai response:', error);
    
    // Provide a helpful error message based on the error type
    if (error.message.includes('Rate limit exceeded')) {
      return `⚠️ <b>Rate Limit Exceeded</b>\n\n` +
             `I'm receiving too many requests right now. Please wait a moment before trying again.\n\n` +
             `You can check my current status with /status`;
    } else if (error.message.includes('timeout')) {
      return `⏱️ <b>Request Timeout</b>\n\n` +
             `The AI is taking too long to respond. Please try a shorter message or try again later.`;
    } else {
      return `Sorry, I encountered an error while processing your request: ${error.message}`;
    }
  }
}

async function sendMessage(chatId, text) {
  try {
    console.log(`Sending message to ${chatId}: ${text.substring(0, 100)}...`);
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
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error sending message:', errorText);
    } else {
      console.log('Message sent successfully');
    }
  } catch (error) {
    console.error('Error in sendMessage:', error);
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
    });
  } catch (error) {
    console.error('Error sending chat action:', error)
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
  ])
}
