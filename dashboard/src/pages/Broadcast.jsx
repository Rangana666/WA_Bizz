import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api';

export default function Broadcast() {
  const [broadcasts, setBroadcasts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({ message_en: '', message_si: '', message_ta: '' });
  const [tab, setTab] = useState('en');

  useEffect(() => {
    Promise.all([
      api.get('/broadcasts'),
      api.get('/customers'),
    ]).then(([bRes, cRes]) => {
      setBroadcasts(bRes.data);
      setCustomers(cRes.data.filter((c) => c.total_orders > 0));
    }).finally(() => setLoading(false));
  }, []);

  async function sendBroadcast(e) {
    e.preventDefault();
    if (!form.message_en.trim()) { toast.error('English message is required'); return; }
    if (!confirm(`Send to ${customers.length} customers?`)) return;

    setSending(true);
    try {
      await api.post('/broadcasts', form);
      toast.success(`Broadcast started — sending to ${customers.length} customers`);
      setForm({ message_en: '', message_si: '', message_ta: '' });
      const { data } = await api.get('/broadcasts');
      setBroadcasts(data);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send broadcast');
    } finally {
      setSending(false);
    }
  }

  const STATUS_COLOR = {
    pending: 'text-gray-400',
    sending: 'text-yellow-400 animate-pulse',
    done: 'text-green-400',
    failed: 'text-red-400',
  };

  const charCount = form[`message_${tab}`]?.length || 0;

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Broadcast Message</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Send a message to all {customers.length} customers who have placed orders
          </p>
        </div>
      </div>

      {/* Compose */}
      <form onSubmit={sendBroadcast} className="bg-gray-900 rounded-2xl border border-gray-800 p-5 space-y-4">
        <h2 className="font-semibold text-white">Compose Message</h2>

        {/* Language tabs */}
        <div className="flex gap-2">
          {[
            { id: 'en', label: '🇬🇧 English' },
            { id: 'si', label: '🇱🇰 Sinhala' },
            { id: 'ta', label: '🇱🇰 Tamil' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                tab === t.id ? 'bg-brand-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div>
          {tab === 'en' && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">English message *</label>
              <textarea
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 h-32 resize-none"
                value={form.message_en}
                onChange={(e) => setForm((f) => ({ ...f, message_en: e.target.value }))}
                placeholder="Hi! We have a special offer for you today..."
                required
              />
            </div>
          )}
          {tab === 'si' && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Sinhala message (optional)</label>
              <textarea
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 h-32 resize-none"
                value={form.message_si}
                onChange={(e) => setForm((f) => ({ ...f, message_si: e.target.value }))}
                placeholder="ආයුබෝවන්! අද ඔබට විශේෂ දීමනාවක්..."
              />
            </div>
          )}
          {tab === 'ta' && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Tamil message (optional)</label>
              <textarea
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 h-32 resize-none"
                value={form.message_ta}
                onChange={(e) => setForm((f) => ({ ...f, message_ta: e.target.value }))}
                placeholder="வணக்கம்! இன்று உங்களுக்கு சிறப்பு சலுகை..."
              />
            </div>
          )}
          <p className="text-xs text-gray-600 mt-1">{charCount} characters</p>
        </div>

        <div className="bg-gray-800/60 rounded-lg p-3 text-xs text-gray-400 space-y-1">
          <p>📌 Each customer receives their preferred language version (or English as fallback)</p>
          <p>⏱ Messages are sent at 1.5s intervals to avoid WhatsApp rate limits</p>
          <p>📊 Only customers with at least 1 order will receive the broadcast</p>
        </div>

        <button
          type="submit"
          disabled={sending || !form.message_en.trim()}
          className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-semibold py-2.5 rounded-xl"
        >
          {sending ? `Sending to ${customers.length} customers...` : `📢 Send to ${customers.length} customers`}
        </button>
      </form>

      {/* History */}
      {!loading && broadcasts.length > 0 && (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
          <h2 className="font-semibold text-white mb-4">Broadcast History</h2>
          <div className="space-y-3">
            {broadcasts.map((b) => (
              <div key={b.id} className="border border-gray-800 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-semibold ${STATUS_COLOR[b.status]}`}>
                    {b.status === 'sending' ? '⏳ Sending...' :
                     b.status === 'done' ? `✅ Sent to ${b.sent_to}` :
                     b.status === 'failed' ? '❌ Failed' : '⏸ Pending'}
                  </span>
                  <span className="text-xs text-gray-600">
                    {new Date(b.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm text-gray-300 line-clamp-2">{b.message_en}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
