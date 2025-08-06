addEventListener('fetch', event => {
  event.respondWith(handleRequest(event))
})

async function handleRequest(event) {
  const request = event.request
  
  // Handle GET requests (for webhook verification)
  if (request.method === 'GET') {
    return new Response('Terabox Bot is running!')
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
    console.log('Processing update:', JSON.stringify(update))
    
    if (!update.message) {
      console.log('No message in update')
      return
    }
    
    const chatId = update.message.chat.id
    const text = update.message.text
    
    console.log(`Message from ${chatId}: ${text}`)
    
    // Handle /start command
    if (text === '/start') {
      console.log('Handling /start command')
      await sendMessage(chatId, 
        `📦 <b>Terabox Link Bot</b>\n\n` +
        `Send me a Terabox share link to get direct download links.\n\n` +
        `Supported domains:\n` +
        `• terabox.com\n` +
        `• 1024terabox.com\n` +
        `• www.terabox.com\n\n` +
        `Example:\n` +
        `https://terabox.com/s/xxxxx\n\n` +
        `For password-protected files:\n` +
        `https://terabox.com/s/xxxxx your_password\n\n` +
        `Commands:\n` +
        `/status - Check API status`
      )
      return
    }
    
    // Handle /status command
    if (text === '/status') {
      console.log('Handling /status command')
      const status = await checkApiStatus()
      await sendMessage(chatId, status)
      return
    }
    
    // Extract Terabox link
    const linkMatch = text.match(/https:\/\/(?:www\.)?(?:terabox|1024terabox)\.com\/s\/([^\s]+)/)
    if (!linkMatch) {
      console.log('No Terabox link found in message')
      await sendMessage(chatId, 
        `❌ Please send a valid Terabox share link\n\n` +
        `Supported domains:\n` +
        `• terabox.com\n` +
        `• 1024terabox.com\n` +
        `• www.terabox.com`
      )
      return
    }
    
    const shorturl = linkMatch[1]
    const password = text.replace(linkMatch[0], '').trim()
    
    console.log(`Processing Terabox link: ${shorturl}, password: ${password || 'none'}`)
    
    // Send initial message to show we're working
    await sendMessage(chatId, "⏳ Processing your request, please wait...")
    
    // Process the Terabox link
    await processTeraboxLink(chatId, shorturl, password)
  } catch (error) {
    console.error('Error processing update:', error)
  }
}

async function checkApiStatus() {
  try {
    const response = await fetch('https://terabox.hnn.workers.dev/api/get-info?shorturl=test&pwd=', {
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Host': 'terabox.hnn.workers.dev',
        'Origin': 'https://terabox.hnn.workers.dev',
        'Referer': 'https://terabox.hnn.workers.dev/',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
      }
    })
    
    if (response.ok) {
      return `✅ API Status: <b>Online</b>\nResponse time: ${response.headers.get('x-response-time') || 'N/A'}ms`
    } else {
      return `❌ API Status: <b>Offline</b>\nError: ${response.status} ${response.statusText}`
    }
  } catch (error) {
    return `❌ API Status: <b>Error</b>\n${error.message}`
  }
}

async function processTeraboxLink(chatId, shorturl, password) {
  try {
    console.log('Getting file info...')
    console.log(`API URL: https://terabox.hnn.workers.dev/api/get-info?shorturl=${shorturl}&pwd=${encodeURIComponent(password)}`)
    
    // Enhanced headers to mimic a real browser
    const headers = {
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Host': 'terabox.hnn.workers.dev',
      'Origin': 'https://terabox.hnn.workers.dev',
      'Referer': 'https://terabox.hnn.workers.dev/',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
    }
    
    // Get file info with timeout and retry
    let infoResponse
    let retryCount = 0
    const maxRetries = 3
    
    while (retryCount < maxRetries) {
      try {
        infoResponse = await fetchWithTimeout(
          `https://terabox.hnn.workers.dev/api/get-info?shorturl=${shorturl}&pwd=${encodeURIComponent(password)}`,
          {
            headers: headers
          },
          15000 // 15 seconds timeout
        )
        break
      } catch (error) {
        retryCount++
        console.error(`Attempt ${retryCount} failed:`, error)
        if (retryCount >= maxRetries) throw error
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount))
      }
    }
    
    console.log(`Info response status: ${infoResponse.status}`)
    
    if (!infoResponse.ok) {
      const errorText = await infoResponse.text()
      console.error(`HTTP error: ${infoResponse.status}, Response: ${errorText}`)
      
      if (infoResponse.status === 403) {
        await sendMessage(chatId, "❌ Access denied. The Terabox API might be temporarily blocked or rate limited. Please try again later.")
      } else if (infoResponse.status === 404) {
        await sendMessage(chatId, "❌ Link not found. The Terabox link might be expired or invalid.")
      } else {
        await sendMessage(chatId, `❌ Error: HTTP ${infoResponse.status}`)
      }
      return
    }
    
    const infoData = await infoResponse.json()
    console.log('File info received:', JSON.stringify(infoData))
    
    if (!infoData.ok) {
      console.error('API returned ok: false')
      await sendMessage(chatId, "❌ Invalid link or password")
      return
    }
    
    if (!infoData.list || infoData.list.length === 0) {
      console.error('No files found in the response')
      await sendMessage(chatId, "❌ No files found in this share")
      return
    }
    
    // Get download links in parallel
    console.log('Getting download links...')
    const downloadPromises = infoData.list.map(async (file) => {
      try {
        console.log(`Processing file: ${file.filename}`)
        
        const dlResponse = await fetchWithTimeout(
          'https://terabox.hnn.workers.dev/api/get-download',
          {
            method: 'POST',
            headers: {
              ...headers,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              shareid: infoData.shareid,
              uk: infoData.uk,
              sign: infoData.sign,
              timestamp: infoData.timestamp,
              fs_id: file.fs_id
            })
          },
          15000 // 15 seconds timeout
        )
        
        console.log(`Download response status for ${file.filename}: ${dlResponse.status}`)
        
        if (!dlResponse.ok) {
          const errorText = await dlResponse.text()
          console.error(`Download HTTP error for ${file.filename}: ${dlResponse.status}, Response: ${errorText}`)
          return null
        }
        
        const dlData = await dlResponse.json()
        console.log(`Download data for ${file.filename}:`, JSON.stringify(dlData))
        
        if (dlData.downloadLink) {
          return {
            name: file.filename,
            size: (file.size / (1024 * 1024)).toFixed(2),
            url: dlData.downloadLink
          }
        }
      } catch (error) {
        console.error(`Error getting download link for file:`, error)
        return null
      }
    })
    
    // Wait for all download links to be processed
    const downloadResults = await Promise.all(downloadPromises)
    const links = downloadResults.filter(link => link !== null)
    
    console.log(`Found ${links.length} download links`)
    
    if (links.length === 0) {
      await sendMessage(chatId, "❌ No download links found")
      return
    }
    
    // Format response
    let response = `✅ Found ${links.length} file(s):\n\n`
    links.forEach((file, i) => {
      response += `<b>File ${i+1}:</b> ${escapeHtml(file.name)}\n`
      response += `<b>Size:</b> ${file.size} MB\n`
      response += `<a href="${file.url}">Download</a>\n\n`
    })
    
    console.log('Sending response to user')
    await sendMessage(chatId, response)
  } catch (error) {
    console.error('Error processing Terabox link:', error)
    await sendMessage(chatId, `❌ Error: ${error.message}`)
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

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
