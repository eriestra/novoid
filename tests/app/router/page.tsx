"use client";
import { useState } from "react";

const pages: Record<string, { title: string; body: string }> = {
  home: { title: "Home", body: "Welcome to the homepage. This SPA router simulates navigation between pages using component state instead of URL changes." },
  about: { title: "About", body: "This is the about page. It describes the purpose of the application and provides background context for visitors." },
  contact: { title: "Contact", body: "Reach us at hello@example.com. We respond within 24 hours on business days." },
};

export default function Router() {
  const [page, setPage] = useState("home");
  const p = pages[page];
  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow">
        <div className="max-w-3xl mx-auto flex gap-6 px-6 py-4">
          {Object.keys(pages).map(k => (
            <button key={k} onClick={() => setPage(k)} className={`font-semibold capitalize ${page === k ? "text-indigo-600" : "text-gray-500 hover:text-gray-700"}`}>{k}</button>
          ))}
        </div>
      </nav>
      <main className="max-w-3xl mx-auto p-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-4">{p.title}</h1>
        <p className="text-gray-600 leading-relaxed">{p.body}</p>
      </main>
    </div>
  );
}
