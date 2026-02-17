"use client";
import { useState } from "react";

interface Card { id: number; text: string }
type Col = "todo" | "progress" | "done";
const cols: { key: Col; label: string; color: string }[] = [
  { key: "todo", label: "Todo", color: "bg-blue-100" },
  { key: "progress", label: "In Progress", color: "bg-yellow-100" },
  { key: "done", label: "Done", color: "bg-green-100" },
];

export default function Kanban() {
  const [board, setBoard] = useState<Record<Col, Card[]>>({ todo: [], progress: [], done: [] });
  const [inputs, setInputs] = useState<Record<Col, string>>({ todo: "", progress: "", done: "" });

  const add = (col: Col) => {
    const text = inputs[col].trim();
    if (!text) return;
    setBoard(b => ({ ...b, [col]: [...b[col], { id: Date.now(), text }] }));
    setInputs(i => ({ ...i, [col]: "" }));
  };

  const move = (from: Col, id: number, to: Col) => {
    setBoard(b => {
      const card = b[from].find(c => c.id === id);
      if (!card) return b;
      return { ...b, [from]: b[from].filter(c => c.id !== id), [to]: [...b[to], card] };
    });
  };

  const colIdx = (c: Col) => cols.findIndex(x => x.key === c);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <h1 className="text-3xl font-bold text-gray-800 mb-6 text-center">Kanban Board</h1>
      <div className="grid grid-cols-3 gap-6 max-w-5xl mx-auto">
        {cols.map(({ key, label, color }) => (
          <div key={key} className={`${color} rounded-2xl p-4 space-y-3`}>
            <h2 className="font-bold text-lg text-gray-700">{label} ({board[key].length})</h2>
            <div className="flex gap-2">
              <input value={inputs[key]} onChange={e => setInputs(i => ({ ...i, [key]: e.target.value }))} onKeyDown={e => e.key === "Enter" && add(key)} placeholder="New card..." className="flex-1 px-3 py-1.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300" />
              <button onClick={() => add(key)} className="px-3 py-1.5 bg-indigo-500 text-white rounded-lg text-sm font-semibold hover:bg-indigo-600">+</button>
            </div>
            <ul className="space-y-2">
              {board[key].map(card => (
                <li key={card.id} className="bg-white rounded-lg p-3 shadow-sm flex items-center justify-between">
                  <span className="text-sm text-gray-700">{card.text}</span>
                  <div className="flex gap-1">
                    {colIdx(key) > 0 && <button onClick={() => move(key, card.id, cols[colIdx(key)-1].key)} className="text-xs px-2 py-1 bg-gray-200 rounded hover:bg-gray-300">&larr;</button>}
                    {colIdx(key) < 2 && <button onClick={() => move(key, card.id, cols[colIdx(key)+1].key)} className="text-xs px-2 py-1 bg-gray-200 rounded hover:bg-gray-300">&rarr;</button>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
