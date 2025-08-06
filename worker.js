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
    
    // Try to find the correct form endpoint and method
    const result = await tryFormSubmissionMethod(teraboxUrl, password)
    
    if (result.success) {
      console.log('Successfully processed Terabox link')
      await sendDownloadLinks(chatId, result.links)
    } else {
      console.log('Failed to process Terabox link:', result.error)
      await sendMessage(chatId, `❌ Failed to process link: ${result.error}`)
    }
    
  } catch (error) {
    console.error('Error processing Terabox link:', error)
    await sendMessage(chatId, `❌ Error: ${error.message}`)
  }
}

async function tryFormSubmissionMethod(teraboxUrl, password) {
  try {
    // Step 1: Get initial page to find form endpoint
    console.log('Getting initial page...')
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
    console.log('Initial page loaded, length:', html.length)
    
    // Log a sample of the HTML for debugging
    console.log('HTML sample:', html.substring(0, 1000))
    
    // Try multiple approaches to find the form
    
    // Approach 1: Look for a form with method and action
    let formMatch = html.match(/<form[^>]*method="([^"]*)"[^>]*action="([^"]*)"[^>]*>/i)
    if (!formMatch) {
      // Approach 2: Look for any form tag
      formMatch = html.match(/<form[^>]*action="([^"]*)"[^>]*>/i)
      if (formMatch) {
        // Default to POST if method not specified
        formMatch = ['', 'POST', formMatch[1]]
      } else {
        // Approach 3: Look for form without action
        formMatch = html.match(/<form[^>]*>/i)
        if (formMatch) {
          // Default to POST and current URL
          formMatch = ['', 'POST', 'https://teraboxdl.site/']
        }
      }
    }
    
    if (!formMatch) {
      // If no form found, try to find input fields and submit button
      console.log('No form found, looking for input fields and submit button')
      
      // Look for input fields
      const inputFields = {}
      const inputRegex = /<input[^>]*name="([^"]*)"[^>]*value="([^"]*)"[^>]*>/gi
      let inputMatch
      while ((inputMatch = inputRegex.exec(html)) !== null) {
        inputFields[inputMatch[1]] = inputMatch[2]
      }
      
      // Look for submit button
      const submitMatch = html.match(/<button[^>]*type="submit"[^>]*name="([^"]*)"[^>]*>/i) ||
                         html.match(/<input[^>]*type="submit"[^>]*name="([^"]*)"[^>]*>/i)
      
      if (Object.keys(inputFields).length > 0) {
        // We found input fields, assume we can submit to the same URL
        console.log('Found input fields but no form, will submit to root')
        return await submitForm('https://teraboxdl.site/', 'POST', inputFields, teraboxUrl, password, initialResponse.headers.get('set-cookie') || '')
      } else {
        return { success: false, error: 'Could not find form or input fields in the page' }
      }
    }
    
    const formMethod = formMatch[1] ? formMatch[1].toUpperCase() : 'POST'
    let formAction = formMatch[2] || 'https://teraboxdl.site/'
    
    // If formAction is relative, make it absolute
    if (!formAction.startsWith('http')) {
      formAction = new URL(formAction, 'https://teraboxdl.site/').toString()
    }
    
    console.log('Form method:', formMethod)
    console.log('Form action:', formAction)
    
    // Extract all input fields from the form
    const inputFields = {}
    const inputRegex = /<input[^>]*name="([^"]*)"[^>]*value="([^"]*)"[^>]*>/gi
    let inputMatch
    while ((inputMatch = inputRegex.exec(html)) !== null) {
      inputFields[inputMatch[1]] = inputMatch[2]
    }
    
    // Override with our URL and password
    inputFields['url'] = teraboxUrl
    if (password) {
      inputFields['password'] = password
    }
    
    console.log('Form fields:', inputFields)
    
    // Get cookies from initial response
    const cookies = initialResponse.headers.get('set-cookie') || ''
    console.log('Initial cookies:', cookies)
    
    // Submit the form
    return await submitForm(formAction, formMethod, inputFields, teraboxUrl, password, cookies)
    
  } catch (error) {
    console.error('Form method error:', error)
    return { success: false, error: error.message }
  }
}

