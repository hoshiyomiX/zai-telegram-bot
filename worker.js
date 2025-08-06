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
    
    // Process the Terabox link using the adapted Playwright logic
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
    
    // Step 1: Navigate to teraboxdl.site (like Playwright's page.goto)
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
      throw new Error(`Failed to access teraboxdl.site: ${initialResponse.status}`)
    }
    
    const html = await initialResponse.text()
    console.log('Initial page loaded, length:', html.length)
    
    // Log a sample of the HTML for debugging
    console.log('HTML sample:', html.substring(0, 1000))
    
    // Get cookies from initial response (like Playwright's context)
    const cookies = initialResponse.headers.get('set-cookie') || ''
    console.log('Initial cookies:', cookies)
    
    // Step 2: Handle cookie popup (like Playwright's acceptBtn.click())
    // Since we can't click, we'll just note that we would handle it
    if (html.includes('Accept All')) {
      console.log('Cookie popup detected, would accept in browser')
    }
    
    // Step 3: Find the form and its action URL with more flexible patterns
    const formInfo = extractFormInfo(html)
    if (!formInfo) {
      throw new Error('Could not find form in the page')
    }
    
    console.log('Form method:', formInfo.method)
    console.log('Form action:', formInfo.action)
    
    // Extract all input fields from the form
    const inputFields = extractInputFields(html)
    console.log('Extracted input fields:', inputFields)
    
    // Override with our URL and password (like Playwright's page.fill)
    inputFields['url'] = teraboxUrl
    if (password) {
      inputFields['password'] = password
    }
    
    console.log('Final form fields:', inputFields)
    
    // Step 4: Submit the form (like Playwright's click on "Fetch Files")
    let submitResponse
    if (formInfo.method.toUpperCase() === 'POST') {
      const formData = new URLSearchParams()
      for (const [key, value] of Object.entries(inputFields)) {
        formData.append(key, value)
      }
      
      console.log('Submitting form via POST to:', formInfo.action)
      console.log('Form data:', formData.toString())
      
      submitResponse = await fetchWithTimeout(formInfo.action, {
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
      }, 20000)
    } else {
      // GET method
      const url = new URL(formInfo.action)
      for (const [key, value] of Object.entries(inputFields)) {
        url.searchParams.append(key, value)
      }
      
      console.log('Submitting form via GET to:', url.toString())
      
      submitResponse = await fetchWithTimeout(url.toString(), {
        method: 'GET',
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
      }, 20000)
    }
    
    console.log('Submit response status:', submitResponse.status)
    
    if (!submitResponse.ok) {
      throw new Error(`Form submission failed: ${submitResponse.status} ${submitResponse.statusText}`)
    }
    
    const responseHtml = await submitResponse.text()
    console.log('Response length:', responseHtml.length)
    
    // Save a sample of the response for debugging
    console.log('Response sample:', responseHtml.substring(0, 500))
    
    // Step 5: Extract download links (like Playwright's waitForSelector and click)
    const downloadLinks = extractDownloadLinksFromResponse(responseHtml)
    
    if (downloadLinks.length > 0) {
      console.log(`Found ${downloadLinks.length} download links`)
      await sendDownloadLinks(chatId, downloadLinks)
    } else {
      console.log('No download links found')
      await sendMessage(chatId, "❌ No download links found. The link might be invalid or expired.")
    }
    
  } catch (error) {
    console.error('Error processing Terabox link:', error)
    await sendMessage(chatId, `❌ Error: ${error.message}`)
  }
}

function extractFormInfo(html) {
  // Try multiple patterns to find the form
  
  // Pattern 1: Standard form with method and action
  let match = html.match(/<form[^>]*method="([^"]*)"[^>]*action="([^"]*)"[^>]*>/i)
  if (match) {
    const method = match[1] || 'GET'
    let action = match[2]
    
    // If action is relative, make it absolute
    if (action && !action.startsWith('http')) {
      action = new URL(action, 'https://teraboxdl.site/').toString()
    }
    
    return { method, action }
  }
  
  // Pattern 2: Form with action only (default method is GET)
  match = html.match(/<form[^>]*action="([^"]*)"[^>]*>/i)
  if (match) {
    let action = match[1]
    
    // If action is relative, make it absolute
    if (action && !action.startsWith('http')) {
      action = new URL(action, 'https://teraboxdl.site/').toString()
    }
    
    return { method: 'GET', action }
  }
  
  // Pattern 3: Form with method only (action is current URL)
  match = html.match(/<form[^>]*method="([^"]*)"[^>]*>/i)
  if (match) {
    return { method: match[1], action: 'https://teraboxdl.site/' }
  }
  
  // Pattern 4: Any form tag (default method GET, action current URL)
  match = html.match(/<form[^>]*>/i)
  if (match) {
    return { method: 'GET', action: 'https://teraboxdl.site/' }
  }
  
  // If no form found, return null
  return null
}

function extractInputFields(html) {
  const fields = {}
  
  // Extract all input fields with name and value
  const inputRegex = /<input[^>]*name="([^"]*)"[^>]*value="([^"]*)"[^>]*>/gi
  let match
  while ((match = inputRegex.exec(html)) !== null) {
    fields[match[1]] = match[2]
  }
  
  // Also look for input fields without value attribute (default to empty string)
  const inputNoValueRegex = /<input[^>]*name="([^"]*)"[^>]*>/gi
  while ((match = inputNoValueRegex.exec(html)) !== null) {
    if (!fields[match[1]]) { // Only add if not already found
      fields[match[1]] = ''
    }
  }
  
  return fields
}

function extractDownloadLinksFromResponse(html) {
  const links = []
  
  // Method 1: Look for download buttons with direct links (like Playwright's waitForSelector)
  const downloadButtonRegex = /<button[^>]*onclick="window\.open\('([^']+)'[^>]*>[\s\S]*?Download[\s\S]*?<\/button>/gi
  let match
  while ((match = downloadButtonRegex.exec(html)) !== null) {
    // Only include if it looks like a file URL
    if (match[1].includes('download') || match[1].includes('file') || match[1].match(/\.(mp4|mkv|avi|mp3|zip|rar|pdf|jpg|png|exe)/i)) {
      links.push({
        name: `File ${links.length + 1}`,
        size: 'Unknown',
        url: match[1]
      })
    }
  }
  
  // Method 2: Look for direct download links
  const linkRegex = /<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?Download[\s\S]*?<\/a>/gi
  while ((match = linkRegex.exec(html)) !== null) {
    if (!match[1].includes('javascript:') && !match[1].includes('#') && 
        (match[1].includes('download') || match[1].includes('file') || match[1].match(/\.(mp4|mkv|avi|mp3|zip|rar|pdf|jpg|png|exe)/i))) {
      links.push({
        name: `File ${links.length + 1}`,
        size: 'Unknown',
        url: match[1]
      })
    }
  }
  
  // Method 3: Look for download URLs in JavaScript variables
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
    if ((url.includes('download') || 
         url.includes('terabox') || 
         url.includes('1024terabox') ||
         url.includes('file') ||
         url.match(/\.(mp4|mkv|avi|mp3|zip|rar|pdf|jpg|png|exe|doc|docx|xls|xlsx|ppt|pptx)$/i)) &&
        !url.includes('teraboxdl.site') && // Exclude the site itself
        !links.some(link => link.url === url)) {
      links.push({
        name: `File ${links.length + 1}`,
        size: 'Unknown',
        url: url
      })
    }
  })
  
  return links
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
