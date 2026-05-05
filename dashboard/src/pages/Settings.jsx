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
      setStatus(data);
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
      setQrData(data);
      setPolling(true);
    } catch {
      toast.error('Failed to get QR code');
    } finally {
      setLoadingQr(false);
    }
  }

  // Poll connection status after showing QR
  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(async () => {
      await fetchStatus();
      if (status?.state === 'open') {
        setPolling(false);
        setQrData(null);
        toast.success('WhatsApp connected!');
        clearInterval(interval);
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [polling, status]);

  const isConnected = status?.state === 'open';

  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-2xl font-bold text-white">Settings</h1>

      {/* WhatsApp Status */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
        <h2 className="text-lg font-semibold text-white mb-4">WhatsApp Connection</h2>

        <div className="flex items-center gap-3 mb-5">
          <span
            className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
          />
          <span className={isConnected ? 'text-green-400' : 'text-red-400'}>
            {isConnected ? 'Connected' : status?.state ? `State: ${status.state}` : 'Checking...'}
          </span>
        </div>

        {!isConnected && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Scan the QR code with your WhatsApp to connect this business number.
            </p>
            <button
              onClick={getQr}
              disabled={loadingQr}
              className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg"
            >
              {loadingQr ? 'Generating QR...' : '📱 Get QR Code'}
            </button>

            {qrData?.qrcode && (
              <div className="mt-4">
                <p className="text-xs text-gray-400 mb-2">
                  Scan with WhatsApp → Linked Devices → Link a Device
                </p>
                <img
                  src={qrData.qrcode}
                  alt="WhatsApp QR Code"
                  className="w-56 h-56 rounded-xl bg-white p-2"
                />
                {polling && (
                  <p className="text-xs text-brand-400 mt-2 animate-pulse">
                    Waiting for scan...
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {isConnected && (
          <button
            onClick={getQr}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg"
          >
            🔄 Reconnect (scan new QR)
          </button>
        )}
      </div>

      {/* About */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
        <h2 className="text-lg font-semibold text-white mb-2">About</h2>
        <p className="text-sm text-gray-400">WA Bizz — WhatsApp Commerce Platform</p>
        <p className="text-xs text-gray-600 mt-1">Version 1.0.0</p>
      </div>
    </div>
  );
}
