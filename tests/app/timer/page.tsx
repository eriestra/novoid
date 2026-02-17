"use client";
import { useState, useRef, useCallback } from "react";

export default function Timer() {
  const [ms, setMs] = useState(0);
  const [running, setRunning] = useState(false);
  const [laps, setLaps] = useState<number[]>([]);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  const fmt = (t: number) => {
    const m = Math.floor(t / 60000); const s = Math.floor((t % 60000) / 1000); const mil = Math.floor((t % 1000) / 10);
    return `${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}.${String(mil).padStart(2,"0")}`;
  };

  const start = useCallback(() => {
    if (running) return;
    setRunning(true);
    const t0 = Date.now() - ms;
    ref.current = setInterval(() => setMs(Date.now() - t0), 10);
  }, [running, ms]);

  const stop = useCallback(() => { if (ref.current) clearInterval(ref.current); setRunning(false); }, []);
  const reset = useCallback(() => { stop(); setMs(0); setLaps([]); }, [stop]);
  const lap = useCallback(() => { setLaps(l => [...l, ms]); }, [ms]);

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-80 space-y-6 text-center">
        <h1 className="text-2xl font-bold text-gray-800">Stopwatch</h1>
        <p className="text-5xl font-mono text-indigo-600">{fmt(ms)}</p>
        <div className="flex gap-3 justify-center">
          {!running ? <button onClick={start} className="px-4 py-2 bg-green-500 text-white rounded-lg font-semibold hover:bg-green-600">Start</button>
                    : <button onClick={stop} className="px-4 py-2 bg-yellow-500 text-white rounded-lg font-semibold hover:bg-yellow-600">Stop</button>}
          <button onClick={lap} disabled={!running} className="px-4 py-2 bg-indigo-500 text-white rounded-lg font-semibold hover:bg-indigo-600 disabled:opacity-40">Lap</button>
          <button onClick={reset} className="px-4 py-2 bg-red-500 text-white rounded-lg font-semibold hover:bg-red-600">Reset</button>
        </div>
        {laps.length > 0 && (
          <ul className="text-left space-y-1 max-h-40 overflow-y-auto">
            {laps.map((l, i) => <li key={i} className="text-sm font-mono text-gray-600">Lap {i+1}: {fmt(l)}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}
