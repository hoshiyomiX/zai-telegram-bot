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
    // Try different form submission patterns
    
    // Pattern 1: Direct POST to root
    const result1 = await tryDirectPost(chatId, teraboxUrl, password)
    if (result1.success) return
    
    // Pattern 2: GET with query parameters
    const result2 = await tryGetWithParams(chatId, teraboxUrl, password)
    if (result2.success) return
    
    // Pattern 3: POST to /download
    const result3 = await tryPostToDownload(chatId, teraboxUrl, password)
    if (result3.success) return
    
    // If all patterns fail
    await sendMessage(chatId, "❌ Failed to process link. The service might be down or the link is invalid.")
    
  } catch (error) {
    console.error('Error processing Terabox link:', error)
    await sendMessage(chatId, `❌ Error: ${error.message}`)
  }
}

async function tryDirectPost(chatId, teraboxUrl, password) {
  try {
    console.log('Trying direct POST method...')
    
    // First, get the page to extract any cookies
    const initialResponse = await fetch('https://teraboxdl.site/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    
    const cookies = initialResponse.headers.get('set-cookie') || ''
    
    // Prepare form data
    const formData = new URLSearchParams()
    formData.append('url', teraboxUrl)
    if (password) formData.append('password', password)
    
    // Submit the form
    const response = await fetch('https://teraboxdl.site/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies,
        'Referer': 'https://teraboxdl.site/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: formData.toString()
    })
    
    if (!response.ok) {
      console.log('Direct POST failed:', response.status)
      return { success: false }
    }
    
    const html = await response.text()
    const links = extractDownloadLinks(html)
    
    if (links.length > 0) {
      await sendDownloadLinks(chatId, links)
      return { success: true }
    }
    
    return { success: false }
  } catch (error) {
    console.error('Direct POST error:', error)
    return { success: false }
  }
}

async function tryGetWithParams(chatId, teraboxUrl, password) {
  try {
    console.log('Trying GET with params method...')
    
    // Build URL with parameters
    const url = new URL('https://teraboxdl.site/')
    url.searchParams.append('url', teraboxUrl)
    if (password) url.searchParams.append('password', password)
    
    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    
    if (!response.ok) {
      console.log('GET with params failed:', response.status)
      return { success: false }
    }
    
    const html = await response.text()
    const links = extractDownloadLinks(html)
    
    if (links.length > 0) {
      await sendDownloadLinks(chatId, links)
      return { success: true }
    }
    
    return { success: false }
  } catch (error) {
    console.error('GET with params error:', error)
    return { success: false }
  }
}

async function tryPostToDownload(chatId, teraboxUrl, password) {
  try {
    console.log('Trying POST to /download method...')
    
    // First, get the page to extract any cookies
    const initialResponse = await fetch('https://teraboxdl.site/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })
    
    const cookies = initialResponse.headers.get('set-cookie') || ''
    
    // Prepare form data
    const formData = new URLSearchParams()
    formData.append('url', teraboxUrl)
    if (password) formData.append('password', password)
    
    // Submit the form to /download
    const response = await fetch('https://teraboxdl.site/download', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookies,
        'Referer': 'https://teraboxdl.site/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: formData.toString()
    })
    
    if (!response.ok) {
      console.log('POST to /download failed:', response.status)
      return { success: false }
    }
    
    const html = await response.text()
    const links = extractDownloadLinks(html)
    
    if (links.length > 0) {
      await sendDownloadLinks(chatId, links)
      return { success: true }
    }
    
    return { success: false }
  } catch (error) {
    console.error('POST to /download error:', error)
    return { success: false }
  }
}

function extractDownloadLinks(html) {
  const links = []
  
  // Look for direct download links
  const directLinks = html.match(/https:\/\/[^"\s]+\.(?:mp4|mkv|avi|mp3|zip|rar|pdf|jpg|png|exe)/gi)
  if (directLinks) {
    directLinks.forEach(url => {
      if (!links.some(link => link.url === url)) {
        links.push({
          name: `File ${links.length + 1}`,
          size: 'Unknown',
          url: url
        })
      }
    })
  }
  
  // Look for download buttons
  const buttonMatches = html.match(/<button[^>]*onclick="window\.open\('([^']+)'\)[^>]*>[\s\S]*?Download[\s\S]*?<\/button>/gi)
  if (buttonMatches) {
    buttonMatches.forEach(match => {
      const urlMatch = match.match(/window\.open\('([^']+)'\)/)
      if (urlMatch && urlMatch[1] && !links.some(link => link.url === urlMatch[1])) {
        links.push({
          name: `File ${links.length + 1}`,
          size: 'Unknown',
          url: urlMatch[1]
        })
      }
    })
  }
  
  // Look for download links in <a> tags
  const linkMatches = html.match(/<a[^>]*href="([^"]+)"[^>]*>[\s\S]*?Download[\s\S]*?<\/a>/gi)
  if (linkMatches) {
    linkMatches.forEach(match => {
      const urlMatch = match.match(/href="([^"]+)"/)
      if (urlMatch && urlMatch[1] && !urlMatch[1].includes('javascript') && !links.some(link => link.url === urlMatch[1])) {
        links.push({
          name: `File ${links.length + 1}`,
          size: 'Unknown',
          url: urlMatch[1]
        })
      }
    })
  }
  
  return links
}

async function sendDownloadLinks(chatId, links) {
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
    const token = TELEGRAM_BOT_TOKEN
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    })
  } catch (error) {
    console.error('Error sending message:', error)
  }
}

function escapeHtml(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
      }
