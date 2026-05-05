import { useState, useEffect } from 'react';
import { publicApi } from '../api';
import toast from 'react-hot-toast';

const PLANS = [
  { id: 'starter', label: 'Starter', price: 'Rs 3,500/mo', setup: 'Rs 3,000 setup', desc: 'Perfect to start — up to 100 orders/day' },
  { id: 'growth', label: 'Growth', price: 'Rs 5,500/mo', setup: 'Rs 5,000 setup', desc: 'Popular — unlimited orders, priority support', popular: true },
  { id: 'pro', label: 'Pro', price: 'Rs 9,000/mo', setup: 'Rs 8,000 setup', desc: 'High volume, dedicated resources, SLA' },
];

const BUSINESS_TYPES = ['clothing', 'perfume', 'food', 'other'];

export default function Signup() {
  const [step, setStep] = useState(1);
  const [plan, setPlan] = useState('growth');
  const [form, setForm] = useState({
    businessName: '', ownerName: '', ownerEmail: '', ownerPhone: '', businessType: 'clothing', subdomain: '',
  });
  const [subdomainStatus, setSubdomainStatus] = useState(null); // null | 'checking' | 'available' | 'taken'
  const [loading, setLoading] = useState(false);

  // Auto-generate subdomain from business name
  useEffect(() => {
    const auto = form.businessName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);
    setForm((f) => ({ ...f, subdomain: auto }));
  }, [form.businessName]);

  // Check subdomain availability
  useEffect(() => {
    if (!form.subdomain || form.subdomain.length < 3) { setSubdomainStatus(null); return; }
    setSubdomainStatus('checking');
    const timer = setTimeout(async () => {
      try {
        const { data } = await publicApi.get(`/check-subdomain?subdomain=${form.subdomain}`);
        setSubdomainStatus(data.available ? 'available' : 'taken');
      } catch { setSubdomainStatus(null); }
    }, 500);
    return () => clearTimeout(timer);
  }, [form.subdomain]);

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (subdomainStatus !== 'available') { toast.error('Please choose an available subdomain'); return; }

    setLoading(true);
    try {
      const { data } = await publicApi.post('/create-checkout', { ...form, plan });
      window.location.href = data.checkoutUrl;
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to start checkout');
    } finally {
      setLoading(false);
    }
  }

  const inputClass = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:border-green-500';

  return (
    <div className="min-h-screen bg-gray-950 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-green-400">WA Bizz</h1>
          <p className="text-gray-400 mt-2">Your WhatsApp Business Bot — live in 5 minutes</p>
        </div>

        {/* Plan selection */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {PLANS.map((p) => (
            <button
              key={p.id}
              onClick={() => setPlan(p.id)}
              className={`relative p-4 rounded-2xl border text-left transition-colors ${
                plan === p.id ? 'border-green-500 bg-green-500/10' : 'border-gray-700 bg-gray-900 hover:border-gray-500'
              }`}
            >
              {p.popular && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-green-500 text-black text-xs font-bold px-2 py-0.5 rounded-full">
                  POPULAR
                </span>
              )}
              <p className="font-bold text-white">{p.label}</p>
              <p className="text-green-400 font-semibold mt-1">{p.price}</p>
              <p className="text-xs text-gray-500">{p.setup}</p>
              <p className="text-xs text-gray-400 mt-2">{p.desc}</p>
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-gray-900 rounded-2xl border border-gray-800 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Business Details</h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Business name *</label>
              <input className={inputClass} value={form.businessName}
                onChange={(e) => set('businessName', e.target.value)} placeholder="Mala's Fashion" required />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Business type *</label>
              <select className={`${inputClass} cursor-pointer`} value={form.businessType}
                onChange={(e) => set('businessType', e.target.value)}>
                {BUSINESS_TYPES.map((t) => <option key={t} value={t} className="bg-gray-800 capitalize">{t}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Your name *</label>
              <input className={inputClass} value={form.ownerName}
                onChange={(e) => set('ownerName', e.target.value)} placeholder="Mala Perera" required />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Phone *</label>
              <input className={inputClass} value={form.ownerPhone}
                onChange={(e) => set('ownerPhone', e.target.value)} placeholder="+94771234567" required />
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Email *</label>
            <input type="email" className={inputClass} value={form.ownerEmail}
              onChange={(e) => set('ownerEmail', e.target.value)} placeholder="mala@example.com" required />
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Your store URL</label>
            <div className="flex items-center gap-0">
              <input
                className={`${inputClass} rounded-r-none border-r-0`}
                value={form.subdomain}
                onChange={(e) => set('subdomain', e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
                placeholder="mala"
                minLength={3}
                maxLength={20}
                required
              />
              <span className="bg-gray-700 border border-gray-700 border-l-0 rounded-r-lg px-4 py-2.5 text-gray-400 text-sm whitespace-nowrap">
                .wabizz.lk
              </span>
            </div>
            <p className={`text-xs mt-1 ${
              subdomainStatus === 'available' ? 'text-green-400' :
              subdomainStatus === 'taken' ? 'text-red-400' :
              subdomainStatus === 'checking' ? 'text-yellow-400' : 'text-transparent'
            }`}>
              {subdomainStatus === 'available' ? '✓ Available' :
               subdomainStatus === 'taken' ? '✗ Already taken — try another' :
               subdomainStatus === 'checking' ? 'Checking...' : '.'}
            </p>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || subdomainStatus !== 'available'}
              className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl text-lg transition-colors"
            >
              {loading ? 'Redirecting to checkout...' : `Start with ${PLANS.find((p2) => p2.id === plan)?.label} →`}
            </button>
            <p className="text-center text-xs text-gray-600 mt-2">
              Secure payment via Stripe · Cancel anytime
            </p>
          </div>
        </form>

        <div className="mt-6 grid grid-cols-3 gap-4 text-center text-sm text-gray-500">
          <div><p className="text-2xl mb-1">⚡</p><p>Live in 5 minutes</p></div>
          <div><p className="text-2xl mb-1">🔒</p><p>Your own private server</p></div>
          <div><p className="text-2xl mb-1">🌐</p><p>English, Sinhala & Tamil</p></div>
        </div>
      </div>
    </div>
  );
}
