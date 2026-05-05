import { useState, useEffect } from 'react';
import api from '../api';

function MiniBar({ value, color }) {
  const clamped = Math.min(100, Math.max(0, value || 0));
  const barColor =
    clamped >= 90 ? 'bg-red-500' :
    clamped >= 70 ? 'bg-yellow-500' :
    color || 'bg-green-500';

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full`} style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-xs text-gray-400 w-7 text-right">{value != null ? `${value}%` : '—'}</span>
    </div>
  );
}

export default function Metrics() {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState('businessName');

  async function fetchSnapshot() {
    const { data } = await api.get('/updates/metrics/snapshot');
    setSnapshot(data);
  }

  useEffect(() => {
    fetchSnapshot().finally(() => setLoading(false));
    const interval = setInterval(fetchSnapshot, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div className="text-center py-12 text-gray-500">Loading metrics...</div>;
  if (!snapshot) return null;

  let servers = [...snapshot.servers];

  if (filter === 'offline') servers = servers.filter((s) => !s.isOnline && s.status === 'live');
  if (filter === 'wa_disconnected') servers = servers.filter((s) => s.status === 'live' && !s.whatsappConnected);
  if (filter === 'high_disk') servers = servers.filter((s) => (s.diskUsedPercent || 0) >= 80);
  if (filter === 'high_mem') servers = servers.filter((s) => (s.memoryUsedPercent || 0) >= 80);

  servers.sort((a, b) => {
    if (sortBy === 'disk') return (b.diskUsedPercent || 0) - (a.diskUsedPercent || 0);
    if (sortBy === 'memory') return (b.memoryUsedPercent || 0) - (a.memoryUsedPercent || 0);
    if (sortBy === 'messages') return (b.messageCountToday || 0) - (a.messageCountToday || 0);
    return a.businessName?.localeCompare(b.businessName);
  });

  const summaryCards = [
    { label: 'Total servers', value: snapshot.total },
    { label: 'Online', value: snapshot.online, color: 'text-green-400' },
    { label: 'Offline', value: snapshot.offline, color: snapshot.offline > 0 ? 'text-red-400' : 'text-gray-400' },
    { label: 'WA Connected', value: snapshot.waConnected, color: 'text-blue-400' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Server Metrics</h1>
        <span className="text-xs text-gray-500">Auto-refreshes every 30s</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-4">
        {summaryCards.map((c) => (
          <div key={c.label} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <p className="text-xs text-gray-400">{c.label}</p>
            <p className={`text-2xl font-bold mt-1 ${c.color || 'text-white'}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Filters + Sort */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-2">
          {[
            { id: 'all', label: 'All' },
            { id: 'offline', label: '🔴 Offline' },
            { id: 'wa_disconnected', label: '📵 WA Off' },
            { id: 'high_disk', label: '💾 High Disk' },
            { id: 'high_mem', label: '🧠 High Mem' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filter === f.id ? 'bg-green-700 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="ml-auto bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-xs text-gray-300 focus:outline-none"
        >
          <option value="businessName">Sort: Name</option>
          <option value="disk">Sort: Disk usage</option>
          <option value="memory">Sort: Memory usage</option>
          <option value="messages">Sort: Messages today</option>
        </select>
      </div>

      {/* Metrics grid */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Business</th>
              <th className="text-left px-4 py-3 text-gray-400 font-medium">Version</th>
              <th className="px-4 py-3 text-gray-400 font-medium text-center">WA</th>
              <th className="px-4 py-3 text-gray-400 font-medium" style={{ minWidth: 100 }}>Disk</th>
              <th className="px-4 py-3 text-gray-400 font-medium" style={{ minWidth: 100 }}>Memory</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">Msgs</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">Orders</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">Heartbeat</th>
            </tr>
          </thead>
          <tbody>
            {servers.map((s) => {
              const mins = s.minsOffline;
              const heartbeatColor =
                !s.isOnline && s.status === 'live' ? 'text-red-400' :
                mins !== null && mins < 2 ? 'text-green-400' : 'text-gray-400';

              return (
                <tr key={s.bizId} className={`border-b border-gray-800/40 hover:bg-gray-800/30 ${!s.isOnline && s.status === 'live' ? 'bg-red-900/10' : ''}`}>
                  <td className="px-4 py-2.5">
                    <p className="text-white text-sm font-medium">{s.businessName}</p>
                    <p className="text-xs text-gray-500">{s.subdomain}.wabizz.lk</p>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-400">
                    {s.appVersion || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-center text-base">
                    {s.whatsappConnected ? '✅' : '❌'}
                  </td>
                  <td className="px-4 py-2.5">
                    <MiniBar value={s.diskUsedPercent} />
                  </td>
                  <td className="px-4 py-2.5">
                    <MiniBar value={s.memoryUsedPercent} color="bg-blue-500" />
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-300">
                    {s.messageCountToday ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-gray-300">
                    {s.orderCountToday ?? '—'}
                  </td>
                  <td className={`px-4 py-2.5 text-right text-xs ${heartbeatColor}`}>
                    {mins === null ? 'never'
                      : mins < 1 ? 'just now'
                      : `${mins}m ago`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {servers.length === 0 && (
          <div className="text-center py-10 text-gray-600">No servers match this filter.</div>
        )}
      </div>
    </div>
  );
}
