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

async function sendText(to, text) {
  await evClient.post(`/message/sendText/${INSTANCE}`, {
    number: to,
    text,
    delay: 1000,
  });
}

async function sendButtons(to, bodyText, buttons, footerText = '') {
  // Evolution API v2 button message
  await evClient.post(`/message/sendButtons/${INSTANCE}`, {
    number: to,
    buttonMessage: {
      text: bodyText,
      footer: footerText,
      buttons: buttons.map((b, i) => ({
        buttonId: String(i + 1),
        buttonText: { displayText: b },
        type: 1,
      })),
    },
  });
}

async function sendList(to, title, description, sections) {
  await evClient.post(`/message/sendList/${INSTANCE}`, {
    number: to,
    listMessage: {
      title,
      description,
      buttonText: '📋 View options',
      footerText: '',
      sections,
    },
  });
}

async function sendImage(to, imageUrl, caption = '') {
  await evClient.post(`/message/sendMedia/${INSTANCE}`, {
    number: to,
    mediaMessage: {
      mediatype: 'image',
      media: imageUrl,
      caption,
    },
  });
}

module.exports = { sendText, sendButtons, sendList, sendImage };
