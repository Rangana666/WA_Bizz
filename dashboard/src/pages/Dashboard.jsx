import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import api from '../api';

const STATUS_COLORS = {
  new: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  confirmed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  payment_pending: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  paid: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  dispatched: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  delivered: 'bg-green-500/20 text-green-400 border-green-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const STATUS_LABELS = {
  new: 'New',
  confirmed: 'Confirmed',
  payment_pending: 'Payment pending',
  paid: 'Paid',
  dispatched: 'Dispatched',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

function StatsCard({ label, value, sub }) {
  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

const PAYMENT_METHOD_LABELS = {
  payhere: '💳 PayHere',
  bank_transfer: '🏦 Bank Transfer',
  cash_on_delivery: '💵 Cash on Delivery',
};

function OrderCard({ order, onStatusChange }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [payRef, setPayRef] = useState('');
  const [showPayRef, setShowPayRef] = useState(false);

  async function changeStatus(status) {
    setLoading(true);
    try {
      await api.patch(`/orders/${order.id}/status`, { status });
      toast.success(`Order ${order.order_ref} → ${STATUS_LABELS[status]}`);
      onStatusChange(order.id, status);
    } catch {
      toast.error('Failed to update order');
    } finally {
      setLoading(false);
    }
  }

  async function handleMarkPaid() {
    setMarkingPaid(true);
    try {
      await api.post(`/orders/${order.id}/mark-paid`, { paymentRef: payRef || undefined });
      toast.success(`Order ${order.order_ref} marked as paid`);
      onStatusChange(order.id, 'paid');
      setShowPayRef(false);
    } catch {
      toast.error('Failed to mark as paid');
    } finally {
      setMarkingPaid(false);
    }
  }

  const items = Array.isArray(order.items) ? order.items : JSON.parse(order.items || '[]');
  const total = `Rs ${(order.total_amount / 100).toFixed(2)}`;
  const canMarkPaid = ['new', 'confirmed', 'payment_pending'].includes(order.status);

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-800/50 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div>
          <p className="font-semibold text-white">{order.order_ref}</p>
          <p className="text-sm text-gray-400">
            {order.customer_name || order.phone} · {total}
            {order.payment_method && (
              <span className="ml-2 text-xs text-gray-500">
                · {PAYMENT_METHOD_LABELS[order.payment_method] || order.payment_method}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${STATUS_COLORS[order.status]}`}>
            {STATUS_LABELS[order.status]}
          </span>
          <span className="text-gray-500 text-sm">{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div className="px-4 pb-4 border-t border-gray-800 pt-4 space-y-3">
          <div>
            <p className="text-xs text-gray-400 mb-1">Items</p>
            {items.map((item, i) => (
              <p key={i} className="text-sm text-white">
                {item.name}
                {item.color ? ` · ${item.color}` : ''}
                {item.size ? ` [${item.size}]` : ''}
                {' '}× {item.qty} — Rs {((item.unitPrice * item.qty) / 100).toFixed(2)}
              </p>
            ))}
          </div>

          {order.delivery_address && (
            <div>
              <p className="text-xs text-gray-400 mb-1">Delivery address</p>
              <p className="text-sm text-white">{order.delivery_address}</p>
            </div>
          )}

          <div className="flex gap-6 text-xs text-gray-500">
            <span>Ordered {new Date(order.created_at).toLocaleString()}</span>
            {order.payment_ref && <span>Ref: {order.payment_ref}</span>}
          </div>

          {/* Mark as paid (manual) for bank/COD */}
          {canMarkPaid && (
            <div className="border border-gray-700 rounded-lg p-3 bg-gray-800/50">
              <p className="text-xs text-gray-400 mb-2">Manual payment confirmation</p>
              {showPayRef ? (
                <div className="flex gap-2">
                  <input
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    placeholder="Payment ref (optional)"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-brand-500"
                  />
                  <button
                    onClick={handleMarkPaid}
                    disabled={markingPaid}
                    className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-lg disabled:opacity-50"
                  >
                    {markingPaid ? '...' : '✅ Confirm paid'}
                  </button>
                  <button
                    onClick={() => setShowPayRef(false)}
                    className="px-3 py-1.5 bg-gray-700 text-gray-300 text-sm rounded-lg"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowPayRef(true)}
                  className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg"
                >
                  💰 Mark as paid
                </button>
              )}
            </div>
          )}

          {/* Status action buttons */}
          <div className="flex flex-wrap gap-2 pt-1">
            {order.status === 'new' && (
              <>
                <button
                  onClick={() => changeStatus('confirmed')}
                  disabled={loading}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg disabled:opacity-50"
                >
                  ✅ Confirm
                </button>
                <button
                  onClick={() => changeStatus('cancelled')}
                  disabled={loading}
                  className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg disabled:opacity-50"
                >
                  ❌ Reject
                </button>
              </>
            )}
            {order.status === 'confirmed' && (
              <button
                onClick={() => changeStatus('dispatched')}
                disabled={loading}
                className="px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-sm rounded-lg disabled:opacity-50"
              >
                🚚 Mark dispatched
              </button>
            )}
            {order.status === 'dispatched' && (
              <button
                onClick={() => changeStatus('delivered')}
                disabled={loading}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg disabled:opacity-50"
              >
                📦 Mark delivered
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [orders, setOrders] = useState([]);
  const [stats, setStats] = useState(null);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchOrders = useCallback(async () => {
    const params = filter ? { status: filter } : {};
    const { data } = await api.get('/orders', { params });
    setOrders(data);
  }, [filter]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const [ordersRes, statsRes] = await Promise.all([
          api.get('/orders', { params: filter ? { status: filter } : {} }),
          api.get('/dashboard/stats'),
        ]);
        setOrders(ordersRes.data);
        setStats(statsRes.data);
      } catch {
        toast.error('Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [filter]);

  useEffect(() => {
    const socket = io({ path: '/socket.io' });
    socket.on('new_order', (order) => {
      setOrders((prev) => [order, ...prev]);
    });
    socket.on('order_updated', ({ id, status }) => {
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
    });
    return () => socket.disconnect();
  }, []);

  function handleStatusChange(id, status) {
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
  }

  const filterOptions = ['', 'new', 'confirmed', 'dispatched', 'delivered', 'cancelled'];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Orders</h1>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatsCard label="Today's orders" value={stats.totalOrders} />
          <StatsCard label="Revenue today" value={`Rs ${(stats.totalRevenue / 100).toFixed(0)}`} />
          <StatsCard label="Delivered" value={stats.delivered} />
          <StatsCard label="Pending" value={stats.pending} />
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2 flex-wrap">
        {filterOptions.map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === s
                ? 'bg-brand-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
          >
            {s ? STATUS_LABELS[s] : 'All'}
          </button>
        ))}
      </div>

      {/* Orders list */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading orders...</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No orders {filter ? `with status "${STATUS_LABELS[filter]}"` : 'yet'}.
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} onStatusChange={handleStatusChange} />
          ))}
        </div>
      )}
    </div>
  );
}
