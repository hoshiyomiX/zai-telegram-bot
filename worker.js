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
        `https://terabox.com/s/xxxxx`
      )
      return
    }
    
    const linkMatch = text.match(/https:\/\/(?:www\.)?(?:terabox|1024terabox)\.com\/s\/([^\s]+)/)
    if (!linkMatch) {
      await sendMessage(chatId, "❌ Please send a valid Terabox share link")
      return
    }
    
    const fullUrl = linkMatch[0]
    const password = text.replace(linkMatch[0], '').trim()
    
    console.log(`Processing: ${fullUrl}, password: ${password || 'none'}`)
    
    await sendMessage(chatId, "⏳ Processing your request, please wait...")
    
    await processTeraboxLink(chatId, fullUrl, password)
  } catch (error) {
    console.error('Error processing update:', error)
  }
}

async function processTeraboxLink(chatId, teraboxUrl, password) {
  try {
    console.log('Processing Terabox link...')
    
    // Try to get the generated download page
    const result = await getDownloadPage(teraboxUrl, password)
    
    if (!result.success) {
      await sendMessage(chatId, `❌ Failed to get download page: ${result.error}`)
      return
    }
    
    // Extract the actual download links
    const downloadLinks = extractActualDownloadLinks(result.html)
    
    if (downloadLinks.length === 0) {
      await sendMessage(chatId, "❌ No download links found. The link might be invalid or expired.")
      return
    }
    
    // Send the download links
    await sendDownloadLinks(chatId, downloadLinks)
    
  } catch (error) {
    console.error('Error processing Terabox link:', error)
    await sendMessage(chatId, `❌ Error: ${error.message}`)
  }
}

async function getDownloadPage(teraboxUrl, password) {
  try {
    // Step 1: Get the initial page to get cookies and form details
    console.log('Getting initial page...')
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
      return { success: false, error: `Failed to get initial page: ${initialResponse.status}` }
    }
    
    const html = await initialResponse.text()
    const cookies = initialResponse.headers.get('set-cookie') || ''
    
    console.log('Initial page loaded, cookies:', cookies)
    
    // Step 2: Extract form details
    const formInfo = extractFormDetails(html)
    if (!formInfo) {
      return { success: false, error: 'Could not find form details' }
    }
    
    console.log('Form details:', formInfo)
    
    // Step 3: Submit the form
    console.log('Submitting form...')
    const formData = new URLSearchParams()
    formData.append(formInfo.urlFieldName, teraboxUrl)
    if (password) {
      formData.append(formInfo.passwordFieldName || 'password', password)
    }
    
    // Add any hidden fields
    if (formInfo.hiddenFields) {
      for (const [name, value] of Object.entries(formInfo.hiddenFields)) {
        formData.append(name, value)
      }
    }
    
    const submitResponse = await fetch(formInfo.action, {
      method: formInfo.method || 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies,
        'Referer': 'https://teraboxdl.site/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36'
      },
      body: formData.toString(),
      redirect: 'follow' // Follow redirects
    })
    
    if (!submitResponse.ok) {
      return { success: false, error: `Form submission failed: ${submitResponse.status}` }
    }
    
    const finalHtml = await submitResponse.text()
    console.log('Form submitted successfully, response length:', finalHtml.length)
    
    // Log a sample of the response
    console.log('Response sample:', finalHtml.substring(0, 500))
    
    return { success: true, html: finalHtml }
    
  } catch (error) {
    console.error('Error getting download page:', error)
    return { success: false, error: error.message }
  }
}

