addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  if (request.method === 'GET') {
    return new Response('Terabox Bot is running!')
  }
  
  if (request.method === 'POST') {
    // Immediately respond to Telegram
    const response = new Response('OK')
    
    // Process in background
    event.waitUntil(async () => {
      try {
        const update = await request.clone().json()
        if (update.message && update.message.text === '/start') {
          const chatId = update.message.chat.id
          await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: chatId,
              text: 'Bot is working!'
            })
          })
        }
      } catch (error) {
        console.error('Error:', error)
      }
    })
    
    return response
  }
  
  return new Response('Method not allowed', { status: 405 })
}
