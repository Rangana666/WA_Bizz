const { sendButtons } = require('../messages/send');
const { t, buildOrderSummaryText } = require('../messages/templates');
const { updateSession } = require('../../session/redis');

async function handleCollectAddress(phone, messageText, session) {
  const lang = session.lang || 'en';
  const address = messageText.trim();

  if (address.length < 5) {
    const { sendText } = require('../messages/send');
    await sendText(phone, t('enter_address', lang));
    return;
  }

  await updateSession(phone, { step: 'confirm_order', address });

  const summaryText = buildOrderSummaryText({ ...session, address }, lang);
  await sendButtons(phone, summaryText, [
    t('confirm_order', lang),
    t('cancel_order', lang),
  ]);
}

module.exports = { handleCollectAddress };
