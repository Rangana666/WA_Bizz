import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import toast from 'react-hot-toast';
import api from '../api';

const JOB_STATUS_COLOR = {
  running: 'text-yellow-400',
  paused: 'text-orange-400',
  completed: 'text-green-400',
  rolled_back: 'text-red-400',
  cancelled: 'text-gray-400',
};

const SERVER_STATUS_COLOR = {
  pending: 'bg-gray-700',
  updating: 'bg-yellow-500 animate-pulse',
  ok: 'bg-green-500',
  failed: 'bg-red-500',
  rolled_back: 'bg-orange-500',
  skipped: 'bg-gray-500',
};

function ProgressBar({ value, max, color = 'bg-green-500' }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function Updates() {
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobDetail, setJobDetail] = useState(null);
  const [showNewJob, setShowNewJob] = useState(false);
  const [form, setForm] = useState({ version: '', batchSize: 50, batchDelayMinutes: 10, failureThreshold: 20 });
  const [starting, setStarting] = useState(false);
  const socketRef = useRef(null);

  // Load jobs
  const fetchJobs = async () => {
    const { data } = await api.get('/updates');
    setJobs(data);
  };

  useEffect(() => { fetchJobs(); }, []);

  // Socket.io for live progress
  useEffect(() => {
    const socket = io({ path: '/socket.io' });
    socketRef.current = socket;

    const events = [
      'update_job_started', 'update_job_completed', 'update_job_paused',
      'update_job_cancelled', 'update_batch_started', 'update_batch_done',
      'update_server_started', 'update_server_done',
    ];

    events.forEach((evt) => {
      socket.on(evt, (data) => {
        if (evt === 'update_job_started') {
          toast('🚀 Update rollout started', { icon: '🔄' });
        }
        if (evt === 'update_job_completed') {
          toast.success(`Update complete — ${data.totalUpdated} servers updated`);
        }
        if (evt === 'update_job_paused') {
          toast.error(`Rollout paused: ${data.reason}`);
        }
        fetchJobs();
        if (selectedJob) fetchJobDetail(selectedJob);
      });
    });

    return () => socket.disconnect();
  }, [selectedJob]);

  async function fetchJobDetail(jobId) {
    const { data } = await api.get(`/updates/${jobId}`);
    setJobDetail(data);
  }

  function selectJob(jobId) {
    setSelectedJob(jobId);
    fetchJobDetail(jobId);
    const interval = setInterval(() => fetchJobDetail(jobId), 5000);
    return () => clearInterval(interval);
  }

  async function startRollout() {
    if (!form.version.trim()) { toast.error('Enter a version'); return; }
    setStarting(true);
    try {
      const { data } = await api.post('/updates/start', {
        version: form.version.trim(),
        batchSize: parseInt(form.batchSize),
        batchDelayMinutes: parseInt(form.batchDelayMinutes),
        failureThreshold: parseInt(form.failureThreshold) / 100,
      });
      toast.success(`Rollout started — Job ${data.jobId.slice(0, 8)}`);
      setShowNewJob(false);
      fetchJobs();
      selectJob(data.jobId);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to start rollout');
    } finally {
      setStarting(false);
    }
  }

  async function cancelJob(jobId) {
    await api.post(`/updates/${jobId}/cancel`);
    toast('Job cancelled');
    fetchJobs();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Remote Updates</h1>
        <button
          onClick={() => setShowNewJob(!showNewJob)}
          className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white text-sm font-semibold rounded-lg"
        >
          🚀 New Rollout
        </button>
      </div>

      {/* New rollout form */}
      {showNewJob && (
        <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 space-y-4">
          <h2 className="font-semibold text-white">Configure Rolling Update</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Version / Git SHA *</label>
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                value={form.version}
                onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))}
                placeholder="abc1234 or 2.5.0"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Batch size (servers per batch)</label>
              <input type="number" min={1} max={500}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                value={form.batchSize}
                onChange={(e) => setForm((f) => ({ ...f, batchSize: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Delay between batches (minutes)</label>
              <input type="number" min={1} max={120}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                value={form.batchDelayMinutes}
                onChange={(e) => setForm((f) => ({ ...f, batchDelayMinutes: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">Failure threshold % (auto-rollback)</label>
              <input type="number" min={1} max={100}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-green-500"
                value={form.failureThreshold}
                onChange={(e) => setForm((f) => ({ ...f, failureThreshold: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={startRollout} disabled={starting}
              className="px-5 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg">
              {starting ? 'Starting...' : '🚀 Start rollout'}
            </button>
            <button onClick={() => setShowNewJob(false)}
              className="px-4 py-2 bg-gray-800 text-gray-300 text-sm rounded-lg hover:bg-gray-700">
              Cancel
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Each batch runs with up to 10 concurrent SSH connections. Auto-rollback triggers if failures exceed the threshold.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Job list */}
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Update Jobs</h2>
          {jobs.length === 0 && <p className="text-gray-600 text-sm">No update jobs yet.</p>}
          {jobs.map((job) => (
            <button
              key={job.id}
              onClick={() => selectJob(job.id)}
              className={`w-full text-left p-3 rounded-xl border transition-colors ${
                selectedJob === job.id
                  ? 'border-green-600 bg-green-900/20'
                  : 'border-gray-800 bg-gray-900 hover:border-gray-600'
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-mono text-white">v{job.version}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{new Date(job.started_at).toLocaleString()}</p>
                </div>
                <span className={`text-xs font-semibold ${JOB_STATUS_COLOR[job.status]}`}>
                  {job.status}
                </span>
              </div>
              <div className="mt-2">
                <ProgressBar value={job.updated} max={job.total_servers} />
                <p className="text-xs text-gray-500 mt-1">
                  {job.updated}/{job.total_servers} updated · {job.failed} failed
                </p>
              </div>
            </button>
          ))}
        </div>

        {/* Job detail */}
        <div className="lg:col-span-2">
          {!jobDetail ? (
            <div className="text-center py-20 text-gray-600">Select a job to see details</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-white">
                    v{jobDetail.version}
                    {jobDetail.previous_version && (
                      <span className="text-gray-500 text-sm ml-2">(was {jobDetail.previous_version})</span>
                    )}
                  </h2>
                  <p className={`text-sm font-medium ${JOB_STATUS_COLOR[jobDetail.status]}`}>
                    {jobDetail.status}
                  </p>
                </div>
                {['running', 'paused'].includes(jobDetail.status) && (
                  <button
                    onClick={() => cancelJob(jobDetail.id)}
                    className="px-3 py-1.5 bg-red-800 hover:bg-red-700 text-white text-xs rounded-lg"
                  >
                    Cancel job
                  </button>
                )}
              </div>

              {/* Progress bars */}
              <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 space-y-3">
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Updated</span>
                    <span>{jobDetail.updated}/{jobDetail.total_servers}</span>
                  </div>
                  <ProgressBar value={jobDetail.updated} max={jobDetail.total_servers} />
                </div>
                {jobDetail.failed > 0 && (
                  <div>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Failed</span><span>{jobDetail.failed}</span>
                    </div>
                    <ProgressBar value={jobDetail.failed} max={jobDetail.total_servers} color="bg-red-500" />
                  </div>
                )}
                {jobDetail.rolled_back > 0 && (
                  <div>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Rolled back</span><span>{jobDetail.rolled_back}</span>
                    </div>
                    <ProgressBar value={jobDetail.rolled_back} max={jobDetail.total_servers} color="bg-orange-500" />
                  </div>
                )}
                <p className="text-xs text-gray-600">
                  Batch size: {jobDetail.batch_size} · Delay: {Math.round(jobDetail.batch_delay_ms / 60000)}m · Threshold: {(jobDetail.failure_threshold * 100).toFixed(0)}%
                </p>
              </div>

              {/* Server list */}
              <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden max-h-96 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-900">
                    <tr className="border-b border-gray-800">
                      <th className="text-left px-3 py-2 text-gray-400">Business</th>
                      <th className="text-left px-3 py-2 text-gray-400">Batch</th>
                      <th className="text-right px-3 py-2 text-gray-400">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobDetail.servers?.map((s) => (
                      <tr key={s.id} className="border-b border-gray-800/40">
                        <td className="px-3 py-2 text-gray-300">{s.business_name}</td>
                        <td className="px-3 py-2 text-gray-500">#{s.batch_number}</td>
                        <td className="px-3 py-2 text-right">
                          <span className={`inline-block w-2 h-2 rounded-full ${SERVER_STATUS_COLOR[s.status]}`} />
                          <span className="ml-1.5 text-gray-400">{s.status}</span>
                          {s.error && <p className="text-red-400 text-xs">{s.error.slice(0, 60)}</p>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
