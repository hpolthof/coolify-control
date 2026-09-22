import { cn } from '@/lib/cn';
import { Search } from 'lucide-react';
import {
  InputHTMLAttributes,
  ReactNode,
  TextareaHTMLAttributes,
  forwardRef,
  useMemo,
  useState,
} from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'bg-sunken border border-rule rounded-control h-8 px-3 text-15 text-ink placeholder:text-ink-3',
        'focus:outline-none focus:border-rule-strong transition-colors',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'bg-sunken border border-rule rounded-control px-3 py-2 text-15 text-ink placeholder:text-ink-3 font-sans',
        'focus:outline-none focus:border-rule-strong transition-colors resize-none',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
}

export function Select({
  value,
  onChange,
  options,
  placeholder,
  className,
}: SelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        'bg-sunken border border-rule rounded-control h-8 px-3 text-15 text-ink',
        'focus:outline-none focus:border-rule-strong transition-colors cursor-pointer',
        'appearance-none bg-no-repeat bg-right pr-8',
        className,
      )}
      style={{
        backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3e%3cpath fill='none' stroke='%23a9b4c8' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='m2 5 6 6 6-6'/%3e%3c/svg%3e")`,
        backgroundPosition: 'right 0.5rem center',
        backgroundSize: '16px 16px',
      }}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

interface SearchInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: string;
  onChange: (value: string) => void;
}

export function SearchInput({ className, value, onChange, ...props }: SearchInputProps) {
  return (
    <div className="relative">
      <Search
        size={16}
        className="absolute left-3 top-1/2 transform -translate-y-1/2 text-ink-3 pointer-events-none"
      />
      <Input
        type="search"
        className={cn('pl-9', className)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...props}
      />
    </div>
  );
}

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}

export function Field({ label, hint, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-13 font-medium text-ink">{label}</label>
      {children}
      {hint && <div className="text-12 text-ink-3">{hint}</div>}
      {error && <div className="text-12 text-crit">{error}</div>}
    </div>
  );
}
