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
          `I'm an AI assistant powered by Google's Gemini 2.5 Flash model. I can help answer questions, explain concepts, write code, and more!\n\n` +
          `📋 <b>Available Commands:</b>\n` +
          `/start - Show this welcome message\n` +
          `/help - Show help information\n` +
          `/reset - Reset conversation context\n\n` +
          `💡 <b>Features:</b>\n` +
          `• Natural language conversations\n` +
          `• Code generation in multiple languages\n` +
          `• Text formatting (bold, italic, etc.)\n` +
          `• Context-aware responses\n\n` +
          `Just send me any message and I'll respond as an AI assistant!`
        )
        return
      }
      
      if (commandText === '/help') {
        await sendMessage(chatId, 
          `📖 <b>Help & Features</b>\n\n` +
          `🤖 <b>About:</b>\n` +
          `I'm powered by Google's Gemini 2.5 Flash model, an advanced AI assistant.\n\n` +
          `📋 <b>Commands:</b>\n` +
          `/start - Show welcome message\n` +
          `/help - Show this help information\n` +
          `/reset - Reset conversation context\n\n` +
          `💡 <b>Features:</b>\n` +
          `• Natural language conversations\n` +
          `• Code generation in multiple languages\n` +
          `• Text formatting (bold, italic, etc.)\n` +
          `• Context-aware responses\n\n` +
          `💬 <b>Formatting Support:</b>\n` +
          `<b>Bold text</b>, <i>italic text</i>, <u>underline</u>, <s>strikethrough</s>\n` +
          `Inline code: <code>console.log()</code>\n` +
          `Multi-line code:\n` +
          `<pre><code class="language-python">def hello():\n    print("Hello World")</code></pre>\n\n` +
          `Just send me any message and I'll respond as an AI assistant!`
        )
        return
      }
      
      if (commandText === '/reset') {
        // Reset conversation context
        await resetConversation(chatId)
        await sendMessage(chatId, 
          `🔄 <b>Conversation Reset</b>\n\n` +
          `I've forgotten our previous conversation. We can start fresh now!`
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
    
    // Check if conversation should be reset
    const shouldReset = await checkResetFlag(chatId)
    if (shouldReset) {
      // Clear the reset flag
      await clearResetFlag(chatId)
    }
    
    // System instruction for HTML formatting
    const systemInstruction = `You are a helpful assistant. Format your response using HTML tags:
- Use <b> for bold text
- Use <i> for italic text
- Use <u> for underline
- Use <s> for strikethrough
- Use <code> for inline code
- For multi-line code blocks, use:
  <pre><code class="language-python"> for Python
  <pre><code class="language-javascript"> for JavaScript
  <pre><code class="language-shell"> for shell commands
  <pre><code class="language-html"> for HTML
  <pre><code class="language-css"> for CSS
  <pre><code class="language-sql"> for SQL
  <pre><code class="language-json"> for JSON
  <pre><code class="language-xml"> for XML
  <pre><code class="language-yaml"> for YAML
  <pre><code class="language-markdown"> for Markdown
- Use <ul> and <li> for bullet point lists
- Use <ol> and <li> for numbered lists

IMPORTANT: Always escape HTML special characters in your response that are not part of formatting tags. For example:
- Use &lt; for < character
- Use &gt; for > character
- Use &amp; for & character
- Only use the allowed HTML tags mentioned above for formatting.

When showing code examples, always use proper code blocks with the appropriate language class. For example:
<pre><code class="language-shell">0 6 * * * /home/user/script.sh >> /dev/null 2>&1</code></pre>`;
    
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
    
    // If this is a reply and conversation is not reset, add context from the replied message
    if (!shouldReset && update.message.reply_to_message) {
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

// Process HTML response to ensure proper formatting
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
    ['<ul>', '&lt;ul&gt;'],
    ['</ul>', '&lt;/ul&gt;'],
    ['<ol>', '&lt;ol&gt;'],
    ['</ol>', '&lt;/ol&gt;'],
    ['<li>', '&lt;li&gt;'],
    ['</li>', '&lt;/li&gt;'],
  ];
  
  // Replace each allowed tag
  for (const [tag, escapedTag] of allowedTags) {
    processed = processed.replace(new RegExp(escapedTag, 'g'), tag);
  }
  
  // Handle <code> with class attribute
  processed = processed.replace(/&lt;code class="language-([^"]+)"&gt;/g, '<code class="language-$1">');
  
  // Fix code blocks - unescape HTML entities inside <code> and <pre> tags
  processed = processed.replace(/<(code|pre)(?:\s+[^>]*)?>(.*?)<\/\1>/gs, (match, tag, content) => {
    // Unescape the content inside code blocks
    let unescapedContent = content
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'");
    
    return `<${tag}>${unescapedContent}</${tag}>`;
  });
  
  // Fix bullet points - convert asterisks to HTML lists
  // This handles simple bullet points at the beginning of lines
  processed = processed.replace(/^(\s*)\*\s+(.+)$/gm, (match, spaces, content) => {
    return `${spaces}<li>${content}</li>`;
  });
  
  // Wrap consecutive <li> elements with <ul>
  processed = processed.replace(/(<li>.*<\/li>\s*)+/gs, (match) => {
    return `<ul>${match}</ul>`;
  });
  
  return processed;
}

// Conversation reset functions
async function resetConversation(chatId) {
  try {
    const key = `reset:${chatId}`
    await BOT_CACHE.put(key, 'true', { expirationTtl: 300 }) // 5 minutes
  } catch (error) {
    console.error('Error setting reset flag:', error)
  }
}

async function checkResetFlag(chatId) {
  try {
    const key = `reset:${chatId}`
    const value = await BOT_CACHE.get(key)
    return value === 'true'
  } catch (error) {
    console.error('Error checking reset flag:', error)
    return false
  }
}

async function clearResetFlag(chatId) {
  try {
    const key = `reset:${chatId}`
    await BOT_CACHE.delete(key)
  } catch (error) {
    console.error('Error clearing reset flag:', error)
  }
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

async function sendTemporaryMessage(chatId, text) {
  try {
    const token = TELEGRAM_BOT_TOKEN
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      })
    })
    
    if (!response.ok) {
      console.error('Error sending temporary message:', await response.text())
      return null
    }
    
    return await response.json()
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
    con
