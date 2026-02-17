"use client";
import { useState } from "react";

const metrics = [
  { label: "Revenue", value: "$48,200", change: "+12%", color: "text-green-600" },
  { label: "Users", value: "2,340", change: "+8%", color: "text-green-600" },
  { label: "Orders", value: "1,120", change: "-3%", color: "text-red-500" },
  { label: "Growth", value: "24%", change: "+5%", color: "text-green-600" },
];

const barData = [
  { label: "Mon", value: 65 }, { label: "Tue", value: 80 }, { label: "Wed", value: 45 },
  { label: "Thu", value: 90 }, { label: "Fri", value: 70 }, { label: "Sat", value: 55 }, { label: "Sun", value: 85 },
];

export default function Dashboard() {
  const [selected, setSelected] = useState<number | null>(null);
  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <h1 className="text-3xl font-bold text-gray-800 mb-6">Dashboard</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {metrics.map((m, i) => (
          <div key={i} className="bg-white rounded-xl shadow p-5">
            <p className="text-sm text-gray-500">{m.label}</p>
            <p className="text-2xl font-bold text-gray-800">{m.value}</p>
            <p className={`text-sm font-medium ${m.color}`}>{m.change}</p>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl shadow p-6">
        <h2 className="text-lg font-bold text-gray-700 mb-4">Weekly Activity</h2>
        <div className="flex items-end gap-3 h-48">
          {barData.map((d, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1 cursor-pointer" onClick={() => setSelected(i)}>
              <span className={`text-xs font-medium ${selected === i ? "text-indigo-600" : "text-gray-400"}`}>{d.value}</span>
              <div className={`w-full rounded-t-lg transition-all ${selected === i ? "bg-indigo-600" : "bg-indigo-400 hover:bg-indigo-500"}`} style={{ height: `${d.value}%` }} />
              <span className="text-xs text-gray-500">{d.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
