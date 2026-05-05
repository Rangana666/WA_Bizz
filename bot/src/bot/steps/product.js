const { sendText, sendImage, sendButtons } = require('../messages/send');
const { t, buildProductDetailText } = require('../messages/templates');
const { updateSession } = require('../../session/redis');
const productDb = require('../../db/products');

async function handleSelectProduct(phone, messageText, session) {
  const lang = session.lang || 'en';
  const code = messageText.trim().toUpperCase();

  const product = await productDb.getByCode(code);

  if (!product) {
    await sendText(phone, t('product_not_found', lang));
    return;
  }

  if (product.stock === 0) {
    await sendText(phone, t('out_of_stock', lang));
    return;
  }

  await updateSession(phone, {
    step: product.has_colors ? 'select_color' : (product.has_sizes ? 'select_size' : 'select_quantity'),
    selectedProduct: product.product_code,
    selectedProductId: product.id,
    selectedProductName: product[`name_${lang}`] || product.name_en,
    selectedProductPrice: product.price,
    selectedColor: null,
    selectedSize: null,
  });

  const detailText = buildProductDetailText(product, lang);

  if (product.image_url) {
    await sendImage(phone, product.image_url, detailText);
  } else {
    await sendText(phone, detailText);
  }

  if (product.has_colors) {
    await sendButtons(phone, t('choose_color', lang), product.colors.slice(0, 3));
  } else if (product.has_sizes) {
    await sendButtons(phone, t('choose_size', lang), product.sizes.slice(0, 3));
  } else {
    await sendButtons(phone, t('choose_quantity', lang), ['1', '2', '3', t('other_qty', lang)]);
  }
}

module.exports = { handleSelectProduct };
