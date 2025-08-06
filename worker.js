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
        `/status - Check service status`
      )
      return
    }
    
    // Handle /status command
    if (text === '/status') {
      console.log('Handling /status command')
      const status = await checkServiceStatus()
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
    
    const fullUrl = linkMatch[0]
    const password = text.replace(linkMatch[0], '').trim()
    
    console.log(`Processing Terabox link: ${fullUrl}, password: ${password || 'none'}`)
    
    // Send initial message to show we're working
    await sendMessage(chatId, "⏳ Processing your request, please wait...")
    
    // Process the Terabox link
    await processTeraboxLink(chatId, fullUrl, password)
  } catch (error) {
    console.error('Error processing update:', error)
  }
}

async function checkServiceStatus() {
  try {
    const response = await fetch('https://teraboxdl.site/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
      }
    })
    
    if (response.ok) {
      const html = await response.text()
      if (html.includes('Paste your Terabox URL here')) {
        return `✅ Service Status: <b>Online</b>\nResponse time: ${response.headers.get('x-response-time') || 'N/A'}ms`
      } else {
        return `⚠️ Service Status: <b>Unstable</b>\nPage content changed`
      }
    } else {
      return `❌ Service Status: <b>Offline</b>\nError: ${response.status} ${response.statusText}`
    }
  } catch (error) {
    return `❌ Service Status: <b>Error</b>\n${error.message}`
  }
}

async function processTeraboxLink(chatId, teraboxUrl, password) {
  try {
    console.log('Processing Terabox link with teraboxdl.site...')
    
    // Step 1: Get initial page to establish session
    const initialResponse = await fetch('https://teraboxdl.site/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    })
    
    if (!initialResponse.ok) {
      throw new Error(`Failed to access teraboxdl.site: ${initialResponse.status}`)
    }
    
    // Get cookies from initial response
    const cookies = initialResponse.headers.get('set-cookie') || ''
    console.log('Initial cookies:', cookies)
    
    // Step 2: Submit the form with the Terabox URL
    const formData = new FormData()
    formData.append('url', teraboxUrl)
    if (password) {
      formData.append('password', password)
    }
    
    const submitResponse = await fetch('https://teraboxdl.site/', {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Cookie': cookies,
        'Referer': 'https://teraboxdl.site/',
        'Upgrade-Insecure-Requests': '1',
      },
      body: formData
    })
    
    if (!submitResponse.ok) {
      throw new Error(`Form submission failed: ${submitResponse.status}`)
    }
    
    const html = await submitResponse.text()
    console.log('Response HTML length:', html.length)
    
    // Step 3: Parse the response to extract download links
    const downloadLinks = extractDownloadLinks(html)
    
    if (downloadLinks.length === 0) {
      // Try alternative parsing method
      const altLinks = extractAlternativeDownloadLinks(html)
      if (altLinks.length > 0) {
        downloadLinks.push(...altLinks)
      }
    }
    
    if (downloadLinks.length === 0) {
      console.log('No download links found in response')
      await sendMessage(chatId, "❌ No download links found. The link might be invalid or expired.")
      return
    }
    
    console.log(`Found ${downloadLinks.length} download links`)
    
    // Format response
    let response = `✅ Found ${downloadLinks.length} file(s):\n\n`
    downloadLinks.forEach((file, i) => {
      response += `<b>File ${i+1}:</b> ${escapeHtml(file.name)}\n`
      response += `<b>Size:</b> ${file.size}\n`
      response += `<a href="${file.url}">Download</a>\n\n`
    })
    
    console.log('Sending response to user')
    await sendMessage(chatId, response)
    
  } catch (error) {
    console.error('Error processing Terabox link:', error)
    await sendMessage(chatId, `❌ Error: ${error.message}`)
  }
}

function extractDownloadLinks(html) {
  const links = []
  
  // Method 1: Look for download buttons with direct links
  const buttonRegex = /<button[^>]*onclick="window\.open\('([^']+)'[^>]*>[\s\S]*?Download[\s\S]*?<\/button>/gi
  let match
  while ((match = buttonRegex.exec(html)) !== null) {
    links.push({
      name: `File ${links.length + 1}`,
      size: 'Unknown',
      url: match[1]
    })
  }
  
  // Method 2: Look for direct download links
  const linkRegex = /<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?Download[\s\S]*?<\/a>/gi
  while ((match = linkRegex.exec(html)) !== null) {
    if (!match[1].includes('javascript:') && !match[1].includes('#')) {
      links.push({
        name: `File ${links.length + 1}`,
        size: 'Unknown',
        url: match[1]
      })
    }
  }
  
  // Method 3: Look for download URLs in JavaScript
  const jsRegex = /downloadUrl\s*=\s*['"]([^'"]+)['"]/gi
  while ((match = jsRegex.exec(html)) !== null) {
    links.push({
      name: `File ${links.length + 1}`,
      size: 'Unknown',
      url: match[1]
    })
  }
  
  return links
}

function extractAlternativeDownloadLinks(html) {
  const links = []
  
  // Look for any URL that might be a download link
  const urlRegex = /https?:\/\/[^"\s]+/gi
  const urls = html.match(urlRegex) || []
  
  // Filter for likely download URLs
  urls.forEach(url => {
    if (url.includes('download') || 
        url.includes('terabox') || 
        url.includes('1024terabox') ||
        url.includes('file') ||
        url.match(/\.(mp4|mkv|avi|mp3|zip|rar|pdf|jpg|png|exe)$/i)) {
      links.push({
        name: `File ${links.length + 1}`,
        size: 'Unknown',
        url: url
      })
    }
  })
  
  return links
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
