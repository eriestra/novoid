"use client";
import { useState } from "react";

export default function Counter() {
  const [count, setCount] = useState(0);
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white rounded-2xl shadow-lg p-10 text-center space-y-6">
        <h1 className="text-3xl font-bold text-gray-800">Counter</h1>
        <p className="text-6xl font-mono text-indigo-600">{count}</p>
        <div className="flex gap-3 justify-center">
          <button onClick={() => setCount(c => c - 1)} className="px-5 py-2 rounded-lg bg-red-500 text-white font-semibold hover:bg-red-600">-1</button>
          <button onClick={() => setCount(0)} className="px-5 py-2 rounded-lg bg-gray-400 text-white font-semibold hover:bg-gray-500">Reset</button>
          <button onClick={() => setCount(c => c + 1)} className="px-5 py-2 rounded-lg bg-green-500 text-white font-semibold hover:bg-green-600">+1</button>
        </div>
      </div>
    </div>
  );
}
