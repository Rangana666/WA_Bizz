const { sendText } = require('../messages/send');
const { t } = require('../messages/templates');
const { updateSession } = require('../../session/redis');

async function handleCollectName(phone, messageText, session) {
  const lang = session.lang || 'en';
  const name = messageText.trim();

  if (name.length < 2) {
    await sendText(phone, t('enter_name', lang));
    return;
  }

  await updateSession(phone, { step: 'collect_address', name });
  await sendText(phone, t('enter_address', lang));
}

module.exports = { handleCollectName };
