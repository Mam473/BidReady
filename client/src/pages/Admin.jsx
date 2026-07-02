import React, { useEffect, useState, useCallback } from "react";
import { DollarSign, Users, CreditCard, TrendingUp, RefreshCw, Lock, ShieldOff, Eye, EyeOff } from "lucide-react";

const STORAGE_KEY = "bidready_admin_token";

// Dynamic base URL: empty string on Replit (relative URLs go through Vite proxy),
// direct port on local dev where the browser can reach localhost:3001 directly.
const API_BASE = window.location.origin.includes("replit.dev") ||
                 window.location.origin.includes("replit.app") ||
                 window.location.origin.includes("repl.co")
  ? ""
  : "http://localhost:3001";

const STATUS_COLORS = {
  success:   "bg-green-100 text-green-700",
  confirmed: "bg-green-100 text-green-700",
  pending:   "bg-yellow-100 text-yellow-700",
  failed:    "bg-red-100 text-red-700",
};

function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

export default function Admin() {
  const [token, setToken]               = useState(() => localStorage.getItem(STORAGE_KEY) || "");
  const [authed, setAuthed]             = useState(false);
  const [authChecking, setAuthChecking] = useState(false);
  const [authError, setAuthError]       = useState("");
  const [showPw, setShowPw]             = useState(false);
  const [pwInput, setPwInput]           = useState("");

  const [stats, setStats]             = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState("");

  const fetchData = useCallback(async (tok) => {
    setLoading(true);
    setError("");
    try {
      const [statsRes, txRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/stats`,        { headers: authHeaders(tok) }),
        fetch(`${API_BASE}/api/admin/transactions`, { headers: authHeaders(tok) }),
      ]);
      if (statsRes.status === 401 || txRes.status === 401) {
        localStorage.removeItem(STORAGE_KEY);
        setAuthed(false);
        setToken("");
        setAuthError("Session expired. Please enter the password again.");
        return;
      }
      if (!statsRes.ok || !txRes.ok) throw new Error("Failed to load admin data");
      const [statsData, txData] = await Promise.all([statsRes.json(), txRes.json()]);
      setStats(statsData);
      setTransactions(txData.transactions || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    (async () => {
      setAuthChecking(true);
      try {
        const res = await fetch(`${API_BASE}/api/admin/stats`, { headers: authHeaders(token) });
        if (res.status === 401) {
          localStorage.removeItem(STORAGE_KEY);
          setToken("");
          return;
        }
        setAuthed(true);
        const statsData = await res.json();
        setStats(statsData);
        const txRes = await fetch(`${API_BASE}/api/admin/transactions`, { headers: authHeaders(token) });
        const txData = await txRes.json();
        setTransactions(txData.transactions || []);
      } catch {
        setToken("");
      } finally {
        setAuthChecking(false);
      }
    })();
  }, []);

  async function handleLogin(e) {
    e.preventDefault();
    setAuthError("");
    setAuthChecking(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/stats`, {
        headers: { Authorization: `Bearer ${pwInput}` },
      });
      if (res.status === 401) {
        setAuthError("Incorrect password. Access denied.");
        setPwInput("");
        return;
      }
      if (!res.ok) throw new Error("Server error");
      const statsData = await res.json();
      localStorage.setItem(STORAGE_KEY, pwInput);
      setToken(pwInput);
      setStats(statsData);
      setAuthed(true);
      const txRes = await fetch(`${API_BASE}/api/admin/transactions`, {
        headers: { Authorization: `Bearer ${pwInput}` },
      });
      const txData = await txRes.json();
      setTransactions(txData.transactions || []);
    } catch {
      setAuthError("Could not reach the server. Please try again.");
    } finally {
      setAuthChecking(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEY);
    setToken("");
    setAuthed(false);
    setPwInput("");
    setStats(null);
    setTransactions([]);
  }

  if (!authed) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center">
        <div className="w-full max-w-sm">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-lg p-8">
            <div className="flex flex-col items-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center mb-4">
                <Lock className="w-7 h-7 text-white" />
              </div>
              <h1 className="text-xl font-bold text-slate-900">Admin Access</h1>
              <p className="text-slate-500 text-sm mt-1 text-center">
                Enter the admin password to view payment analytics.
              </p>
            </div>

            {authError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
                <ShieldOff className="w-4 h-4 text-red-500 shrink-0" />
                <span className="text-sm text-red-700">{authError}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={pwInput}
                  onChange={(e) => setPwInput(e.target.value)}
                  placeholder="Admin password"
                  autoFocus
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 pr-11 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              <button
                type="submit"
                disabled={authChecking || !pwInput}
                className="w-full bg-slate-900 hover:bg-slate-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-xl text-sm transition-all flex items-center justify-center gap-2"
              >
                {authChecking ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Verifying…
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    Unlock Dashboard
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: "Total Revenue",
      value: `₦${Number(stats?.totalRevenue || 0).toLocaleString()}`,
      icon: DollarSign,
      color: "bg-green-100 text-green-600",
    },
    {
      label: "Paying Customers",
      value: stats?.payingCustomers ?? 0,
      icon: Users,
      color: "bg-blue-100 text-blue-600",
    },
    {
      label: "Total Transactions",
      value: stats?.totalTransactions ?? 0,
      icon: CreditCard,
      color: "bg-purple-100 text-purple-600",
    },
    {
      label: "Success Rate",
      value: `${stats?.successRate ?? 0}%`,
      icon: TrendingUp,
      color: "bg-brand-100 text-brand-600",
    },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">Payment analytics and transaction history</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchData(token)}
            disabled={loading}
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-slate-500 hover:text-red-600 bg-white border border-slate-200 px-3 py-2 rounded-lg transition-colors"
          >
            <Lock className="w-4 h-4" />
            Lock
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-700">
          {error}
          <button onClick={() => fetchData(token)} className="ml-2 underline">Retry</button>
        </div>
      )}

      {loading && !stats ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <p className="text-2xl font-bold text-slate-900">{value}</p>
                <p className="text-xs text-slate-500 mt-1">{label}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">Recent Transactions</h2>
            </div>
            {transactions.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-sm">No transactions yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                    <tr>
                      <th className="text-left px-6 py-3">User / Company</th>
                      <th className="text-left px-6 py-3">Plan</th>
                      <th className="text-right px-6 py-3">Amount</th>
                      <th className="text-center px-6 py-3">Status</th>
                      <th className="text-left px-6 py-3">Reference</th>
                      <th className="text-left px-6 py-3">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transactions.map((tx) => (
                      <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4 font-medium text-slate-800">{tx.company_name || tx.user_id || "Unknown Company"}</td>
                        <td className="px-6 py-4 text-slate-600">{tx.plan_name}</td>
                        <td className="px-6 py-4 text-right font-semibold text-slate-900">
                          ₦{Number(tx.amount).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span
                            className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                              STATUS_COLORS[tx.payment_status] || "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {tx.payment_status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <code className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                            {tx.payment_reference?.slice(0, 16)}…
                          </code>
                        </td>
                        <td className="px-6 py-4 text-slate-500">
                          {new Date(tx.created_at).toLocaleDateString("en-NG", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
