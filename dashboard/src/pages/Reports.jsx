import { useState, useEffect } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  LineElement, PointElement, Tooltip, Legend, Filler,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import api from '../api';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend, Filler);

const CHART_OPTS = {
  responsive: true,
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { color: '#1f2937' }, ticks: { color: '#6b7280' } },
    y: { grid: { color: '#1f2937' }, ticks: { color: '#6b7280' } },
  },
};

function StatBox({ label, value, sub }) {
  return (
    <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-2xl font-bold text-white mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

// ── DAILY REPORT ──────────────────────────────────────────────────────────────
function DailyReport() {
  const [orders, setOrders] = useState([]);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get('/orders', { params: { date } })
      .then(({ data }) => setOrders(data))
      .finally(() => setLoading(false));
  }, [date]);

  const delivered  = orders.filter((o) => o.status === 'delivered');
  const cancelled  = orders.filter((o) => o.status === 'cancelled');
  const pending    = orders.filter((o) => ['new', 'confirmed', 'dispatched'].includes(o.status));
  const revenue    = delivered.reduce((s, o) => s + o.total_amount, 0);
  const totalAll   = orders.reduce((s, o) => s + o.total_amount, 0);

  // Orders by payment method
  const byMethod = orders.reduce((acc, o) => {
    const m = o.payment_method || 'unknown';
    acc[m] = (acc[m] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {/* Date picker */}
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-400">Date:</label>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500" />
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatBox label="Total orders"    value={orders.length} />
            <StatBox label="Revenue (delivered)" value={`Rs ${(revenue / 100).toLocaleString()}`} />
            <StatBox label="Delivered"       value={delivered.length} />
            <StatBox label="Pending / Dispatched" value={pending.length} />
          </div>

          {/* Payment method breakdown */}
          {Object.keys(byMethod).length > 0 && (
            <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
              <p className="text-sm font-semibold text-gray-300 mb-3">Payment Methods</p>
              <div className="flex gap-4 flex-wrap">
                {Object.entries(byMethod).map(([method, count]) => (
                  <div key={method} className="text-center">
                    <p className="text-lg font-bold text-white">{count}</p>
                    <p className="text-xs text-gray-400 capitalize">{method.replace('_', ' ')}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Orders table */}
          {orders.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No orders on {date}</div>
          ) : (
            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Order</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Customer</th>
                    <th className="text-left px-4 py-3 text-gray-400 font-medium">Status</th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">Amount</th>
                    <th className="text-right px-4 py-3 text-gray-400 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id} className="border-b border-gray-800/40">
                      <td className="px-4 py-2.5 font-mono text-xs text-white">{o.order_ref}</td>
                      <td className="px-4 py-2.5 text-gray-300">{o.customer_name || o.phone}</td>
                      <td className="px-4 py-2.5 text-gray-400 capitalize">{o.status}</td>
                      <td className="px-4 py-2.5 text-right text-white">
                        Rs {(o.total_amount / 100).toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500 text-xs">
                        {new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-700">
                    <td colSpan={3} className="px-4 py-2.5 text-sm text-gray-400 font-semibold">Total</td>
                    <td className="px-4 py-2.5 text-right text-white font-bold">
                      Rs {(totalAll / 100).toLocaleString()}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── MONTHLY REPORT ────────────────────────────────────────────────────────────
function MonthlyReport() {
  const [monthly, setMonthly] = useState([]);
  const [allOrders, setAllOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/analytics/monthly', { params: { months: 6 } }),
      api.get('/orders'),
    ]).then(([mRes, oRes]) => {
      setMonthly(mRes.data);
      setAllOrders(oRes.data);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-8 text-gray-500">Loading...</div>;

  const totalRevenue  = allOrders.filter((o) => o.status === 'delivered')
    .reduce((s, o) => s + o.total_amount, 0);
  const totalOrders   = allOrders.length;
  const totalDelivered = allOrders.filter((o) => o.status === 'delivered').length;
  const totalCancelled = allOrders.filter((o) => o.status === 'cancelled').length;

  const labels    = monthly.map((m) => m.month);
  const revenues  = monthly.map((m) => (m.total_revenue / 100).toFixed(2));
  const orderCounts = monthly.map((m) => parseInt(m.total_orders));

  const revenueChart = {
    labels,
    datasets: [{
      data: revenues,
      backgroundColor: 'rgba(34,197,94,0.15)',
      borderColor: '#22c55e',
      borderWidth: 2,
      fill: true,
      tension: 0.3,
    }],
  };

  const ordersChart = {
    labels,
    datasets: [{
      data: orderCounts,
      backgroundColor: 'rgba(99,102,241,0.7)',
      borderRadius: 4,
    }],
  };

  return (
    <div className="space-y-5">
      {/* All-time summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatBox label="Total revenue" value={`Rs ${(totalRevenue / 100).toLocaleString()}`} sub="All time" />
        <StatBox label="Total orders"  value={totalOrders}   sub="All time" />
        <StatBox label="Delivered"     value={totalDelivered} sub="All time" />
        <StatBox label="Cancelled"     value={totalCancelled} sub="All time" />
      </div>

      {/* Revenue chart */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Revenue — last 6 months (LKR)</h3>
        {monthly.length === 0
          ? <p className="text-center text-gray-600 py-6">No data yet</p>
          : <Line data={revenueChart} options={CHART_OPTS} height={90} />
        }
      </div>

      {/* Orders chart */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">Orders per month — last 6 months</h3>
        {monthly.length === 0
          ? <p className="text-center text-gray-600 py-6">No data yet</p>
          : <Bar data={ordersChart} options={CHART_OPTS} height={90} />
        }
      </div>

      {/* Monthly breakdown table */}
      {monthly.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Month</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">Orders</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">Delivered</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">Revenue</th>
              </tr>
            </thead>
            <tbody>
              {[...monthly].reverse().map((m) => (
                <tr key={m.month} className="border-b border-gray-800/40">
                  <td className="px-4 py-2.5 text-white font-medium">{m.month}</td>
                  <td className="px-4 py-2.5 text-right text-gray-300">{m.total_orders}</td>
                  <td className="px-4 py-2.5 text-right text-green-400">{m.delivered}</td>
                  <td className="px-4 py-2.5 text-right text-white">
                    Rs {(m.total_revenue / 100).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── MAIN PAGE ─────────────────────────────────────────────────────────────────
export default function Reports() {
  const [tab, setTab] = useState('daily');

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Reports</h1>
        <div className="flex gap-2 bg-gray-900 border border-gray-800 rounded-xl p-1">
          <button onClick={() => setTab('daily')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === 'daily' ? 'bg-green-700 text-white' : 'text-gray-400 hover:text-white'
            }`}>
            📅 Daily
          </button>
          <button onClick={() => setTab('monthly')}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === 'monthly' ? 'bg-green-700 text-white' : 'text-gray-400 hover:text-white'
            }`}>
            📆 Monthly
          </button>
        </div>
      </div>

      {tab === 'daily' ? <DailyReport /> : <MonthlyReport />}
    </div>
  );
}
