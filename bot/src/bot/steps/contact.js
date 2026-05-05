const { sendText } = require('../messages/send');
const { t } = require('../messages/templates');
const { updateSession } = require('../../session/redis');
const { query } = require('../../db/postgres');

async function handleContact(phone, messageText, session) {
  const lang = session.lang || 'en';

  const res = await query(
    `SELECT business_name, owner_phone, owner_name FROM business_config LIMIT 1`
  );
  const biz = res.rows[0];

  await updateSession(phone, { step: 'main_menu' });

  await sendText(phone, t('contact_info', lang, {
    businessName: biz?.business_name || '',
    ownerName: biz?.owner_name || '',
    ownerPhone: biz?.owner_phone || '',
  }));
}

module.exports = { handleContact };
