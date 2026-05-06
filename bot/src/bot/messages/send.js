const axios = require('axios');
const config = require('../../config');

const evClient = axios.create({
  baseURL: config.evolution.url,
  headers: {
    apikey: config.evolution.apiKey,
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

const INSTANCE = config.evolution.instance;

// Evolution API v1.8.x — minimal format that works (no options field)
async function sendText(to, text) {
  await evClient.post(`/message/sendText/${INSTANCE}`, {
    number: to,
    textMessage: { text },
  });
}

async function sendButtons(to, bodyText, buttons, footerText = '') {
  // In v1.8.x buttons often fail — go straight to text fallback
  const btnList = buttons.slice(0, 3);
  const lines = btnList.map((b, i) => `*${i + 1}.* ${b}`).join('\n');
  await sendText(to, `${bodyText}\n\n${lines}`);
}

async function sendList(to, title, description, sections) {
  // Fallback: numbered text list
  let text = title ? `*${title}*\n\n` : '';
  sections.forEach((s) => {
    s.rows.forEach((r, i) => { text += `*${i + 1}.* ${r.title}\n`; });
  });
  await sendText(to, text.trim());
}

async function sendImage(to, imageUrl, caption = '') {
  try {
    await evClient.post(`/message/sendMedia/${INSTANCE}`, {
      number: to,
      mediaMessage: { mediatype: 'image', media: imageUrl, caption },
    });
  } catch {
    if (caption) await sendText(to, caption);
  }
}

module.exports = { sendText, sendButtons, sendList, sendImage };
