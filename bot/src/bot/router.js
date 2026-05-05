const { getSession, setSession } = require('../session/redis');
const { sendText } = require('./messages/send');
const { t } = require('./messages/templates');
const { detectLang } = require('../lang/detect');
const config = require('../config');

const { handleWelcome } = require('./steps/welcome');
const { handleBrowse, handleSelectCategory } = require('./steps/browse');
const { handleSelectProduct } = require('./steps/product');
const { handleSelectColor } = require('./steps/color');
const { handleSelectSize } = require('./steps/size');
const { handleSelectQuantity, handleEnterQuantity } = require('./steps/quantity');
const { handleCollectName } = require('./steps/collect_name');
const { handleCollectAddress } = require('./steps/collect_address');
const { handleConfirmOrder } = require('./steps/confirm_order');
const { handleMyOrders } = require('./steps/my_orders');
const { handleSelectPayment } = require('./steps/select_payment');
const { handleContact } = require('./steps/contact');

const BROWSE_TRIGGERS = [
  'browse', 'products', 'shop', 'buy',
  'නිෂ්පාදන', 'බලන්න',
  'பொருட்கள்', 'உலாவுக',
  '🛍',
];
const ORDERS_TRIGGERS = [
  'my orders', 'orders', 'order status',
  'ඇණවුම්', 'මගේ',
  'ஆர்டர்', 'என்',
  '📦',
];
const CONTACT_TRIGGERS = [
  'contact', 'contact us', 'phone', 'call',
  'අමතන්න', 'දුරකථනය',
  'தொடர்பு', 'போன்',
  '📞',
];

function matchesTrigger(text, triggers) {
  const lower = text.toLowerCase();
  return triggers.some((kw) => lower.includes(kw));
}

async function routeMessage(phone, messageText) {
  if (!config.bot.active) {
    await sendText(phone, t('bot_inactive', 'en'));
    return;
  }

  let session = await getSession(phone);

  // New conversation or timed-out session
  if (!session) {
    const lang = detectLang(messageText);
    session = { step: 'welcome', lang, cart: [] };
    await setSession(phone, session);
  }

  // Detect language on first message if not set
  if (!session.lang) {
    session.lang = detectLang(messageText) || 'en';
  }

  // Global shortcuts from any step
  const lower = messageText.trim().toLowerCase();
  if (session.step !== 'welcome' && matchesTrigger(lower, BROWSE_TRIGGERS)) {
    await handleBrowse(phone, messageText, session);
    return;
  }
  if (session.step !== 'welcome' && matchesTrigger(lower, ORDERS_TRIGGERS)) {
    await handleMyOrders(phone, messageText, session);
    return;
  }
  if (session.step !== 'welcome' && matchesTrigger(lower, CONTACT_TRIGGERS)) {
    await handleContact(phone, messageText, session);
    return;
  }

  switch (session.step) {
    case 'welcome':
      await handleWelcome(phone, messageText, session);
      break;

    case 'main_menu':
      if (matchesTrigger(lower, BROWSE_TRIGGERS)) {
        await handleBrowse(phone, messageText, session);
      } else if (matchesTrigger(lower, ORDERS_TRIGGERS)) {
        await handleMyOrders(phone, messageText, session);
      } else if (matchesTrigger(lower, CONTACT_TRIGGERS)) {
        await handleContact(phone, messageText, session);
      } else {
        await handleWelcome(phone, messageText, session);
      }
      break;

    case 'select_category':
      await handleSelectCategory(phone, messageText, session);
      break;

    case 'select_product':
      await handleSelectProduct(phone, messageText, session);
      break;

    case 'select_color':
      await handleSelectColor(phone, messageText, session);
      break;

    case 'select_size':
      await handleSelectSize(phone, messageText, session);
      break;

    case 'select_quantity':
      await handleSelectQuantity(phone, messageText, session);
      break;

    case 'enter_quantity':
      await handleEnterQuantity(phone, messageText, session);
      break;

    case 'collect_name':
      await handleCollectName(phone, messageText, session);
      break;

    case 'collect_address':
      await handleCollectAddress(phone, messageText, session);
      break;

    case 'confirm_order':
      await handleConfirmOrder(phone, messageText, session);
      break;

    case 'select_payment':
      await handleSelectPayment(phone, messageText, session);
      break;

    default:
      await handleWelcome(phone, messageText, session);
  }
}

module.exports = { routeMessage };
