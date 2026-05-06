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
  // Evolution API v1.x button format (max 3 buttons)
  const btnList = buttons.slice(0, 3);
  try {
    await evClient.post(`/message/sendButtons/${INSTANCE}`, {
      number: to,
      buttonMessage: {
        text: bodyText,
        footer: footerText,
        buttons: btnList.map((b, i) => ({
          buttonId: String(i + 1),
          buttonText: { displayText: b },
          type: 1,
        })),
      },
      options: { delay: 1200 },
    });
  } catch {
    // Fallback: send as plain text if buttons fail
    const lines = btnList.map((b, i) => `${i + 1}. ${b}`).join('\n');
    await sendText(to, `${bodyText}\n\n${lines}`);
  }
}

async function sendList(to, title, description, sections) {
  try {
    await evClient.post(`/message/sendList/${INSTANCE}`, {
      number: to,
      listMessage: {
        title,
        description,
        buttonText: '📋 View options',
        footerText: '',
        sections,
      },
      options: { delay: 1200 },
    });
  } catch {
    // Fallback: send as plain text
    const lines = sections.flatMap((s) =>
      s.rows.map((r, i) => `${i + 1}. ${r.title}`)
    ).join('\n');
    await sendText(to, `${title}\n\n${lines}\n\nReply with your choice.`);
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
