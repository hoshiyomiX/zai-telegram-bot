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
    
    if (!response.ok) {
      return `❌ Service Status: <b>Offline</b>\nError: ${response.status} ${response.statusText}`
    }
    
    const html = await response.text()
    console.log('Status check HTML length:', html.length)
    
    // Check for multiple indicators that the service is working
    const indicators = [
      'Paste your Terabox URL here',  // Original indicator
      'terabox',                      // General terabox reference
      'download',                     // Download functionality
      'url',                          // URL input field
      'submit',                       // Submit button
      'form',                         // Form element
      'input',                        // Input fields
      'button',                       // Buttons
    ]
    
    let foundIndicators = 0
    const foundList = []
    indicators.forEach(indicator => {
      if (html.toLowerCase().includes(indicator.toLowerCase())) {
        foundIndicators++
        foundList.push(indicator)
      }
    })
    
    // Check if we found enough indicators
    if (foundIndicators >= 4) {
      return `✅ Service Status: <b>Online</b>\nFound ${foundIndicators}/${indicators.length} indicators\nResponse time: ${response.headers.get('x-response-time') || 'N/A'}ms\n\nFound: ${foundList.join(', ')}`
    } else if (foundIndicators >= 2) {
      return `⚠️ Service Status: <b>Partially Working</b>\nFound ${foundIndicators}/${indicators.length} indicators\nPage structure may have changed\n\nFound: ${foundList.join(', ')}`
    } else {
      return `❌ Service Status: <b>Offline</b>\nFound ${foundIndicators}/${indicators.length} indicators\nPage may be completely different`
    }
    
  } catch (error) {
    return `❌ Service Status: <b>Error</b>\n${error.message}`
  }
}

async function processTeraboxLink(chatId, teraboxUrl, password) {
  try {
    console.log('Processing Terabox link with teraboxdl.site...')
    
    // Try the direct URL method first (alternative to form submission)
    console.log('Trying direct URL method...')
    const directResult = await tryDirectUrlMethod(teraboxUrl, password)
    if (directResult.success) {
      console.log('Direct URL method succeeded')
      await sendDownloadLinks(chatId, directResult.links)
      return
    }
    console.log('Direct URL method failed:', directResult.error)
    
    // If direct method fails, try form submission
    console.log('Trying form submission method...')
    const formResult = await tryFormSubmissionMethod(teraboxUrl, password)
    if (formResult.success) {
      console.log('Form submission method succeeded')
      await sendDownloadLinks(chatId, formResult.links)
      return
    }
    console.log('Form submission method failed:', formResult.error)
    
    // If both methods fail
    await sendMessage(chatId, `❌ Failed to process link. Both methods failed:\n\nDirect URL: ${directResult.error}\nForm submission: ${formResult.error}`)
    
  } catch (error) {
    console.error('Error processing Terabox link:', error)
    await sendMessage(chatId, `❌ Error: ${error.message}`)
  }
}

