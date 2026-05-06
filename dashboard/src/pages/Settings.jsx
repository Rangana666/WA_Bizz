import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '../api';

export default function Settings() {
  const [status, setStatus] = useState(null);
  const [qrData, setQrData] = useState(null);
  const [loadingQr, setLoadingQr] = useState(false);
  const [polling, setPolling] = useState(false);

  async function fetchStatus() {
    try {
      const { data } = await api.get('/whatsapp/status');
      // Evolution API v1.x returns { instance: { state: 'open' } }
      // Evolution API v2.x returns { state: 'open' }
      const state = data?.instance?.state || data?.state || 'unknown';
      setStatus({ state });
    } catch {
      setStatus({ state: 'error' });
    }
  }

  useEffect(() => {
    fetchStatus();
  }, []);

  async function getQr() {
    setLoadingQr(true);
    setQrData(null);
    try {
      const { data } = await api.get('/whatsapp/qr');
      // Evolution API v1.x returns { base64: 'data:image/png;base64,...', code: '...', count: 1 }
      // Evolution API v2.x returns { qrcode: { base64: '...', code: '...' } }
      const base64 =
        data?.base64 ||
        data?.qrcode?.base64 ||
        data?.qrcode ||
        null;

      if (base64) {
        setQrData(base64);
        setPolling(true);
        toast('📱 QR Code ready — scan with WhatsApp', { duration: 10000 });
      } else {
        toast.error('QR code not ready yet — try again in 5 seconds');
      }
    } catch (err) {
      toast.error('Failed to get QR code — check if Evolution API is running');
    } finally {
      setLoadingQr(false);
    }
  }

  // Poll until connected after scanning QR
  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(async () => {
      try {
        const { data } = await api.get('/whatsapp/status');
        const state = data?.instance?.state || data?.state || '';
        if (state === 'open') {
          setPolling(false);
          setQrData(null);
          setStatus({ state: 'open' });
          toast.success('✅ WhatsApp connected successfully!');
          clearInterval(interval);
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [polling]);

  const isConnected = status?.state === 'open';

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-2xl font-bold text-white">Settings</h1>

      {/* WhatsApp Connection */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
        <h2 className="text-lg font-semibold text-white mb-4">WhatsApp Connection</h2>

        {/* Status indicator */}
        <div className="flex items-center gap-3 mb-5">
          <span className={`w-3 h-3 rounded-full ${
            isConnected ? 'bg-green-500' :
            status?.state === 'connecting' ? 'bg-yellow-500 animate-pulse' :
            'bg-red-500'
          }`} />
          <span className={
            isConnected ? 'text-green-400 font-medium' :
            status?.state === 'connecting' ? 'text-yellow-400' :
            'text-red-400'
          }>
            {isConnected ? '✅ Connected' :
             status?.state === 'connecting' ? 'Connecting...' :
             status?.state ? `Disconnected (${status.state})` : 'Checking...'}
          </span>
        </div>

        {/* QR section — shown when not connected */}
        {!isConnected && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Connect your WhatsApp number by scanning the QR code below.
            </p>

            <button
              onClick={getQr}
              disabled={loadingQr}
              className="px-5 py-2.5 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-semibold rounded-xl"
            >
              {loadingQr ? '⏳ Generating QR...' : '📱 Get QR Code'}
            </button>

            {/* QR Code image */}
            {qrData && (
              <div className="mt-4 space-y-2">
                <p className="text-xs text-gray-400">
                  Open WhatsApp → <strong>Linked Devices</strong> → <strong>Link a Device</strong> → scan below
                </p>
                <div className="inline-block bg-white p-3 rounded-2xl">
                  <img
                    src={qrData}
                    alt="WhatsApp QR Code"
                    className="w-56 h-56 rounded-xl"
                  />
                </div>
                {polling && (
                  <p className="text-xs text-green-400 animate-pulse">
                    ⏳ Waiting for you to scan...
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Reconnect button — shown when connected */}
        {isConnected && (
          <button
            onClick={getQr}
            disabled={loadingQr}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg"
          >
            🔄 Reconnect (scan new QR)
          </button>
        )}
      </div>

      {/* About */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
        <h2 className="text-lg font-semibold text-white mb-1">About</h2>
        <p className="text-sm text-gray-400">WA Bizz — WhatsApp Commerce Platform</p>
        <p className="text-xs text-gray-600 mt-1">Version 1.0.0</p>
      </div>
    </div>
  );
}
