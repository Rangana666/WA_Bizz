export default function SignupSuccess() {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="max-w-md text-center">
        <div className="text-6xl mb-4">🎉</div>
        <h1 className="text-3xl font-bold text-green-400 mb-2">Payment Successful!</h1>
        <p className="text-gray-300 text-lg mb-6">Your WhatsApp bot is being set up right now.</p>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-left space-y-3 mb-6">
          <p className="text-gray-400 text-sm">We are now:</p>
          <div className="space-y-2">
            {[
              'Creating your dedicated server (Hetzner CX21)',
              'Installing Docker, Evolution API, and your bot',
              'Configuring your subdomain with SSL',
              'Sending your login credentials by email',
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-3 text-sm text-gray-300">
                <span className="w-6 h-6 rounded-full bg-green-700 text-white flex items-center justify-center text-xs font-bold shrink-0">{i + 1}</span>
                {step}
              </div>
            ))}
          </div>
        </div>
        <p className="text-gray-400 text-sm">
          This takes <strong className="text-white">3–5 minutes</strong>. Check your email for your dashboard link and login details.
        </p>
        <p className="text-gray-600 text-xs mt-4">Questions? WhatsApp us: +94 77 XXX XXXX</p>
      </div>
    </div>
  );
}