async function tryDirectUrlMethod(teraboxUrl, password) {
  try {
    // Try accessing the download page with URL as query parameter
    const url = new URL('https://teraboxdl.site/')
    url.searchParams.append('url', teraboxUrl)
    if (password) {
      url.searchParams.append('password', password)
    }
    
    console.log('Direct URL method - Requesting:', url.toString())
    
    const response = await fetchWithTimeout(url.toString(), {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    }, 15000)
    
    console.log('Direct URL method - Response status:', response.status)
    
    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status} ${response.statusText}` }
    }
    
    const html = await response.text()
    console.log('Direct URL method - Response length:', html.length)
    
    const links = extractDownloadLinks(html)
    if (links.length > 0) {
      return { success: true, links: links }
    } else {
      return { success: false, error: 'No download links found' }
    }
    
  } catch (error) {
    console.error('Direct URL method error:', error)
    return { success: false, error: error.message }
  }
}

async function tryFormSubmissionMethod(teraboxUrl, password) {
  try {
    // Step 1: Get initial page to find form endpoint
    console.log('Form method - Getting initial page...')
    const initialResponse = await fetchWithTimeout('https://teraboxdl.site/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      }
    }, 10000)
    
    if (!initialResponse.ok) {
      return { success: false, error: `Failed to access teraboxdl.site: ${initialResponse.status}` }
    }
    
    const html = await initialResponse.text()
    console.log('Form method - Initial page loaded, length:', html.length)
    
    // Extract form action URL
    const formActionMatch = html.match(/<form[^>]*action="([^"]*)"[^>]*>/i)
    let formUrl = 'https://teraboxdl.site/'
    if (formActionMatch && formActionMatch[1]) {
      formUrl = formActionMatch[1].startsWith('http') ? formActionMatch[1] : `https://teraboxdl.site${formActionMatch[1]}`
    }
    console.log('Form method - Form action URL:', formUrl)
    
    // Extract CSRF token if present
    let csrfToken = ''
    const csrfMatch = html.match(/<input[^>]*name="csrf_token"[^>]*value="([^"]*)"[^>]*>/i)
    if (csrfMatch && csrfMatch[1]) {
      csrfToken = csrfMatch[1]
      console.log('Form method - CSRF token found:', csrfToken)
    }
    
    // Get cookies from initial response
    const cookies = initialResponse.headers.get('set-cookie') || ''
    console.log('Form method - Initial cookies:', cookies)
    
    // Step 2: Submit the form with the Terabox URL
    const formData = new URLSearchParams()
    formData.append('url', teraboxUrl)
    if (password) {
      formData.append('password', password)
    }
    if (csrfToken) {
      formData.append('csrf_token', csrfToken)
    }
    
    console.log('Form method - Submitting form to:', formUrl)
    const submitResponse = await fetchWithTimeout(formUrl, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Connection': 'keep-alive',
        'Cookie': cookies,
        'Referer': 'https://teraboxdl.site/',
        'Upgrade-Insecure-Requests': '1',
      },
      body: formData.toString()
    }, 15000)
    
    console.log('Form method - Submit response status:', submitResponse.status)
    
    if (!submitResponse.ok) {
      return { success: false, error: `Form submission failed: ${submitResponse.status} ${submitResponse.statusText}` }
    }
    
    const responseHtml = await submitResponse.text()
    console.log('Form method - Response length:', responseHtml.length)
    
    // Step 3: Parse the response to extract download links
    const downloadLinks = extractDownloadLinks(responseHtml)
    if (downloadLinks.length > 0) {
      return { success: true, links: downloadLinks }
    } else {
      return { success: false, error: 'No download links found in form response' }
    }
    
  } catch (error) {
    console.error('Form method error:', error)
    return { success: false, error: error.message }
  }
}

async function sendDownloadLinks(chatId, links) {
  console.log(`Sending ${links.length} download links to user`)
  
  // Format response
  let response = `✅ Found ${links.length} file(s):\n\n`
  links.forEach((file, i) => {
    response += `<b>File ${i+1}:</b> ${escapeHtml(file.name)}\n`
    response += `<b>Size:</b> ${file.size}\n`
    response += `<a href="${file.url}">Download</a>\n\n`
  })
  
  await sendMessage(chatId, response)
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
  
  // Method 4: Look for any URL that might be a download link
  const urlRegex = /https?:\/\/[^"\s]+/gi
  const urls = html.match(urlRegex) || []
  
  urls.forEach(url => {
    if (url.includes('download') || 
        url.includes('terabox') || 
        url.includes('1024terabox') ||
        url.includes('file') ||
        url.match(/\.(mp4|mkv|avi|mp3|zip|rar|pdf|jpg|png|exe)$/i)) {
      // Check if this URL is already in our links
      if (!links.some(link => link.url === url)) {
        links.push({
          name: `File ${links.length + 1}`,
          size: 'Unknown',
          url: url
        })
      }
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
