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
        `https://terabox.com/s/xxxxx your_password`
      )
      return
    }
    
    // Extract Terabox link - updated to match multiple domains
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
    
    // Process the Terabox link with the new API
    await processTeraboxLinkWithNewAPI(chatId, shorturl, password)
  } catch (error) {
    console.error('Error processing update:', error)
  }
}

// Helper function to make remote file path
function makeRemoteFPath(sdir, sfile) {
  const tdir = sdir.match(/\/$/) ? sdir : sdir + '/';
  return tdir + sfile;
}

// FormUrlEncoded class for handling form data
class FormUrlEncoded {
  constructor(params) {
    this.data = new URLSearchParams();
    if (typeof params === 'object' && params !== null) {
      for (const [key, value] of Object.entries(params)) {
        this.data.append(key, value);
      }
    }
  }
  
  set(param, value) {
    this.data.set(param, value);
  }
  
  append(param, value) {
    this.data.append(param, value);
  }
  
  delete(param) {
    this.data.delete(param);
  }
  
  str() {
    return this.data.toString().replace(/\+/g, '%20');
  }
  
  url() {
    return this.data;
  }
}

// Sign download function
function signDownload(s1, s2) {
  const p = new Uint8Array(256);
  const a = new Uint8Array(256);
  const result = [];
  
  Array.from({ length: 256 }, (_, i) => {
    a[i] = s1.charCodeAt(i % s1.length);
    p[i] = i;
  });
  
  let j = 0;
  Array.from({ length: 256 }, (_, i) => {
    j = (j + p[i] + a[i]) % 256;
    [p[i], p[j]] = [p[j], p[i]];
  });
  
  let i = 0; j = 0;
  Array.from({ length: s2.length }, (_, q) => {
    i = (i + 1) % 256;
    j = (j + p[i]) % 256;
    [p[i], p[j]] = [p[j], p[i]];
    const k = p[(p[i] + p[j]) % 256];
    result.push(s2.charCodeAt(q) ^ k);
  });
  
  return Buffer.from(result).toString('base64');
}

// Check MD5 value
function checkMd5val(md5) {
  if (typeof md5 !== 'string') return false;
  return /^[a-f0-9]{32}$/.test(md5);
}

// Check MD5 array
function checkMd5arr(arr) {
  if (!Array.isArray(arr)) return false;
  if (arr.length === 0) return false;
  return arr.every(item => checkMd5val(item));
}

// Decode MD5
function decodeMd5(md5) {
  if (md5.length !== 32) return md5;
  
  const restoredHexChar = (md5.charCodeAt(9) - 'g'.charCodeAt(0)).toString(16);
  const o = md5.slice(0, 9) + restoredHexChar + md5.slice(10);
  
  let n = '';
  for (let i = 0; i < o.length; i++) {
    const orig = parseInt(o[i], 16) ^ (i & 15);
    n += orig.toString(16);
  }
  
  const e =
    n.slice(8, 16) +
    n.slice(0, 8) +
    n.slice(24, 32) +
    n.slice(16, 24);
  
  return e;
}

