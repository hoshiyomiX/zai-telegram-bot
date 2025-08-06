# Terabox Telegram Bot

Cloudflare Worker that converts Terabox share links to direct download links via Telegram bot.

## Setup

1. Create a Telegram bot via [@BotFather](https://t.me/BotFather)
2. Deploy this worker to Cloudflare
3. Set environment variable `TELEGRAM_BOT_TOKEN` with your bot token
4. Set webhook: `https://api.telegram.org/botYOUR_TOKEN/setWebhook?url=YOUR_WORKER_URL`

## Usage

Send a Terabox link to the bot:
- For unprotected files: `https://terabox.com/s/xxxxx`
- For protected files: `https://terabox.com/s/xxxxx password`
