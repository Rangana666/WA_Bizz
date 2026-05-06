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

// Evolution API v1.8.x format
async function sendText(to, text) {
  await evClient.post(`/message/sendText/${INSTANCE}`, {
    number: to,
    textMessage: { text },
    options: { delay: 1200, presence: 'composing' },
  });
}

async function sendButtons(to, bodyText, buttons, footerText = '') {
  const btnList = buttons.slice(0, 3);
  try {
    // Evolution API v1.8.x: buttonText is a plain STRING, needs title field
    await evClient.post(`/message/sendButtons/${INSTANCE}`, {
      number: to,
      buttonMessage: {
        title: 'WA Bizz',
        description: bodyText,
        footer: footerText || '',
        buttons: btnList.map((b, i) => ({
          buttonId: String(i + 1),
          buttonText: String(b),
          type: 1,
        })),
      },
      options: { delay: 1200 },
    });
  } catch {
    // Fallback: plain numbered text menu
    const lines = btnList.map((b, i) => `*${i + 1}.* ${b}`).join('\n');
    await sendText(to, `${bodyText}\n\n${lines}\n\n_Reply with the number to choose_`);
  }
}

async function sendList(to, title, description, sections) {
  try {
    await evClient.post(`/message/sendList/${INSTANCE}`, {
      number: to,
      listMessage: {
        title,
        description,
        buttonText: 'View options',
        footerText: '',
        sections,
      },
      options: { delay: 1200 },
    });
  } catch {
    // Fallback: numbered text list
    let text = title ? `*${title}*\n\n` : '';
    sections.forEach((s) => {
      s.rows.forEach((r, i) => { text += `*${i + 1}.* ${r.title}\n`; });
    });
    text += '\n_Reply with the number to choose_';
    await sendText(to, text);
  }
}

async function sendImage(to, imageUrl, caption = '') {
  try {
    await evClient.post(`/message/sendMedia/${INSTANCE}`, {
      number: to,
      mediaMessage: {
        mediatype: 'image',
        media: imageUrl,
        caption,
      },
      options: { delay: 1200 },
    });
  } catch {
    // If image fails, just send caption as text
    if (caption) await sendText(to, caption);
  }
}

module.exports = { sendText, sendButtons, sendList, sendImage };
