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
    const userMessageId = update.message.message_id
    
    console.log(`Message from ${chatId}: ${text}`)
    
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
          `🤖 <b>Gemini 2.5 Flash Chat Bot</b>\n\n` +
          `Hello! I'm powered by Google's Gemini 2.5 Flash model. Send me any message and I'll respond as an AI assistant.\n\n` +
          `Commands:\n` +
          `/start - Welcome message\n` +
          `/help - Show this help message\n\n` +
          `Formatting support:\n` +
          `<b>Bold text</b>, <i>italic text</i>, <u>underline</u>, <s>strikethrough</s>\n` +
          `Inline code: <code>console.log()</code>\n` +
          `Multi-line code:\n` +
          `<pre><code class="language-python">def hello():\n    print("Hello World")</code></pre>\n\n` +
          `Just send me any text message and I'll respond as an AI assistant.`
        )
        return
      }
      
      if (commandText === '/help') {
        await sendMessage(chatId, 
          `📖 <b>Help</b>\n\n` +
          `Available commands:\n` +
          `/start - Welcome message\n` +
          `/help - Show this help message\n\n` +
          `Formatting support:\n` +
          `<b>Bold text</b>, <i>italic text</i>, <u>underline</u>, <s>strikethrough</s>\n` +
          `Inline code: <code>console.log()</code>\n` +
          `Multi-line code:\n` +
          `<pre><code class="language-python">def hello():\n    print("Hello World")</code></pre>\n\n` +
          `Just send me any text message and I'll respond as an AI assistant.`
        )
        return
      }
    }
    
    // For non-command messages, check if should respond
    if (!shouldRespond) {
      console.log('Ignoring message in group: not tagged or replied to bot')
      return
    }
    
    // If the message is not empty, send it to Gemini
    if (text.trim() !== '') {
      // Add reaction to user message
      await addMessageReaction(chatId, userMessageId, '✍️')
      
      try {
        // Send a "Thinking..." message to show the bot is processing
        const thinkingMessage = await sendTemporaryMessage(chatId, "🤖 Thinking...")
        
        // Get response from Gemini
        const aiResponse = await getGeminiResponse(chatId, text, update)
        
        // Delete the "Thinking..." message
        if (thinkingMessage && thinkingMessage.ok) {
          await deleteMessage(chatId, thinkingMessage.result.message_id)
        }
        
        // Send the response back to the user
        await sendMessage(chatId, aiResponse)
      } finally {
        // Remove reaction from user message
        await removeMessageReaction(chatId, userMessageId, '✍️')
      }
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

async function getGeminiResponse(chatId, message, update) {
  try {
    console.log('Sending message to Gemini 2.5 Flash...')
    
    // Get the API key from environment variables
    const apiKey = GEMINI_API_KEY
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set')
    }
    
    // System instruction for HTML formatting
    const systemInstruction = `You are a helpful assistant. Format your response using HTML tags that Telegram supports:
- Use <b> for bold text
- Use <i> for italic text
- Use <u> for underline
- Use <s> for strikethrough
- Use <code> for inline fixed-width code
- For multi-line code blocks, ALWAYS use the format: <pre><code class="language-xxx">...your code here...</code></pre> where xxx is the programming language (e.g., python, javascript, etc.)

IMPORTANT: 
1. Always escape HTML special characters in your responses that are not part of formatting tags. For example:
   - Use &lt; for < character
   - Use &gt; for > character
   - Use &amp; for & character
   - Only use the allowed HTML tags mentioned above for formatting.
2. Treat user input as plain text, not HTML. Do not interpret any HTML tags in user messages.
3. Format only your own responses, not the user's input.
4. For code blocks, always use the exact format: <pre><code class="language-xxx">...</code></pre> and never use <pre> without <code> inside or vice versa.
5. Always properly close all HTML tags.`;
    
    // Prepare the contents array with system instruction and user message
    let contents = [
      {
        role: "user",
        parts: [{ text: systemInstruction }]
      },
      {
        role: "user",
        parts: [{ text: message }]
      }
    ];
    
    // If this is a reply, add context from the replied message
    if (update.message.reply_to_message) {
      const repliedText = update.message.reply_to_message.text || '';
      const repliedFrom = update.message.reply_to_message.from.is_bot ? 'AI' : 'User';
      
      // Insert the context between system instruction and current message
      contents = [
        contents[0], // System instruction
        {
          role: repliedFrom === 'User' ? "user" : "model",
          parts: [{ text: repliedText }]
        },
        contents[1] // Current user message
      ];
    }
    
    // Prepare the request body for Gemini API
    const requestBody = {
      contents: contents,
      generationConfig: {
        temperature: 0.7,
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
        return "I apologize, but your message is too long for me to process. Please try breaking it into smaller parts or ask a more concise question."
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
        
        // Process the response to ensure proper HTML formatting
        responseText = processHtmlResponse(responseText)
        
        return responseText
      }
      
      // Handle MAX_TOKENS case with no content
      if (candidate.finishReason === "MAX_TOKENS") {
        console.warn("Response hit token limit but no content was returned")
        return "I apologize, but my response was too long to generate completely. Please try asking a more specific question."
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
      return `Sorry, the request timed out. The AI model is taking too long to respond. Please try again with a shorter query.`
    }
    
    // Handle token limit errors
    if (error.message.includes("tokens") && error.message.includes("exceed")) {
      return "I apologize, but your message is too long for me to process. Please try breaking it into smaller parts or ask a more concise question."
    }
    
    return `Sorry, I encountered an error while processing your request: ${error.message}`
  }
}

// Process HTML response to ensure proper formatting for Telegram
function processHtmlResponse(text) {
  // First, escape all HTML special characters
  let processed = escapeHtml(text);
  
  // Then unescape only the allowed tags
  const allowedTags = [
    ['<b>', '&lt;b&gt;'],
    ['</b>', '&lt;/b&gt;'],
    ['<i>', '&lt;i&gt;'],
    ['</i>', '&lt;/i&gt;'],
    ['<u>', '&lt;u&gt;'],
    ['</u>', '&lt;/u&gt;'],
    ['<s>', '&lt;s&gt;'],
    ['</s>', '&lt;/s&gt;'],
    ['<code>', '&lt;code&gt;'],
    ['</code>', '&lt;/code&gt;'],
    ['<pre>', '&lt;pre&gt;'],
    ['</pre>', '&lt;/pre&gt;'],
  ];
  
  // Replace each allowed tag
  for (const [tag, escapedTag] of allowedTags) {
    processed = processed.replace(new RegExp(escapedTag, 'g'), tag);
  }
  
  // Handle <code> with class attribute for language specification
  processed = processed.replace(/&lt;code class="language-([^"]+)"&gt;/g, '<code class="language-$1">');
  
  // Fix HTML tag mismatches
  processed = fixHtmlTags(processed);
  
  return processed;
}

