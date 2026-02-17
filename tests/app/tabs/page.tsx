"use client";
import { useState } from "react";

const tabs = [
  { label: "Overview", content: "This is the overview panel. It provides a high-level summary of the application state, recent activity, and key metrics at a glance." },
  { label: "Details", content: "The details panel shows in-depth information including configuration settings, data breakdowns, and technical specifications for advanced users." },
  { label: "History", content: "The history panel displays a chronological log of all changes, actions, and events that have occurred within the system over time." },
];

export default function Tabs() {
  const [active, setActive] = useState(0);
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-lg overflow-hidden">
        <div className="flex border-b">
          {tabs.map((t, i) => (
            <button key={i} onClick={() => setActive(i)} className={`flex-1 py-3 text-sm font-semibold transition-colors ${active === i ? "text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50" : "text-gray-500 hover:text-gray-700"}`}>{t.label}</button>
          ))}
        </div>
        <div className="p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-2">{tabs[active].label}</h2>
          <p className="text-gray-600 leading-relaxed">{tabs[active].content}</p>
        </div>
      </div>
    </div>
  );
}
