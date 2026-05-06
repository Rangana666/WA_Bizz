import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import api from '../api';

const STATUS_COLOR = {
  new:             'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  confirmed:       'bg-blue-500/20 text-blue-400 border-blue-500/30',
  payment_pending: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  paid:            'bg-purple-500/20 text-purple-400 border-purple-500/30',
  dispatched:      'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  delivered:       'bg-green-500/20 text-green-400 border-green-500/30',
  cancelled:       'bg-red-500/20 text-red-400 border-red-500/30',
};

const STATUS_LABEL = {
  new: 'New', confirmed: 'Confirmed', payment_pending: 'Payment Pending',
  paid: 'Paid', dispatched: 'Dispatched', delivered: 'Delivered', cancelled: 'Cancelled',
};

const DELIVERY_COMPANIES = ['DHL', 'FedEx', 'Pronto', 'Kapruka', 'Lanka Parcel', 'Pick Me', 'Other'];

function StatsCard({ label, value }) {
  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
    </div>
  );
}

function OrderCard({ order, onUpdate }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tracking, setTracking] = useState({ number: '', company: 'DHL' });

  const items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]');
  const total = `Rs ${(order.total_amount / 100).toFixed(2)}`;

  async function changeStatus(status) {
    setLoading(true);
    try {
      await api.patch(`/orders/${order.id}/status`, { status });
      toast.success(`Order ${order.order_ref} → ${STATUS_LABEL[status]}`);
      onUpdate(order.id, { status });
    } catch { toast.error('Failed to update'); }
    finally { setLoading(false); }
  }

  async function sendTracking() {
    if (!tracking.number.trim()) { toast.error('Enter tracking number'); return; }
    setLoading(true);
    try {
      await api.patch(`/orders/${order.id}/tracking`, {
        trackingNumber: tracking.number.trim(),
        deliveryCompany: tracking.company,
      });
      toast.success(`Tracking sent to customer via WhatsApp ✅`);
      onUpdate(order.id, {
        status: 'dispatched',
        tracking_number: tracking.number.trim(),
        delivery_company: tracking.company,
      });
    } catch { toast.error('Failed to send tracking'); }
    finally { setLoading(false); }
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      {/* Header row */}
      <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-800/40"
        onClick={() => setOpen(!open)}>
        <div>
          <p className="font-semibold text-white">{order.order_ref}</p>
          <p className="text-sm text-gray-400">
            {order.customer_name || order.phone} · {total}
            {order.payment_method && (
              <span className="ml-2 text-xs text-gray-600">
                · {order.payment_method.replace('_', ' ')}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${STATUS_COLOR[order.status]}`}>
            {STATUS_LABEL[order.status]}
          </span>
          <span className="text-gray-500">{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {/* Expanded detail */}
      {open && (
        <div className="border-t border-gray-800 px-4 pb-4 pt-3 space-y-3">

          {/* Items */}
          <div>
            <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Items</p>
            {items.map((item, i) => (
              <p key={i} className="text-sm text-white">
                {item.name}
                {item.color ? ` · ${item.color}` : ''}
                {item.size ? ` [${item.size}]` : ''}
                {` × ${item.qty}`} —{' '}
                Rs {((item.unitPrice * item.qty) / 100).toFixed(2)}
              </p>
            ))}
          </div>

          {/* Delivery address */}
          {order.delivery_address && (
            <div>
              <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Delivery address</p>
              <p className="text-sm text-white">{order.delivery_address}</p>
            </div>
          )}

          {/* Existing tracking info */}
          {order.tracking_number && (
            <div className="bg-cyan-900/20 border border-cyan-500/30 rounded-lg p-3">
              <p className="text-xs text-cyan-400 mb-1">📦 Dispatched via {order.delivery_company}</p>
              <p className="text-sm text-white font-mono">Tracking: {order.tracking_number}</p>
            </div>
          )}

          {/* Timestamp */}
          <p className="text-xs text-gray-600">
            Ordered: {new Date(order.created_at).toLocaleString()}
          </p>

          {/* ── Action buttons ── */}
          <div className="flex flex-wrap gap-2 pt-1">
            {order.status === 'new' && (
              <>
                <button onClick={() => changeStatus('confirmed')} disabled={loading}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg disabled:opacity-50">
                  ✅ Confirm order
                </button>
                <button onClick={() => changeStatus('cancelled')} disabled={loading}
                  className="px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white text-sm rounded-lg disabled:opacity-50">
                  ❌ Cancel
                </button>
              </>
            )}

            {order.status === 'delivered' && (
              <span className="text-sm text-green-400">✅ Delivered</span>
            )}
          </div>

          {/* ── Tracking number entry (confirmed or paid orders) ── */}
          {(order.status === 'confirmed' || order.status === 'paid') && !order.tracking_number && (
            <div className="border border-gray-700 rounded-xl p-3 bg-gray-800/40 space-y-2">
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide">
                🚚 Hand to delivery company
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Delivery company</label>
                  <select
                    value={tracking.company}
                    onChange={(e) => setTracking((t) => ({ ...t, company: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500">
                    {DELIVERY_COMPANIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Tracking number</label>
                  <input
                    value={tracking.number}
                    onChange={(e) => setTracking((t) => ({ ...t, number: e.target.value }))}
                    placeholder="e.g. DHL1234567890"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                  />
                </div>
              </div>
              <button
                onClick={sendTracking}
                disabled={loading || !tracking.number.trim()}
                className="w-full py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg">
                {loading ? 'Sending...' : '📲 Send tracking to customer via WhatsApp'}
              </button>
              <p className="text-xs text-gray-600">
                Customer will receive the tracking number on WhatsApp automatically.
              </p>
            </div>
          )}

          {/* Mark delivered (dispatched orders) */}
          {order.status === 'dispatched' && (
            <button onClick={() => changeStatus('delivered')} disabled={loading}
              className="w-full py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg">
              📦 Mark as delivered
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const FILTERS = ['', 'new', 'confirmed', 'dispatched', 'delivered', 'cancelled'];

export default function Dashboard() {
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  async function fetchAll(status = filter) {
    const [oRes, sRes] = await Promise.all([
      api.get('/orders', { params: status ? { status } : {} }),
      api.get('/dashboard/stats'),
    ]);
    setOrders(oRes.data);
    setStats(sRes.data);
  }

  useEffect(() => {
    fetchAll().finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    const socket = io({ path: '/socket.io' });
    socket.on('new_order', (order) => setOrders((prev) => [order, ...prev]));
    socket.on('order_updated', ({ id, status }) =>
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)))
    );
    return () => socket.disconnect();
  }, []);

  function handleUpdate(id, changes) {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, ...changes } : o)));
  }

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-bold text-white">Orders</h1>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatsCard label="Today's orders" value={stats.totalOrders} />
          <StatsCard label="Revenue today" value={`Rs ${(stats.totalRevenue / 100).toFixed(0)}`} />
          <StatsCard label="Delivered" value={stats.delivered} />
          <StatsCard label="Pending" value={stats.pending} />
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((s) => (
          <button key={s || 'all'} onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === s
                ? 'bg-green-700 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}>
            {s ? STATUS_LABEL[s] : 'All'}
          </button>
        ))}
      </div>

      {/* Orders list */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading orders...</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No {filter ? STATUS_LABEL[filter].toLowerCase() : ''} orders yet.
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} onUpdate={handleUpdate} />
          ))}
        </div>
      )}
    </div>
  );
}
