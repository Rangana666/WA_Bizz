import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../api';

export default function BusinessDetail() {
  const { bizId } = useParams();
  const [biz, setBiz] = useState(null);
  const [logs, setLogs] = useState([]);
  const [billing, setBilling] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');

  useEffect(() => {
    Promise.all([
      api.get(`/businesses/${bizId}`),
      api.get(`/businesses/${bizId}/logs`),
      api.get(`/businesses/${bizId}/billing`),
    ]).then(([bRes, lRes, biRes]) => {
      setBiz(bRes.data);
      setLogs(lRes.data);
      setBilling(biRes.data);
    }).catch(() => toast.error('Failed to load business'))
      .finally(() => setLoading(false));
  }, [bizId]);

  async function action(endpoint, method = 'post', label) {
    setActionLoading(label);
    try {
      if (method === 'delete') {
        await api.delete(endpoint);
      } else {
        await api.post(endpoint);
      }
      toast.success(`${label} done`);
      const { data } = await api.get(`/businesses/${bizId}`);
      setBiz(data);
    } catch (err) {
      toast.error(`${label} failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setActionLoading('');
    }
  }

  if (loading) return <div className="text-center py-12 text-gray-500">Loading...</div>;
  if (!biz) return <div className="text-center py-12 text-red-400">Business not found.</div>;

  const metrics = [
    { label: 'Disk', value: biz.disk_used_percent != null ? `${biz.disk_used_percent}%` : '—' },
    { label: 'Memory', value: biz.memory_used_percent != null ? `${biz.memory_used_percent}%` : '—' },
    { label: 'Messages today', value: biz.message_count_today ?? '—' },
    { label: 'Orders today', value: biz.order_count_today ?? '—' },
    { label: 'WA connected', value: biz.whatsapp_connected ? '✅ Yes' : '❌ No' },
    { label: 'App version', value: biz.app_version || '—' },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-4">
        <Link to="/" className="text-gray-500 hover:text-white text-sm">← Fleet</Link>
        <h1 className="text-2xl font-bold text-white">{biz.business_name}</h1>
        <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded-full">{biz.biz_id}</span>
      </div>

      {/* Info card */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: 'Owner', value: biz.owner_name },
          { label: 'Email', value: biz.owner_email },
          { label: 'Phone', value: biz.owner_phone || '—' },
          { label: 'Type', value: biz.business_type },
          { label: 'Plan', value: biz.plan },
          { label: 'Status', value: biz.status },
          { label: 'Billing', value: biz.billing_status },
          { label: 'Server IP', value: biz.server_ip || '—' },
          { label: 'Subdomain', value: `${biz.subdomain}.wabizz.lk` },
        ].map((item) => (
          <div key={item.label} className="bg-gray-900 rounded-xl p-3 border border-gray-800">
            <p className="text-xs text-gray-500">{item.label}</p>
            <p className="text-sm text-white mt-0.5 break-all">{item.value}</p>
          </div>
        ))}
      </div>

      {/* Live metrics */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">Live Metrics</h2>
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3">
          {metrics.map((m) => (
            <div key={m.label}>
              <p className="text-xs text-gray-500">{m.label}</p>
              <p className="text-sm text-white font-medium mt-0.5">{m.value}</p>
            </div>
          ))}
        </div>
        {biz.last_heartbeat && (
          <p className="text-xs text-gray-600 mt-3">
            Last heartbeat: {new Date(biz.last_heartbeat).toLocaleString()}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">Actions</h2>
        <div className="flex flex-wrap gap-2">
          <ActionBtn
            label="Reprovision"
            loading={actionLoading === 'Reprovision'}
            onClick={() => action('/provision', 'post', 'Reprovision', { bizId })}
            color="blue"
          />
          {biz.status === 'live' && (
            <ActionBtn
              label="Suspend"
              loading={actionLoading === 'Suspend'}
              onClick={() => action(`/suspend/${bizId}`, 'post', 'Suspend')}
              color="orange"
            />
          )}
          {biz.status === 'suspended' && (
            <ActionBtn
              label="Restore"
              loading={actionLoading === 'Restore'}
              onClick={() => action(`/restore/${bizId}`, 'post', 'Restore')}
              color="green"
            />
          )}
          <ActionBtn
            label="Push update"
            loading={actionLoading === 'Push update'}
            onClick={() => action(`/update/${bizId}`, 'post', 'Push update')}
            color="purple"
          />
          <ActionBtn
            label="Deprovision"
            loading={actionLoading === 'Deprovision'}
            onClick={() => {
              if (confirm('This will permanently delete the server. Are you sure?')) {
                action(`/deprovision/${bizId}`, 'delete', 'Deprovision');
              }
            }}
            color="red"
          />
        </div>
      </div>

      {/* Provision logs */}
      {logs.length > 0 && (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Provision Logs</h2>
          <div className="space-y-1 font-mono text-xs max-h-48 overflow-y-auto">
            {logs.map((l) => (
              <div key={l.id} className={`flex gap-3 ${l.status === 'error' ? 'text-red-400' : l.status === 'ok' ? 'text-green-400' : 'text-gray-400'}`}>
                <span className="text-gray-600 shrink-0">{new Date(l.created_at).toLocaleTimeString()}</span>
                <span>{l.step} — {l.status}</span>
                {l.message && <span className="text-gray-500">{l.message}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Billing events */}
      {billing.length > 0 && (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
          <h2 className="text-sm font-semibold text-gray-300 mb-3">Billing History</h2>
          <div className="space-y-1 text-xs">
            {billing.map((e) => (
              <div key={e.id} className="flex justify-between text-gray-400">
                <span>{e.event_type}</span>
                <span>{e.amount ? `${e.currency?.toUpperCase()} ${(e.amount / 100).toFixed(2)}` : '—'}</span>
                <span className="text-gray-600">{new Date(e.created_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ActionBtn({ label, onClick, loading, color }) {
  const colors = {
    blue: 'bg-blue-700 hover:bg-blue-600',
    green: 'bg-green-700 hover:bg-green-600',
    orange: 'bg-orange-700 hover:bg-orange-600',
    purple: 'bg-purple-700 hover:bg-purple-600',
    red: 'bg-red-800 hover:bg-red-700',
  };
  return (
    <button
      onClick={onClick}
      disabled={!!loading}
      className={`px-3 py-1.5 text-sm text-white rounded-lg disabled:opacity-50 ${colors[color] || colors.blue}`}
    >
      {loading ? '...' : label}
    </button>
  );
}
