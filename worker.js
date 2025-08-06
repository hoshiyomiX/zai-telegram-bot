addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  // Handle GET requests (for webhook verification)
  if (request.method === 'GET') {
    return new Response('Terabox Bot is running!')
  }
  
  // Handle POST requests (for Telegram updates)
  if (request.method === 'POST') {
    // Immediately respond to Telegram to avoid timeout
    const response = new Response('OK')
    
    // Process the update in the background
    event.waitUntil(handleUpdate(request))
    
    return response
  }
  
  return new Response('Method not allowed', { status: 405 })
}

async function handleUpdate(request) {
  try {
    const update = await request.json()
    
    if (!update.message) return
    
    const chatId = update.message.chat.id
    const text = update.message.text
    
    // Handle /start command
    if (text === '/start') {
      await sendMessage(chatId, 
        `📦 *Terabox Link Bot*\\n\\n` +
        `Send me a Terabox share link to get direct download links\\.\\n\\n` +
        `Example:\\n` +
        `https://terabox\\.com/s/xxxxx\\n\\n` +
        `For password\\-protected files:\\n` +
        `https://terabox\\.com/s/xxxxx your_password`
      )
      return
    }
    
    // Extract Terabox link
    const linkMatch = text.match(/https:\/\/terabox\.com\/s\/([^\s]+)/)
    if (!linkMatch) {
      await sendMessage(chatId, "❌ Please send a valid Terabox share link")
      return
    }
    
    const shorturl = linkMatch[1]
    const password = text.replace(linkMatch[0], '').trim()
    
    // Send initial message to show we're working
    await sendMessage(chatId, "⏳ Processing your request, please wait...")
    
    // Process the Terabox link
    await processTeraboxLink(chatId, shorturl, password)
  } catch (error) {
    console.error('Error processing update:', error)
  }
}

async function processTeraboxLink(chatId, shorturl, password) {
  try {
    // Get file info with timeout
    const infoResponse = await fetchWithTimeout(
      `https://terabox.hnn.workers.dev/api/get-info?shorturl=${shorturl}&pwd=${encodeURIComponent(password)}`,
      {
        headers: {
          'Referer': 'https://terabox.hnn.workers.dev/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
        }
      },
      10000 // 10 second timeout
    )
    
    if (!infoResponse.ok) {
      throw new Error(`HTTP error! status: ${infoResponse.status}`)
    }
    
    const infoData = await infoResponse.json()
    
    if (!infoData.ok) {
      await sendMessage(chatId, "❌ Invalid link or password")
      return
    }
    
    // Get download links in parallel
    const downloadPromises = infoData.list.map(async (file) => {
      try {
        const dlResponse = await fetchWithTimeout(
          'https://terabox.hnn.workers.dev/api/get-download',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Origin': 'https://terabox.hnn.workers.dev'
            },
            body: JSON.stringify({
              shareid: infoData.shareid,
              uk: infoData.uk,
              sign: infoData.sign,
              timestamp: infoData.timestamp,
              fs_id: file.fs_id
            })
          },
          10000 // 10 second timeout
        )
        
        if (!dlResponse.ok) {
          throw new Error(`HTTP error! status: ${dlResponse.status}`)
        }
        
        const dlData = await dlResponse.json()
        if (dlData.downloadLink) {
          return {
            name: file.filename,
            size: (file.size / (1024 * 1024)).toFixed(2),
            url: dlData.downloadLink
          }
        }
      } catch (error) {
        console.error('Error getting download link:', error)
        return null
      }
    })
    
    // Wait for all download links to be processed
    const downloadResults = await Promise.all(downloadPromises)
    const links = downloadResults.filter(link => link !== null)
    
    if (links.length === 0) {
      await sendMessage(chatId, "❌ No download links found")
      return
    }
    
    // Format response
    let response = `✅ Found ${links.length} file(s):\\n\\n`
    links.forEach((file, i) => {
      response += `*File ${i+1}:* ${escapeMarkdown(file.name)}\\n`
      response += `*Size:* ${file.size} MB\\n`
      response += `[Download](${file.url})\\n\\n`
    })
    
    await sendMessage(chatId, response)
  } catch (error) {
    console.error('Error processing Terabox link:', error)
    await sendMessage(chatId, "❌ Error processing your request. Please try again later.")
  }
}

async function sendMessage(chatId, text) {
  try {
    const token = TELEGRAM_BOT_TOKEN
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true
      })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('Error sending message:', errorText)
    }
  } catch (error) {
    console.error('Error in sendMessage:', error)
  }
}

function escapeMarkdown(text) {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&')
}

// Helper function for fetch with timeout
function fetchWithTimeout(url, options, timeout = 10000) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Request timeout')), timeout)
    )
  ])
}
