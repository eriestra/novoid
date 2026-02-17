"use client";
import { useState } from "react";

export default function ContactForm() {
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Name is required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Valid email required";
    if (!form.message.trim()) e.message = "Message is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (validate()) { setSubmitted(true); setForm({ name: "", email: "", message: "" }); }
  };

  const field = (name: "name" | "email" | "message", label: string, type = "text") => (
    <div key={name}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {name === "message"
        ? <textarea value={form[name]} onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))} className="w-full border rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-indigo-400" rows={4} />
        : <input type={type} value={form[name]} onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))} className="w-full border rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-indigo-400" />}
      {errors[name] && <p className="text-red-500 text-xs mt-1">{errors[name]}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md space-y-4">
        <h1 className="text-2xl font-bold text-gray-800">Contact Us</h1>
        {submitted && <div className="bg-green-100 text-green-700 p-3 rounded-lg text-sm">Message sent successfully!</div>}
        <form onSubmit={submit} className="space-y-4">
          {field("name", "Name")}
          {field("email", "Email", "email")}
          {field("message", "Message")}
          <button type="submit" className="w-full py-2 bg-indigo-500 text-white rounded-lg font-semibold hover:bg-indigo-600">Send</button>
        </form>
      </div>
    </div>
  );
}
