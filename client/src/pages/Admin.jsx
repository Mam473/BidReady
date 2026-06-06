import React, { useEffect, useState } from "react";
import { DollarSign, Users, CreditCard, TrendingUp, RefreshCw } from "lucide-react";

const STATUS_COLORS = {
  success: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  failed: "bg-red-100 text-red-700",
};

export default function Admin() {
  const [stats, setStats] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function fetchData() {
    setLoading(true);
    setError("");
    try {
      const [statsRes, txRes] = await Promise.all([
        fetch("/api/admin/stats"),
        fetch("/api/admin/transactions"),
      ]);
      if (!statsRes.ok || !txRes.ok) throw new Error("Failed to load admin data");
      const [statsData, txData] = await Promise.all([statsRes.json(), txRes.json()]);
      setStats(statsData);
      setTransactions(txData.transactions || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center text-red-700">
        {error}
        <button onClick={fetchData} className="mt-3 block mx-auto text-sm underline">Retry</button>
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
        <button
          onClick={fetchData}
          className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3 py-2 rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

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
                    <td className="px-6 py-4 font-medium text-slate-800">{tx.user_id}</td>
                    <td className="px-6 py-4 text-slate-600">{tx.plan_name}</td>
                    <td className="px-6 py-4 text-right font-semibold text-slate-900">
                      ₦{Number(tx.amount / 100).toLocaleString()}
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
    </div>
  );
}