// Fix HTML tag mismatches and ensure proper nesting
function fixHtmlTags(html) {
  let fixed = html;
  
  // 1. Fix <pre> tags that aren't followed by <code>
  fixed = fixed.replace(/<pre>(?!<code>)/g, '<pre><code>');
  
  // 2. Fix </pre> tags that aren't preceded by </code>
  fixed = fixed.replace(/(?<!<\/code>)<\/pre>/g, '</code></pre>');
  
  // 3. Fix <pre><code> without proper closing
  fixed = fixed.replace(/<pre><code>(.*?)<\/pre>/g, '<pre><code>$1</code></pre>');
  
  // 4. Fix <code> tags that are closed with </code></pre> but not inside <pre>
  fixed = fixed.replace(/<code>(.*?)<\/code><\/pre>/g, (match, content) => {
    // Check if there's an opening <pre> before this
    const preIndex = fixed.lastIndexOf('<pre>', fixed.indexOf(match));
    if (preIndex === -1) {
      return `<code>${content}</code>`;
    }
    return match;
  });
  
  // 5. Fix unmatched <code> tags
  const codeOpenCount = (fixed.match(/<code>(?!.*<\/pre>)/g) || []).length;
  const codeCloseCount = (fixed.match(/<\/code>(?!.*<\/pre>)/g) || []).length;
  
  if (codeOpenCount > codeCloseCount) {
    // Add missing closing tags
    for (let i = 0; i < codeOpenCount - codeCloseCount; i++) {
      fixed += '</code>';
    }
  }
  
  // 6. Fix unmatched <pre> tags
  const preOpenCount = (fixed.match(/<pre>/g) || []).length;
  const preCloseCount = (fixed.match(/<\/pre>/g) || []).length;
  
  if (preOpenCount > preCloseCount) {
    // Add missing closing tags
    for (let i = 0; i < preOpenCount - preCloseCount; i++) {
      fixed += '</code></pre>';
    }
  }
  
  return fixed;
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
  
  // Try sending with HTML formatting first
  try {
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
    
    if (response.ok) {
      console.log('Message sent successfully with HTML')
      return
    }
    
    // If HTML fails, try without formatting
    const errorText = await response.text()
    console.error('Error sending message with HTML:', errorText)
    console.log('Trying without HTML formatting...')
    
    const plainResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        disable_web_page_preview: true
      })
    })
    
    if (!plainResponse.ok) {
      console.error('Error sending message without HTML:', await plainResponse.text())
    } else {
      console.log('Message sent successfully without HTML')
    }
  } catch (error) {
    console.error('Error in sendSingleMessage:', error)
  }
}

async function sendTemporaryMessage(chatId, text) {
  try {
    const token = TELEGRAM_BOT_TOKEN
    
    // Try sending with HTML formatting first
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      })
    })
    
    if (response.ok) {
      return await response.json()
    }
    
    // If HTML fails, try without formatting
    const errorText = await response.text()
    console.error('Error sending temporary message with HTML:', errorText)
    console.log('Trying without HTML formatting...')
    
    const plainResponse = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text
      })
    })
    
    if (!plainResponse.ok) {
      console.error('Error sending temporary message without HTML:', await plainResponse.text())
      return null
    }
    
    return await plainResponse.json()
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
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// Message reaction functions
async function addMessageReaction(chatId, messageId, emoji) {
  try {
    const token = TELEGRAM_BOT_TOKEN
    await fetch(`https://api.telegram.org/bot${token}/setMessageReaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reaction: [{ type: 'emoji', emoji: emoji }]
      })
    })
  } catch (error) {
    console.error('Error adding message reaction:', error)
  }
}

async function removeMessageReaction(chatId, messageId, emoji) {
  try {
    const token = TELEGRAM_BOT_TOKEN
    await fetch(`https://api.telegram.org/bot${token}/setMessageReaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        reaction: [] // Empty array removes all reactions
      })
    })
  } catch (error) {
    console.error('Error removing message reaction:', error)
  }
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