// Change Base64 type
function changeBase64Type(str, mode = 1) {
  return mode === 1
    ? str.replace(/\+/g, '-').replace(/\//g, '_')
    : str.replace(/-/g, '+').replace(/_/g, '/');
}

// Decrypt AES
function decryptAES(pp1, pp2) {
  pp1 = changeBase64Type(pp1, 2);
  pp2 = changeBase64Type(pp2, 2);
  
  const cipherText = pp1.substring(16);
  const key = Buffer.from(pp2, 'utf8');
  const iv = Buffer.from(pp1.substring(0, 16), 'utf8');
  
  const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
  
  let decrypted = decipher.update(cipherText, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

// Encrypt RSA
function encryptRSA(message, publicKeyPEM, mode = 1) {
  if (mode === 2) {
    const md5 = crypto.createHash('md5').update(message).digest('hex');
    message = md5 + (md5.length < 10 ? '0' : '') + md5.length;
  }
  
  const buffer = Buffer.from(message, 'utf8');
  
  const encrypted = crypto.publicEncrypt({
    key: publicKeyPEM,
    padding: crypto.constants.RSA_PKCS1_PADDING,
  }, buffer);
  
  return encrypted.toString('base64');
}

// Generate pseudo-random hash
function prandGen(client = 'web', seval, encpwd, email, browserid = '', random) {
  const combined = `${client}-${seval}-${encpwd}-${email}-${browserid}-${random}`;
  return crypto.createHash('sha1').update(combined).digest('hex');
}

// TeraBox App class
class TeraBoxApp {
  FormUrlEncoded = FormUrlEncoded;
  SignDownload = signDownload;
  CheckMd5Val = checkMd5val;
  CheckMd5Arr = checkMd5arr;
  DecodeMd5 = decodeMd5;
  ChangeBase64Type = changeBase64Type;
  DecryptAES = decryptAES;
  EncryptRSA = encryptRSA;
  PRandGen = prandGen;
  
  TERABOX_DOMAIN = 'terabox.com';
  TERABOX_TIMEOUT = 10000;
  
  data = {
    csrf: '',
    logid: '0',
    pcftoken: '',
    bdstoken: '',
    jsToken: '',
    pubkey: '',
  };
  
  params = {
    whost: 'https://www.' + this.TERABOX_DOMAIN,
    uhost: 'https://c-www.' + this.TERABOX_DOMAIN,
    lang: 'en',
    app: {
      app_id: 250528,
      web: 1,
      channel: 'dubox',
      clienttype: 0,
    },
    ver_android: '3.44.2',
    ua: 'terabox;1.40.0.132;PC;PC-Windows;10.0.26100;WindowsTeraBox',
    cookie: '',
    auth: {},
    account_id: 0,
    account_name: '',
    is_vip: false,
    vip_type: 0,
    space_used: 0,
    space_total: Math.pow(1024, 3),
    space_available: Math.pow(1024, 3),
    cursor: 'null',
  };
  
  constructor(authData, authType = 'ndus') {
    this.params.cookie = `lang=${this.params.lang}`;
    if (authType === 'ndus') {
      this.params.cookie += authData ? '; ndus=' + authData : '';
    } else {
      throw new Error('initTBApp', { cause: 'AuthType Not Supported!' });
    }
  }
  
  async updateAppData(customPath, retries = 4) {
    const url = new URL(this.params.whost + (customPath ? `/${customPath}` : '/main'));
    
    try {
      const req = await fetch(url, {
        headers: {
          'User-Agent': this.params.ua,
          'Cookie': this.params.cookie,
        },
        signal: AbortSignal.timeout(this.TERABOX_TIMEOUT + 10000),
      });
      
      if (req.status === 302) {
        const newUrl = new URL(req.headers.get('location'));
        if (this.params.whost !== newUrl.origin) {
          this.params.whost = newUrl.origin;
          console.warn(`[WARN] Default hostname changed to ${newUrl.origin}`);
        }
        const toPathname = newUrl.pathname.replace(/^\//, '');
        const finalUrl = toPathname + newUrl.search;
        return await this.updateAppData(finalUrl, retries);
      }
      
      if (req.headers.get('set-cookie')) {
        const cookies = req.headers.get('set-cookie').split(',');
        let cookieStr = this.params.cookie;
        
        cookies.forEach(cookie => {
          const [nameValue] = cookie.split(';');
          const [name, value] = nameValue.split('=');
          if (name && value) {
            // Update or add the cookie
            const regex = new RegExp(`(^|;)\\s*${name}\\s*=`);
            if (regex.test(cookieStr)) {
              cookieStr = cookieStr.replace(regex, `$1${name}=${value}`);
            } else {
              cookieStr += `; ${name}=${value}`;
            }
          }
        });
        
        this.params.cookie = cookieStr;
      }
      
      const body = await req.text();
      
      // Extract tokens from the HTML
      const csrfMatch = body.match(/name="csrf-token" content="([^"]+)"/);
      if (csrfMatch) {
        this.data.csrf = csrfMatch[1];
      }
      
      const logidMatch = body.match(/"logid":"([^"]+)"/);
      if (logidMatch) {
        this.data.logid = logidMatch[1];
      }
      
      const bdstokenMatch = body.match(/"bdstoken":"([^"]+)"/);
      if (bdstokenMatch) {
        this.data.bdstoken = bdstokenMatch[1];
      }
      
      return { success: true, body };
    } catch (error) {
      console.error('Error updating app data:', error);
      if (retries > 0) {
        console.log(`Retrying... (${retries} attempts left)`);
        await new Promise(resolve => setTimeout(resolve, 1000));
        return await this.updateAppData(customPath, retries - 1);
      }
      throw error;
    }
  }
  
  async getShareInfo(shareId, password = '') {
    try {
      // First update app data to get tokens
      await this.updateAppData();
      
      // Prepare request parameters
      const params = new FormUrlEncoded({
        shareid: shareId,
        pwd: password,
        primary: 'ppt',
        fid: '',
        type: '0',
      });
      
      const url = `${this.params.whost}/share/list?channel=chunlei&web=1&app_id=250528&clienttype=0`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': this.params.ua,
          'Cookie': this.params.cookie,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': `${this.params.whost}/s/${shareId}`,
        },
        body: params.str(),
        signal: AbortSignal.timeout(this.TERABOX_TIMEOUT),
      });
      
      const data = await response.json();
      
      if (data.errno !== 0) {
        throw new Error(`API error: ${data.errno}`);
      }
      
      return data;
    } catch (error) {
      console.error('Error getting share info:', error);
      throw error;
    }
  }
  
  async getDownloadLink(fsId, shareId, timestamp, sign) {
    try {
      const params = new FormUrlEncoded({
        encrypt: '0',
        product: 'share',
        type: 'nolimit',
        uk: shareId,
        primaryid: shareId,
        fid_list: JSON.stringify([fsId]),
      });
      
      const url = `${this.params.whost}/api/download?channel=chunlei&web=1&app_id=250528&clienttype=0`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'User-Agent': this.params.ua,
          'Cookie': this.params.cookie,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Referer': `${this.params.whost}/s/${shareId}`,
        },
        body: params.str(),
        signal: AbortSignal.timeout(this.TERABOX_TIMEOUT),
      });
      
      const data = await response.json();
      
      if (data.errno !== 0) {
        throw new Error(`API error: ${data.errno}`);
      }
      
      return data;
    } catch (error) {
      console.error('Error getting download link:', error);
      throw error;
    }
  }
}

