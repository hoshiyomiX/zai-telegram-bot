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
    try {
      const update = await request.json()
      await handleUpdate(update)
      return new Response('OK')
    } catch (error) {
      console.error('Error processing update:', error)
      return new Response('Error processing update', { status: 500 })
    }
  }
  
  return new Response('Method not allowed', { status: 405 })
}

async function handleUpdate(update) {
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
  
  try {
    // Get file info
    const infoResponse = await fetch(
      `https://terabox.hnn.workers.dev/api/get-info?shorturl=${shorturl}&pwd=${encodeURIComponent(password)}`,
      {
        headers: {
          'Referer': 'https://terabox.hnn.workers.dev/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
        }
      }
    )
    
    if (!infoResponse.ok) {
      throw new Error(`HTTP error! status: ${infoResponse.status}`)
    }
    
    const infoData = await infoResponse.json()
    
    if (!infoData.ok) {
      await sendMessage(chatId, "❌ Invalid link or password")
      return
    }
    
    // Get download links
    const links = []
    for (const file of infoData.list) {
      try {
        const dlResponse = await fetch('https://terabox.hnn.workers.dev/api/get-download', {
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
        })
        
        if (!dlResponse.ok) {
          throw new Error(`HTTP error! status: ${dlResponse.status}`)
        }
        
        const dlData = await dlResponse.json()
        if (dlData.downloadLink) {
          links.push({
            name: file.filename,
            size: (file.size / (1024 * 1024)).toFixed(2),
            url: dlData.downloadLink
          })
        }
      } catch (error) {
        console.error('Error getting download link:', error)
        continue
      }
    }
    
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
    await sendMessage(chatId, "❌ Error processing your request")
  }
}

async function sendMessage(chatId, text) {
  try {
    const token = TELEGRAM_BOT_TOKEN // Set this in worker env variables
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
