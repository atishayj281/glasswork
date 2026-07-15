import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
}

interface SelectProps {
  label?: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  className?: string;
}

const fieldBase =
  "w-full mt-1 px-3 py-2 rounded-lg text-sm bg-slate-900/60 border border-slate-700/50 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-neon-cyan/50 focus:shadow-neon-sm transition-all duration-200";

export function Input({ label, className = "", ...props }: InputProps) {
  return (
    <div>
      {label && <label className="text-xs text-slate-400 font-medium tracking-wide">{label}</label>}
      <input className={`${fieldBase} ${className}`} {...props} />
    </div>
  );
}

export function Textarea({ label, className = "", ...props }: TextareaProps) {
  return (
    <div>
      {label && <label className="text-xs text-slate-400 font-medium tracking-wide">{label}</label>}
      <textarea className={`${fieldBase} font-mono ${className}`} {...props} />
    </div>
  );
}

export function Select({ label, value, options, onChange, className = "" }: SelectProps) {
  return (
    <div>
      {label && <label className="text-xs text-slate-400 font-medium tracking-wide">{label}</label>}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${fieldBase} ${className}`}
      >
        {options.map((o) => (
          <option key={o} value={o} className="bg-slate-900">
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
