addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  if (request.method === 'POST') {
    const update = await request.json()
    await handleUpdate(update)
    return new Response('OK')
  }
  return new Response('Terabox Bot is running!')
}

async function handleUpdate(update) {
  if (!update.message) return
  
  const chatId = update.message.chat.id
  const text = update.message.text
  
  // Handle commands
  if (text === '/start') {
    return sendMessage(chatId, 
      `📦 *Terabox Link Bot*\\n\\n` +
      `Send me a Terabox share link to get direct download links\\.\\n\\n` +
      `Example:\\n` +
      `https://terabox\\.com/s/xxxxx\\n\\n` +
      `For password\\-protected files:\\n` +
      `https://terabox\\.com/s/xxxxx your_password`
    )
  }
  
  // Extract Terabox link
  const linkMatch = text.match(/https:\/\/terabox\.com\/s\/([^\s]+)/)
  if (!linkMatch) {
    return sendMessage(chatId, "❌ Please send a valid Terabox share link")
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
    
    const infoData = await infoResponse.json()
    
    if (!infoData.ok) {
      return sendMessage(chatId, "❌ Invalid link or password")
    }
    
    // Get download links
    const links = []
    for (const file of infoData.list) {
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
      
      const dlData = await dlResponse.json()
      if (dlData.downloadLink) {
        links.push({
          name: file.filename,
          size: (file.size / (1024 * 1024)).toFixed(2),
          url: dlData.downloadLink
        })
      }
    }
    
    if (links.length === 0) {
      return sendMessage(chatId, "❌ No download links found")
    }
    
    // Format response
    let response = `✅ Found ${links.length} file(s):\\n\\n`
    links.forEach((file, i) => {
      response += `*File ${i+1}:* ${escapeMarkdown(file.name)}\\n`
      response += `*Size:* ${file.size} MB\\n`
      response += `[Download](${file.url})\\n\\n`
    })
    
    sendMessage(chatId, response)
  } catch (error) {
    console.error(error)
    sendMessage(chatId, "❌ Error processing your request")
  }
}

async function sendMessage(chatId, text) {
  const token = TELEGRAM_BOT_TOKEN // Set this in worker env variables
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'MarkdownV2',
      disable_web_page_preview: true
    })
  })
}

function escapeMarkdown(text) {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&')
                }