// Process Terabox link with new API
async function processTeraboxLinkWithNewAPI(chatId, shorturl, password) {
  try {
    console.log('Processing with new API...')
    
    // Create TeraBox app instance without authentication (for public links)
    const teraApp = new TeraBoxApp('');
    
    // Get share information
    console.log('Getting share info...')
    const shareInfo = await teraApp.getShareInfo(shorturl, password);
    console.log('Share info received:', JSON.stringify(shareInfo));
    
    if (!shareInfo.list || shareInfo.list.length === 0) {
      await sendMessage(chatId, "❌ No files found in this share");
      return;
    }
    
    // Get download links for each file
    console.log('Getting download links...')
    const downloadPromises = shareInfo.list.map(async (file) => {
      try {
        console.log(`Processing file: ${file.server_filename}`);
        
        const downloadInfo = await teraApp.getDownloadLink(
          file.fs_id,
          shareInfo.uk,
          shareInfo.timestamp,
          shareInfo.sign
        );
        
        if (downloadInfo.list && downloadInfo.list.length > 0) {
          return {
            name: file.server_filename,
            size: (file.size / (1024 * 1024)).toFixed(2),
            url: downloadInfo.list[0].dlink
          };
        }
      } catch (error) {
        console.error(`Error getting download link for ${file.server_filename}:`, error);
        return null;
      }
    });
    
    // Wait for all download links to be processed
    const downloadResults = await Promise.all(downloadPromises);
    const links = downloadResults.filter(link => link !== null);
    
    console.log(`Found ${links.length} download links`);
    
    if (links.length === 0) {
      await sendMessage(chatId, "❌ No download links found");
      return;
    }
    
    // Format response
    let response = `✅ Found ${links.length} file(s):\n\n`;
    links.forEach((file, i) => {
      response += `<b>File ${i+1}:</b> ${escapeHtml(file.name)}\n`;
      response += `<b>Size:</b> ${file.size} MB\n`;
      response += `<a href="${file.url}">Download</a>\n\n`;
    });
    
    console.log('Sending response to user');
    await sendMessage(chatId, response);
  } catch (error) {
    console.error('Error processing Terabox link with new API:', error);
    await sendMessage(chatId, `❌ Error: ${error.message}`);
  }
}

async function sendMessage(chatId, text) {
  try {
    console.log(`Sending message to ${chatId}: ${text.substring(0, 100)}...`);
    const token = TELEGRAM_BOT_TOKEN;
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error sending message:', errorText);
    } else {
      console.log('Message sent successfully');
    }
  } catch (error) {
    console.error('Error in sendMessage:', error);
  }
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  }
