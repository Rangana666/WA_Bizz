import { useState, useEffect } from 'react';
import api from '../api';

export default function Revenue() {
  const [stats, setStats] = useState(null);
  const [businesses, setBusinesses] = useState([]);

  useEffect(() => {
    Promise.all([api.get('/stats'), api.get('/businesses')]).then(([s, b]) => {
      setStats(s.data);
      setBusinesses(b.data);
    });
  }, []);

  if (!stats) return <div className="text-center py-12 text-gray-500">Loading...</div>;

  const byPlan = { starter: 0, growth: 0, pro: 0 };
  const planPrice = { starter: 350000, growth: 550000, pro: 900000 };
  businesses.filter((b) => b.billing_status === 'paid' && b.status !== 'cancelled').forEach((b) => {
    if (byPlan[b.plan] !== undefined) byPlan[b.plan]++;
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <h1 className="text-2xl font-bold text-white">Revenue</h1>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: 'MRR (LKR)', value: `Rs ${(stats.mrrLkr / 100).toLocaleString()}` },
          { label: 'Paying businesses', value: stats.paid },
          { label: 'Overdue', value: stats.overdue },
        ].map((s) => (
          <div key={s.label} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <p className="text-xs text-gray-400">{s.label}</p>
            <p className="text-2xl font-bold text-white mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Revenue by Plan</h2>
        <div className="space-y-3">
          {Object.entries(byPlan).map(([plan, count]) => {
            const revenue = count * planPrice[plan];
            const maxRevenue = Math.max(...Object.values(byPlan).map((c, i) => c * Object.values(planPrice)[i]));
            return (
              <div key={plan}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-300 capitalize">{plan}</span>
                  <span className="text-white">{count} businesses · Rs {(revenue / 100).toLocaleString()}/mo</span>
                </div>
                <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-600 rounded-full"
                    style={{ width: `${maxRevenue ? (revenue / maxRevenue) * 100 : 0}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
        <h2 className="text-sm font-semibold text-gray-300 mb-4">Projections (at 80% growth)</h2>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-gray-800">
            <th className="text-left pb-2 text-gray-400 font-medium">Businesses</th>
            <th className="text-right pb-2 text-gray-400 font-medium">MRR (LKR)</th>
            <th className="text-right pb-2 text-gray-400 font-medium">Server Cost</th>
            <th className="text-right pb-2 text-gray-400 font-medium">Net Profit</th>
          </tr></thead>
          <tbody>
            {[50, 100, 200, 500, 1000].map((n) => {
              const mrr = n * 550000;        // Rs 5,500 avg
              const cost = n * 110000;       // Rs 1,100 server
              return (
                <tr key={n} className={`border-b border-gray-800/40 ${stats.live >= n ? 'text-green-400' : 'text-gray-400'}`}>
                  <td className="py-2">{n}</td>
                  <td className="py-2 text-right">Rs {(mrr / 100).toLocaleString()}</td>
                  <td className="py-2 text-right">Rs {(cost / 100).toLocaleString()}</td>
                  <td className="py-2 text-right font-semibold">Rs {((mrr - cost) / 100).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
