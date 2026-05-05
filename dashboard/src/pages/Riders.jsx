import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api';

export default function Riders() {
  const [riders, setRiders] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '' });
  const [saving, setSaving] = useState(false);
  const [assigning, setAssigning] = useState(null);

  async function fetchData() {
    const [rRes, oRes] = await Promise.all([
      api.get('/riders'),
      api.get('/orders', { params: { status: 'confirmed' } }),
    ]);
    setRiders(rRes.data);
    setOrders(oRes.data);
  }

  useEffect(() => { fetchData().finally(() => setLoading(false)); }, []);

  async function saveRider(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/riders', form);
      toast.success('Rider added');
      setForm({ name: '', phone: '' });
      setShowForm(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save rider');
    } finally {
      setSaving(false);
    }
  }

  async function toggleRider(rider) {
    await api.put(`/riders/${rider.id}`, { is_active: !rider.is_active });
    fetchData();
  }

  async function assignRider(orderId, riderId) {
    setAssigning(orderId);
    try {
      await api.patch(`/orders/${orderId}/assign-rider`, { riderId });
      toast.success('Rider assigned — customer & rider notified via WhatsApp');
      fetchData();
    } catch {
      toast.error('Failed to assign rider');
    } finally {
      setAssigning(null);
    }
  }

  const activeRiders = riders.filter((r) => r.is_active);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Delivery Riders</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg"
        >
          + Add rider
        </button>
      </div>

      {/* Add rider form */}
      {showForm && (
        <form onSubmit={saveRider} className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
          <h2 className="font-semibold text-white mb-4">New Rider</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Name *</label>
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nimal Perera"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">WhatsApp phone *</label>
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-brand-500"
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                placeholder="+94771234567"
                required
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button type="submit" disabled={saving}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg">
              {saving ? 'Saving...' : 'Add rider'}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="px-4 py-2 bg-gray-800 text-gray-300 text-sm rounded-lg hover:bg-gray-700">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Riders list */}
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Your Riders ({activeRiders.length} active)
          </h2>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : riders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No riders yet. Add one above.</div>
          ) : (
            <div className="space-y-2">
              {riders.map((r) => (
                <div
                  key={r.id}
                  className={`flex items-center justify-between p-3 rounded-xl border ${
                    r.is_active ? 'border-gray-800 bg-gray-900' : 'border-gray-800/50 bg-gray-900/50 opacity-60'
                  }`}
                >
                  <div>
                    <p className="font-medium text-white">{r.name}</p>
                    <p className="text-xs text-gray-400">{r.phone} · {r.total_deliveries} deliveries</p>
                  </div>
                  <button
                    onClick={() => toggleRider(r)}
                    className={`text-xs px-3 py-1.5 rounded-lg ${
                      r.is_active
                        ? 'bg-red-900/40 text-red-400 hover:bg-red-900/70'
                        : 'bg-green-900/40 text-green-400 hover:bg-green-900/70'
                    }`}
                  >
                    {r.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Assign riders to confirmed orders */}
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Assign to Confirmed Orders ({orders.length})
          </h2>
          {orders.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              No confirmed orders waiting for dispatch.
            </div>
          ) : (
            <div className="space-y-2">
              {orders.map((order) => (
                <div key={order.id} className="bg-gray-900 rounded-xl border border-gray-800 p-3">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <p className="font-semibold text-white text-sm">{order.order_ref}</p>
                      <p className="text-xs text-gray-400">{order.customer_name || order.phone}</p>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{order.delivery_address}</p>
                    </div>
                    <span className="text-xs text-green-400 font-semibold">
                      Rs {(order.total_amount / 100).toFixed(2)}
                    </span>
                  </div>

                  {activeRiders.length === 0 ? (
                    <p className="text-xs text-gray-600">No active riders available</p>
                  ) : (
                    <div className="flex gap-2 flex-wrap">
                      {activeRiders.map((r) => (
                        <button
                          key={r.id}
                          onClick={() => assignRider(order.id, r.id)}
                          disabled={assigning === order.id}
                          className="px-2.5 py-1 bg-brand-600/80 hover:bg-brand-600 disabled:opacity-50 text-white text-xs rounded-lg"
                        >
                          {assigning === order.id ? '...' : `🚚 ${r.name}`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
