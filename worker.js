addEventListener('fetch', event => {
  event.respondWith(handleRequest(event))
})

async function handleRequest(event) {
  const request = event.request
  
  if (request.method === 'GET') {
    return new Response('Terabox Bot is running!')
  }
  
  if (request.method === 'POST') {
    try {
      const requestClone = request.clone()
      const update = await requestClone.json()
      const response = new Response('OK')
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
    if (!update.message) return
    
    const chatId = update.message.chat.id
    const text = update.message.text || ''
    
    console.log(`Message from ${chatId}: ${text}`)
    
    if (text === '/start') {
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
        `https://terabox.com/s/xxxxx your_password`
      )
      return
    }
    
    const linkMatch = text.match(/https:\/\/(?:www\.)?(?:terabox|1024terabox)\.com\/s\/([^\s]+)/)
    if (!linkMatch) {
      await sendMessage(chatId, "❌ Please send a valid Terabox share link")
      return
    }
    
    const shorturl = linkMatch[1]
    const password = text.replace(linkMatch[0], '').trim()
    
    console.log(`Processing: ${shorturl}, password: ${password || 'none'}`)
    
    await sendMessage(chatId, "⏳ Processing your request, please wait...")
    
    await processTeraboxLink(chatId, shorturl, password)
  } catch (error) {
    console.error('Error processing update:', error)
  }
}

async function processTeraboxLink(chatId, shorturl, password) {
  try {
    console.log('Getting file info from terabox.hnn.workers.dev...')
    
    // Step 1: Get file info
    const infoResponse = await fetchWithTimeout(
      `https://terabox.hnn.workers.dev/api/get-info?shorturl=${shorturl}&pwd=${encodeURIComponent(password)}`,
      {
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
      },
      15000
    )
    
    if (!infoResponse.ok) {
      throw new Error(`HTTP error: ${infoResponse.status} ${infoResponse.statusText}`)
    }
    
    const infoData = await infoResponse.json()
    console.log('File info received:', JSON.stringify(infoData))
    
    if (!infoData.ok) {
      await sendMessage(chatId, "❌ Invalid link or password")
      return
    }
    
    if (!infoData.list || infoData.list.length === 0) {
      await sendMessage(chatId, "❌ No files found in this share")
      return
    }
    
    // Step 2: Get download links for each file
    console.log('Getting download links...')
    const downloadPromises = infoData.list.map(async (file) => {
      try {
        const dlResponse = await fetchWithTimeout(
          'https://terabox.hnn.workers.dev/api/get-download',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Origin': 'https://terabox.hnn.workers.dev',
              'Accept': 'application/json, text/plain, */*',
              'Accept-Language': 'en-US,en;q=0.9',
              'Accept-Encoding': 'gzip, deflate, br',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
              'Host': 'terabox.hnn.workers.dev',
              'Referer': 'https://terabox.hnn.workers.dev/',
              'Sec-Fetch-Dest': 'empty',
              'Sec-Fetch-Mode': 'cors',
              'Sec-Fetch-Site': 'same-origin',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
            },
            body: JSON.stringify({
              shareid: infoData.shareid,
              uk: infoData.uk,
              sign: infoData.sign,
              timestamp: infoData.timestamp,
              fs_id: file.fs_id
            })
          },
          15000
        )
        
        if (!dlResponse.ok) {
          throw new Error(`HTTP error: ${dlResponse.status} ${dlResponse.statusText}`)
        }
        
        const dlData = await dlResponse.json()
        console.log(`Download data for ${file.filename}:`, JSON.stringify(dlData))
        
        if (dlData.downloadLink) {
          // Generate random URL for the download link (similar to the JavaScript code)
          const randomUrl = generateRandomUrl(dlData.downloadLink)
          
          return {
            name: file.filename,
            size: formatStorageSize(file.size),
            url: randomUrl
          }
        }
      } catch (error) {
        console.error(`Error getting download link for ${file.filename}:`, error)
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
    let response = `✅ Found ${links.length} file(s):\n\n`
    links.forEach((file, i) => {
      response += `<b>File ${i+1}:</b> ${escapeHtml(file.name)}\n`
      response += `<b>Size:</b> ${file.size}\n`
      response += `<a href="${file.url}">Download</a>\n\n`
    })
    
    await sendMessage(chatId, response)
    
  } catch (error) {
    console.error('Error processing Terabox link:', error)
    await sendMessage(chatId, `❌ Error: ${error.message}`)
  }
}

// Format storage size (copied from JavaScript)
function formatStorageSize(bytes) {
  const KB = 1024
  const MB = KB * 1024
  const GB = MB * 1024
  if (bytes >= GB) {
    const gigabytes = bytes / GB
    return gigabytes.toFixed(2) + "GB"
  } else if (bytes >= MB) {
    const megabytes = bytes / MB
    return megabytes.toFixed(2) + "MB"
  } else if (bytes >= KB) {
    const kilobytes = bytes / KB
    return kilobytes.toFixed(2) + "KB"
  } else {
    return bytes.toFixed(2) + "bytes"
  }
}

// Encode URL (copied from JavaScript)
function encodeUrl(rawUrl) {
  const uriEncoded = encodeURIComponent(rawUrl);
  return btoa(uriEncoded);
}

// Generate random URL (based on JavaScript)
function generateRandomUrl(downloadLink) {
  const baseUrls = [
    'plain-grass-58b2.comprehensiveaquamarine',
    'royal-block-6609.ninnetta7875',
    'bold-hall-f23e.7rochelle',
    'winter-thunder-0360.belitawhite',
    'fragrant-term-0df9.elviraeducational',
    'purple-glitter-924b.miguelalocal'
  ];
  const selectedBaseUrl = baseUrls[Math.floor(Math.random() * baseUrls.length)];
  return `https://${selectedBaseUrl}.workers.dev/?url=${encodeUrl(downloadLink)}`;
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
