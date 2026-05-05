const { franc } = require('franc-min');

const LANG_MAP = {
  sin: 'si',
  tam: 'ta',
  eng: 'en',
};

const SINHALA_REGEX = /[඀-෿]/;
const TAMIL_REGEX = /[஀-௿]/;

function detectLang(text) {
  if (!text || text.trim().length === 0) return 'en';

  // Script-based detection is more reliable for short messages
  if (SINHALA_REGEX.test(text)) return 'si';
  if (TAMIL_REGEX.test(text)) return 'ta';

  const detected = franc(text, { minLength: 3, only: ['sin', 'tam', 'eng'] });
  return LANG_MAP[detected] || 'en';
}

module.exports = { detectLang };
