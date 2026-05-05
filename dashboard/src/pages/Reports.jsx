import { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import api from '../api';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Tooltip, Legend, Filler);

const CHART_DEFAULTS = {
  responsive: true,
  plugins: { legend: { display: false } },
  scales: {
    x: { grid: { color: '#1f2937' }, ticks: { color: '#6b7280' } },
    y: { grid: { color: '#1f2937' }, ticks: { color: '#6b7280' } },
  },
};

export default function Reports() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/orders').then(({ data }) => {
      setOrders(data);
    }).finally(() => setLoading(false));
  }, []);

  // Build daily revenue for last 14 days
  const last14Days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    return d.toISOString().slice(0, 10);
  });

  const revenueByDay = {};
  const ordersByDay = {};
  last14Days.forEach((d) => { revenueByDay[d] = 0; ordersByDay[d] = 0; });

  orders.forEach((o) => {
    const day = new Date(o.created_at).toISOString().slice(0, 10);
    if (revenueByDay[day] !== undefined) {
      revenueByDay[day] += o.total_amount / 100;
      ordersByDay[day] += 1;
    }
  });

  const labels = last14Days.map((d) => d.slice(5));

  const revenueChart = {
    labels,
    datasets: [{
      data: last14Days.map((d) => revenueByDay[d]),
      backgroundColor: 'rgba(34, 197, 94, 0.2)',
      borderColor: '#22c55e',
      borderWidth: 2,
      fill: true,
      tension: 0.3,
    }],
  };

  const ordersChart = {
    labels,
    datasets: [{
      data: last14Days.map((d) => ordersByDay[d]),
      backgroundColor: 'rgba(99, 102, 241, 0.7)',
      borderRadius: 4,
    }],
  };

  const totalRevenue = orders.reduce((s, o) => s + o.total_amount, 0) / 100;
  const deliveredOrders = orders.filter((o) => o.status === 'delivered').length;
  const cancelledOrders = orders.filter((o) => o.status === 'cancelled').length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Reports</h1>

      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <p className="text-xs text-gray-400">Total revenue</p>
              <p className="text-xl font-bold text-white mt-1">Rs {totalRevenue.toFixed(0)}</p>
            </div>
            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <p className="text-xs text-gray-400">Delivered orders</p>
              <p className="text-xl font-bold text-white mt-1">{deliveredOrders}</p>
            </div>
            <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
              <p className="text-xs text-gray-400">Cancelled</p>
              <p className="text-xl font-bold text-white mt-1">{cancelledOrders}</p>
            </div>
          </div>

          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
            <h2 className="text-base font-semibold text-white mb-4">Revenue (last 14 days)</h2>
            <Line data={revenueChart} options={CHART_DEFAULTS} height={100} />
          </div>

          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
            <h2 className="text-base font-semibold text-white mb-4">Orders per day (last 14 days)</h2>
            <Bar data={ordersChart} options={CHART_DEFAULTS} height={100} />
          </div>
        </>
      )}
    </div>
  );
}