function extractFormDetails(html) {
  if (!html) return null
  
  // Find the form
  const formMatch = html.match(/<form[^>]*>([\s\S]*?)<\/form>/i)
  if (!formMatch) return null
  
  const formContent = formMatch[0]
  
  // Extract form action
  let action = 'https://teraboxdl.site/'
  const actionMatch = formContent.match(/action="([^"]*)"/i)
  if (actionMatch && actionMatch[1]) {
    action = actionMatch[1]
    if (!action.startsWith('http')) {
      action = new URL(action, 'https://teraboxdl.site/').toString()
    }
  }
  
  // Extract form method
  let method = 'POST'
  const methodMatch = formContent.match(/method="([^"]*)"/i)
  if (methodMatch && methodMatch[1]) {
    method = methodMatch[1].toUpperCase()
  }
  
  // Find the URL input field
  let urlFieldName = 'url'
  const urlInputMatch = formContent.match(/<input[^>]*name="([^"]*)"[^>]*placeholder="[^"]*URL[^"]*"[^>]*>/i)
  if (urlInputMatch && urlInputMatch[1]) {
    urlFieldName = urlInputMatch[1]
  }
  
  // Find the password input field
  let passwordFieldName = 'password'
  const passwordInputMatch = formContent.match(/<input[^>]*name="([^"]*)"[^>]*type="password"[^>]*>/i)
  if (passwordInputMatch && passwordInputMatch[1]) {
    passwordFieldName = passwordInputMatch[1]
  }
  
  // Extract hidden fields
  const hiddenFields = {}
  const hiddenInputMatches = formContent.match(/<input[^>]*type="hidden"[^>]*name="([^"]*)"[^>]*value="([^"]*)"[^>]*>/gi)
  if (hiddenInputMatches) {
    hiddenInputMatches.forEach(match => {
      const nameMatch = match.match(/name="([^"]*)"/)
      const valueMatch = match.match(/value="([^"]*)"/)
      if (nameMatch && valueMatch) {
        hiddenFields[nameMatch[1]] = valueMatch[1]
      }
    })
  }
  
  return {
    action,
    method,
    urlFieldName,
    passwordFieldName,
    hiddenFields
  }
}

function extractActualDownloadLinks(html) {
  if (!html) return []
  
  const links = []
  
  // Look for download links that are NOT images and NOT from teraboxdl.site
  // Pattern 1: Direct links with file extensions
  const fileExtensions = ['mp4', 'mkv', 'avi', 'mp3', 'zip', 'rar', 'pdf', 'jpg', 'png', 'exe', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx']
  const extensionPattern = fileExtensions.join('|')
  
  const directLinkRegex = new RegExp(`https://[^\\s"']+\\.(${extensionPattern})`, 'gi')
  let match
  while ((match = directLinkRegex.exec(html)) !== null) {
    const url = match[0]
    // Skip if it's from teraboxdl.site or an image
    if (!url.includes('teraboxdl.site') && !url.match(/\.(jpg|jpeg|png|gif|ico|svg)$/i)) {
      // Extract filename from URL
      const filename = url.split('/').pop() || `File ${links.length + 1}`
      links.push({
        name: filename,
        size: 'Unknown',
        url: url
      })
    }
  }
  
  // Pattern 2: Look for download buttons with actual file URLs
  const downloadButtonRegex = /<button[^>]*onclick="window\.open\('([^']+)'\)[^>]*>[\s\S]*?Download[\s\S]*?<\/button>/gi
  while ((match = downloadButtonRegex.exec(html)) !== null) {
    const url = match[1]
    // Skip if it's from teraboxdl.site or an image
    if (!url.includes('teraboxdl.site') && !url.match(/\.(jpg|jpeg|png|gif|ico|svg)$/i)) {
      const filename = url.split('/').pop() || `File ${links.length + 1}`
      links.push({
        name: filename,
        size: 'Unknown',
        url: url
      })
    }
  }
  
  // Pattern 3: Look for download links in <a> tags
  const linkRegex = /<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?Download[\s\S]*?<\/a>/gi
  while ((match = linkRegex.exec(html)) !== null) {
    const urlMatch = match.match(/href="([^"]+)"/)
    if (urlMatch && urlMatch[1]) {
      const url = urlMatch[1]
      // Skip if it's from teraboxdl.site, an image, or javascript
      if (!url.includes('teraboxdl.site') && 
          !url.match(/\.(jpg|jpeg|png|gif|ico|svg)$/i) && 
          !url.startsWith('javascript:')) {
        const filename = url.split('/').pop() || `File ${links.length + 1}`
        links.push({
          name: filename,
          size: 'Unknown',
          url: url
        })
      }
    }
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
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