async function submitForm(formAction, formMethod, inputFields, teraboxUrl, password, cookies) {
  try {
    let submitResponse
    
    if (formMethod === 'POST') {
      const formData = new URLSearchParams()
      for (const [key, value] of Object.entries(inputFields)) {
        formData.append(key, value)
      }
      
      console.log('Submitting form via POST to:', formAction)
      console.log('Form data:', formData.toString())
      
      submitResponse = await fetchWithTimeout(formAction, {
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
      const url = new URL(formAction)
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
      return { success: false, error: `Form submission failed: ${submitResponse.status} ${submitResponse.statusText}` }
    }
    
    const responseHtml = await submitResponse.text()
    console.log('Response length:', responseHtml.length)
    
    // Save a sample of the response for debugging
    console.log('Response sample:', responseHtml.substring(0, 500))
    
    // Parse the response to extract download links
    const downloadLinks = extractSpecificDownloadLinks(responseHtml)
    
    if (downloadLinks.length > 0) {
      return { success: true, links: downloadLinks }
    } else {
      // If no specific links found, try the general extraction
      const generalLinks = extractDownloadLinks(responseHtml)
      if (generalLinks.length > 0) {
        return { success: true, links: generalLinks }
      } else {
        return { success: false, error: 'No download links found in response' }
      }
    }
    
  } catch (error) {
    console.error('Submit form error:', error)
    return { success: false, error: error.message }
  }
}

function extractSpecificDownloadLinks(html) {
  const links = []
  
  // Look for download links in specific patterns that indicate actual file downloads
  // Pattern 1: Direct download links with file extensions
  const directLinkRegex = /<a[^>]*href="([^"]+\.(?:mp4|mkv|avi|mp3|zip|rar|pdf|jpg|png|exe|doc|docx|xls|xlsx|ppt|pptx))"[^>]*>([^<]+)<\/a>/gi
  let match
  while ((match = directLinkRegex.exec(html)) !== null) {
    links.push({
      name: match[2].trim(),
      size: 'Unknown',
      url: match[1]
    })
  }
  
  // Pattern 2: Download buttons with file names
  const downloadButtonRegex = /<button[^>]*onclick="window\.open\('([^"]+\.(?:mp4|mkv|avi|mp3|zip|rar|pdf|jpg|png|exe|doc|docx|xls|xlsx|ppt|pptx))'[^>]*>([^<]+)<\/button>/gi
  while ((match = downloadButtonRegex.exec(html)) !== null) {
    links.push({
      name: match[2].trim(),
      size: 'Unknown',
      url: match[1]
    })
  }
  
  // Pattern 3: Look for file listings with download links
  const fileListingRegex = /<div[^>]*class="[^"]*file[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<\/div>/gi
  while ((match = fileListingRegex.exec(html)) !== null) {
    if (match[1].includes('download') || match[1].includes('terabox') || match[1].match(/\.(mp4|mkv|avi|mp3|zip|rar|pdf|jpg|png|exe|doc|docx|xls|xlsx|ppt|pptx)/i)) {
      links.push({
        name: match[2].trim(),
        size: 'Unknown',
        url: match[1]
      })
    }
  }
  
  // Pattern 4: Look for JavaScript download links with file names
  const jsDownloadRegex = /downloadFile\(['"]([^"]+)['"],\s*['"]([^"']+)['"]\)/gi
  while ((match = jsDownloadRegex.exec(html)) !== null) {
    links.push({
      name: match[2],
      size: 'Unknown',
      url: match[1]
    })
  }
  
  // Remove duplicates
  const uniqueLinks = []
  const seenUrls = new Set()
  links.forEach(link => {
    if (!seenUrls.has(link.url)) {
      seenUrls.add(link.url)
      uniqueLinks.push(link)
    }
  })
  
  return uniqueLinks
}

function extractDownloadLinks(html) {
  const links = []
  
  // Method 1: Look for download buttons with direct links
  const buttonRegex = /<button[^>]*onclick="window\.open\('([^']+)'[^>]*>[\s\S]*?Download[\s\S]*?<\/button>/gi
  let match
  while ((match = buttonRegex.exec(html)) !== null) {
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
