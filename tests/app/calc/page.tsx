"use client";
import { useState } from "react";

export default function Calc() {
  const [display, setDisplay] = useState("0");
  const [prev, setPrev] = useState<number | null>(null);
  const [op, setOp] = useState<string | null>(null);
  const [reset, setReset] = useState(false);

  const digit = (d: string) => {
    if (reset) { setDisplay(d); setReset(false); }
    else setDisplay(display === "0" ? d : display + d);
  };
  const operator = (o: string) => { setPrev(parseFloat(display)); setOp(o); setReset(true); };
  const calc = () => {
    if (prev === null || !op) return;
    const cur = parseFloat(display);
    const r = op === "+" ? prev + cur : op === "-" ? prev - cur : op === "*" ? prev * cur : op === "/" ? (cur !== 0 ? prev / cur : NaN) : cur;
    setDisplay(String(r)); setPrev(null); setOp(null); setReset(true);
  };
  const clear = () => { setDisplay("0"); setPrev(null); setOp(null); };

  const btn = (label: string, action: () => void, cls: string) => (
    <button key={label} onClick={action} className={`p-4 rounded-xl text-xl font-semibold ${cls}`}>{label}</button>
  );

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg p-6 w-72 space-y-4">
        <div className="bg-gray-900 text-white text-right text-3xl font-mono p-4 rounded-xl truncate">{display}</div>
        <div className="grid grid-cols-4 gap-2">
          {btn("C", clear, "bg-red-400 text-white hover:bg-red-500 col-span-2")}
          {btn("/", () => operator("/"), "bg-indigo-400 text-white hover:bg-indigo-500")}
          {btn("*", () => operator("*"), "bg-indigo-400 text-white hover:bg-indigo-500")}
          {["7","8","9"].map(d => btn(d, () => digit(d), "bg-gray-200 hover:bg-gray-300"))}
          {btn("-", () => operator("-"), "bg-indigo-400 text-white hover:bg-indigo-500")}
          {["4","5","6"].map(d => btn(d, () => digit(d), "bg-gray-200 hover:bg-gray-300"))}
          {btn("+", () => operator("+"), "bg-indigo-400 text-white hover:bg-indigo-500")}
          {["1","2","3"].map(d => btn(d, () => digit(d), "bg-gray-200 hover:bg-gray-300"))}
          {btn("=", calc, "bg-green-500 text-white hover:bg-green-600")}
          {btn("0", () => digit("0"), "bg-gray-200 hover:bg-gray-300 col-span-2")}
          {btn(".", () => { if (!display.includes(".")) setDisplay(display + "."); }, "bg-gray-200 hover:bg-gray-300")}
        </div>
      </div>
    </div>
  );
}
