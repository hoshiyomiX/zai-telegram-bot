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
    // Try the primary method first
    const primaryResult = await tryPrimaryMethod(chatId, shorturl, password)
    if (primaryResult.success) {
      return
    }
    
    console.log('Primary method failed, trying fallback...')
    
    // Try the fallback method
    const fallbackResult = await tryFallbackMethod(chatId, shorturl, password)
    if (fallbackResult.success) {
      return
    }
    
    // If both methods fail
    await sendMessage(chatId, 
      `❌ Failed to process your link.\n\n` +
      `Primary method: ${primaryResult.error}\n` +
      `Fallback method: ${fallbackResult.error}`
    )
    
  } catch (error) {
    console.error('Error processing Terabox link:', error)
    await sendMessage(chatId, `❌ Error: ${error.message}`)
  }
}

async function tryPrimaryMethod(chatId, shorturl, password) {
  try {
    console.log('Trying primary method with terabox.hnn.workers.dev...')
    
    // Step 1: Get file info with retry logic
    let infoData = null
    let retryCount = 0
    const maxRetries = 3
    
    while (retryCount < maxRetries) {
      try {
        const infoResponse = await fetchWithTimeout(
          `https://terabox.hnn.workers.dev/api/get-info?shorturl=${shorturl}&pwd=${encodeURIComponent(password)}`,
          {
            headers: getEnhancedHeaders()
          },
          15000
        )
        
        if (!infoResponse.ok) {
          throw new Error(`HTTP error: ${infoResponse.status} ${infoResponse.statusText}`)
        }
        
        infoData = await infoResponse.json()
        break
        
      } catch (error) {
        retryCount++
        console.error(`Attempt ${retryCount} failed:`, error)
        
        if (retryCount >= maxRetries) {
          throw error
        }
        
        // Exponential backoff
        const delay = Math.pow(2, retryCount) * 1000
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
    
    if (!infoData.ok) {
      return { success: false, error: "Invalid link or password" }
    }
    
    if (!infoData.list || infoData.list.length === 0) {
      return { success: false, error: "No files found in this share" }
    }
    
    // Step 2: Get download links for each file
    const downloadPromises = infoData.list.map(async (file) => {
      try {
        const dlResponse = await fetchWithTimeout(
          'https://terabox.hnn.workers.dev/api/get-download',
          {
            method: 'POST',
            headers: getEnhancedHeaders(),
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
        
        if (dlData.downloadLink) {
          // Generate random URL for the download link
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
      return { success: false, error: "No download links found" }
    }
    
    // Format response
    let response = `✅ Found ${links.length} file(s):\n\n`
    links.forEach((file, i) => {
      response += `<b>File ${i+1}:</b> ${escapeHtml(file.name)}\n`
      response += `<b>Size:</b> ${file.size}\n`
      response += `<a href="${file.url}">Download</a>\n\n`
    })
    
    await sendMessage(chatId, response)
    return { success: true }
    
  } catch (error) {
    console.error('Primary method error:', error)
    return { success: false, error: error.message }
  }
}

async function tryFallbackMethod(chatId, shorturl, password) {
  try {
    console.log('Trying fallback method...')
    
    // This is a simplified fallback that tries to extract download links directly
    // from the Terabox web interface
    
    // First, try to get the Terabox page
    const teraboxUrl = `https://terabox.com/s/${shorturl}`
    const response = await fetchWithTimeout(teraboxUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    }, 15000)
    
    if (!response.ok) {
      throw new Error(`Failed to access Terabox: ${response.status}`)
    }
    
    const html = await response.text()
    
    // Try to extract download links from the page
    const downloadLinks = extractDownloadLinksFromTeraboxPage(html)
    
    if (downloadLinks.length === 0) {
      return { success: false, error: "No download links found in fallback method" }
    }
    
    // Format response
    let response = `✅ Found ${downloadLinks.length} file(s) (fallback method):\n\n`
    downloadLinks.forEach((file, i) => {
      response += `<b>File ${i+1}:</b> ${escapeHtml(file.name)}\n`
      response += `<b>Size:</b> ${file.size}\n`
      response += `<a href="${file.url}">Download</a>\n\n`
    })
    
    await sendMessage(chatId, response)
    return { success: true }
    
  } catch (error) {
    console.error('Fallback method error:', error)
    return { success: false, error: error.message }
  }
}

function getEnhancedHeaders() {
  return {
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
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
    'DNT': '1',
    'Pragma': 'no-cache',
    'Cache-Control': 'no-cache',
    'sec-ch-ua': '"Chromium";v="132", "Google Chrome";v="132", "Not_A Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"'
  }
}

function extractDownloadLinksFromTeraboxPage(html) {
  const links = []
  
  // Look for download links in the Terabox page
  // This is a simplified extraction and might need adjustment based on the actual page structure
  
  // Pattern 1: Look for direct download links
  const directLinkRegex = /href="([^"]+)"[^>]*>[\s\S]*?Download[\s\S]*?<\/a>/gi
  let match
  while ((match = directLinkRegex.exec(html)) !== null) {
    const url = match[1]
    // Skip if it's not a valid download URL
    if (url.includes('download') || url.includes('terabox') || url.match(/\.(mp4|mkv|avi|mp3|zip|rar|pdf|jpg|png|exe)/i)) {
      const filename = url.split('/').pop() || `File ${links.length + 1}`
      links.push({
        name: filename,
        size: 'Unknown',
        url: url
      })
    }
  }
  
  // Pattern 2: Look for download buttons
  const buttonRegex = /<button[^>]*onclick="window\.open\('([^']+)'\)[^>]*>[\s\S]*?Download[\s\S]*?<\/button>/gi
  while ((match = buttonRegex.exec(html)) !== null) {
    const url = match[1]
    const filename = url.split('/').pop() || `File ${links.length + 1}`
    links.push({
      name: filename,
      size: 'Unknown',
      url: url
    })
  }
  
  return links
}

// Format storage size
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

// Encode URL
function encodeUrl(rawUrl) {
  const uriEncoded = encodeURIComponent(rawUrl);
  return btoa(uriEncoded);
}

// Generate random URL
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
