"use client";
import { useState } from "react";

export default function Theme() {
  const [dark, setDark] = useState(false);
  return (
    <div className={`min-h-screen transition-colors ${dark ? "bg-gray-900 text-gray-100" : "bg-gray-100 text-gray-800"}`}>
      <div className="max-w-2xl mx-auto p-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Theme Toggle</h1>
          <button onClick={() => setDark(d => !d)} className={`px-4 py-2 rounded-lg font-semibold transition-colors ${dark ? "bg-yellow-400 text-gray-900 hover:bg-yellow-300" : "bg-gray-800 text-white hover:bg-gray-700"}`}>
            {dark ? "Light Mode" : "Dark Mode"}
          </button>
        </div>
        <div className={`rounded-xl p-6 space-y-3 ${dark ? "bg-gray-800" : "bg-white shadow-lg"}`}>
          <h2 className="text-xl font-bold">Card Title</h2>
          <p className={dark ? "text-gray-300" : "text-gray-600"}>This card demonstrates theme switching. The entire UI adapts its colors based on the current mode selection.</p>
          <div className="flex gap-3">
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${dark ? "bg-indigo-900 text-indigo-300" : "bg-indigo-100 text-indigo-600"}`}>Tag One</span>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${dark ? "bg-green-900 text-green-300" : "bg-green-100 text-green-600"}`}>Tag Two</span>
          </div>
        </div>
        <div className={`rounded-xl p-6 ${dark ? "bg-gray-800" : "bg-white shadow-lg"}`}>
          <h2 className="text-xl font-bold mb-3">Statistics</h2>
          <div className="grid grid-cols-3 gap-4">
            {[{ l: "Views", v: "12.4k" }, { l: "Likes", v: "3.2k" }, { l: "Shares", v: "890" }].map(s => (
              <div key={s.l} className="text-center">
                <p className="text-2xl font-bold">{s.v}</p>
                <p className={`text-sm ${dark ? "text-gray-400" : "text-gray-500"}`}>{s.l}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
