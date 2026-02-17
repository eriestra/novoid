"use client";
import { useState } from "react";

interface Todo { id: number; text: string; done: boolean }

export default function TodoApp() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [input, setInput] = useState("");
  const [filter, setFilter] = useState<"all"|"active"|"completed">("all");

  const add = () => { if (!input.trim()) return; setTodos(t => [...t, { id: Date.now(), text: input.trim(), done: false }]); setInput(""); };
  const toggle = (id: number) => setTodos(t => t.map(x => x.id === id ? { ...x, done: !x.done } : x));
  const remove = (id: number) => setTodos(t => t.filter(x => x.id !== id));
  const filtered = todos.filter(t => filter === "all" ? true : filter === "active" ? !t.done : t.done);

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md space-y-4">
        <h1 className="text-2xl font-bold text-gray-800">Todo List</h1>
        <div className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} placeholder="Add todo..." className="flex-1 border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          <button onClick={add} className="px-4 py-2 bg-indigo-500 text-white rounded-lg font-semibold hover:bg-indigo-600">Add</button>
        </div>
        <div className="flex gap-2">
          {(["all","active","completed"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1 rounded-full text-sm font-medium ${filter === f ? "bg-indigo-500 text-white" : "bg-gray-200 text-gray-600"}`}>{f}</button>
          ))}
        </div>
        <ul className="space-y-2">
          {filtered.map(t => (
            <li key={t.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
              <input type="checkbox" checked={t.done} onChange={() => toggle(t.id)} className="w-5 h-5" />
              <span className={`flex-1 ${t.done ? "line-through text-gray-400" : "text-gray-700"}`}>{t.text}</span>
              <button onClick={() => remove(t.id)} className="text-red-400 hover:text-red-600 text-sm">Delete</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
