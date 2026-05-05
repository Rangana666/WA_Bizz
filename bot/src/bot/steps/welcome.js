const { sendButtons } = require('../messages/send');
const { t } = require('../messages/templates');
const { updateSession } = require('../../session/redis');
const { detectLang } = require('../../lang/detect');
const config = require('../../config');

async function handleWelcome(phone, messageText, session) {
  // Detect language from first message
  const lang = session.lang || detectLang(messageText) || 'en';

  await updateSession(phone, { step: 'main_menu', lang, cart: [] });

  const welcomeText = t('welcome', lang, { businessName: config.businessName });

  await sendButtons(phone, welcomeText, [
    t('main_menu_browse', lang),
    t('main_menu_orders', lang),
    t('main_menu_contact', lang),
  ]);
}

module.exports = { handleWelcome };
