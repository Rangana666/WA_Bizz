import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api';

const STATUS_DOT = {
  live: 'bg-green-500',
  suspended: 'bg-red-500',
  provisioning: 'bg-yellow-400 animate-pulse',
  bootstrapping: 'bg-yellow-400 animate-pulse',
  verifying: 'bg-yellow-400 animate-pulse',
  failed: 'bg-red-700',
  pending: 'bg-gray-500',
  cancelled: 'bg-gray-700',
};

const BILLING_BADGE = {
  paid: 'bg-green-500/20 text-green-400',
  trial: 'bg-blue-500/20 text-blue-400',
  overdue: 'bg-red-500/20 text-red-400',
  cancelled: 'bg-gray-500/20 text-gray-400',
};

export default function Businesses() {
  const [businesses, setBusinesses] = useState([]);
  const [stats, setStats] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.get('/businesses'), api.get('/stats')])
      .then(([bRes, sRes]) => {
        setBusinesses(bRes.data);
        setStats(sRes.data);
      })
      .catch(() => toast.error('Failed to load fleet'))
      .finally(() => setLoading(false));

    // Auto-refresh every 30s
    const interval = setInterval(() => {
      api.get('/businesses').then(({ data }) => setBusinesses(data)).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const filtered = businesses.filter((b) =>
    b.business_name.toLowerCase().includes(search.toLowerCase()) ||
    b.subdomain.includes(search.toLowerCase()) ||
    b.biz_id.includes(search.toLowerCase())
  );

  const minutesSince = (ts) => {
    if (!ts) return null;
    return Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Fleet Overview</h1>
        <span className="text-xs text-gray-500">Auto-refreshes every 30s</span>
      </div>

      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {[
            { label: 'Total', value: stats.total },
            { label: 'Live', value: stats.live, color: 'text-green-400' },
            { label: 'Provisioning', value: stats.provisioning, color: 'text-yellow-400' },
            { label: 'Suspended', value: stats.suspended, color: 'text-red-400' },
            { label: 'Overdue', value: stats.overdue, color: 'text-orange-400' },
            { label: 'MRR', value: `Rs ${(stats.mrrLkr / 100).toLocaleString()}`, color: 'text-green-300' },
          ].map((s) => (
            <div key={s.label} className="bg-gray-900 rounded-xl p-3 border border-gray-800">
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className={`text-xl font-bold mt-0.5 ${s.color || 'text-white'}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, subdomain, or ID..."
        className="w-full max-w-md bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
      />

      {/* Business table */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading fleet...</div>
      ) : (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Status</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Business</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Plan</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Billing</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">Heartbeat</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">WA</th>
                <th className="text-right px-4 py-3 text-gray-400 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const mins = minutesSince(b.last_heartbeat);
                const heartbeatOk = mins !== null && mins < 3;
                return (
                  <tr key={b.biz_id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[b.status] || 'bg-gray-500'}`} />
                        <span className="text-gray-400 text-xs">{b.status}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/businesses/${b.biz_id}`} className="text-white font-medium hover:text-green-400">
                        {b.business_name}
                      </Link>
                      <p className="text-xs text-gray-500">{b.subdomain}.wabizz.lk</p>
                    </td>
                    <td className="px-4 py-3 text-gray-300 capitalize">{b.plan}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${BILLING_BADGE[b.billing_status] || ''}`}>
                        {b.billing_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {mins === null ? (
                        <span className="text-xs text-gray-600">never</span>
                      ) : (
                        <span className={`text-xs ${heartbeatOk ? 'text-green-400' : 'text-red-400'}`}>
                          {mins < 1 ? 'just now' : `${mins}m ago`}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-lg">
                      {b.whatsapp_connected ? '✅' : '❌'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        to={`/businesses/${b.biz_id}`}
                        className="text-xs text-green-400 hover:text-green-300"
                      >
                        Manage →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filtered.length === 0 && (
            <div className="text-center py-10 text-gray-600">No businesses found.</div>
          )}
        </div>
      )}
    </div>
  );
}
