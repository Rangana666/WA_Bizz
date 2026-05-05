let _io = null;

function init(io) {
  _io = io;
}

function notifyNewOrder(order, customer) {
  if (!_io) return;
  _io.emit('new_order', {
    id: order.id,
    orderRef: order.order_ref,
    status: order.status,
    totalAmount: order.total_amount,
    items: order.items,
    deliveryAddress: order.delivery_address,
    customer: {
      phone: customer.phone,
      name: customer.name,
    },
    createdAt: order.created_at,
  });
}

function notifyOrderUpdated(order) {
  if (!_io) return;
  _io.emit('order_updated', {
    id: order.id,
    orderRef: order.order_ref,
    status: order.status,
    updatedAt: order.updated_at,
  });
}

function notifyWhatsappStatus(connected) {
  if (!_io) return;
  _io.emit('whatsapp_status', { connected });
}

module.exports = { init, notifyNewOrder, notifyOrderUpdated, notifyWhatsappStatus };
