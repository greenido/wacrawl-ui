import { X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

export interface PickerOption {
  value: string;
  label: string;
  hint?: string;
}

interface EntityPickerProps {
  label: string;
  placeholder: string;
  /** The selected value, which comes from the URL. */
  value: string | undefined;
  /** Its display name, which arrives after the value on a deep link. */
  valueLabel: string | undefined;
  onChange: (value: string | undefined) => void;
  loadOptions: (query: string) => Promise<PickerOption[]>;
}

const DEBOUNCE_MS = 200;

/** Pick one chat or person by name; the lists are too long for a native select. */
export function EntityPicker({ label, placeholder, value, valueLabel, onChange, loadOptions }: EntityPickerProps) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<PickerOption[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const timeout = window.setTimeout(() => {
      loadOptions(query.trim())
        .then((next) => {
          if (!active) return;
          setOptions(next);
          setActiveIndex(0);
        })
        .catch((err: Error) => console.error(`Failed to load ${label} options:`, err));
    }, DEBOUNCE_MS);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [label, loadOptions, open, query]);

  function choose(option: PickerOption) {
    onChange(option.value);
    setQuery('');
    setOpen(false);
  }

  const fieldClass = 'mt-1 flex h-9 w-full items-center rounded-lg border border-slate-200 bg-white px-2.5 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50';

  return (
    <div className="relative min-w-0 text-xs font-medium text-slate-500 dark:text-slate-400">
      <label htmlFor={`${listId}-input`}>{label}</label>
      {value ? (
        <span className={`${fieldClass} justify-between gap-2 font-normal`}>
          <span className="truncate text-slate-900 dark:text-slate-100">{valueLabel ?? value}</span>
          <button
            type="button"
            onClick={() => onChange(undefined)}
            aria-label={`Clear ${label} filter`}
            className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </span>
      ) : (
        <input
          id={`${listId}-input`}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && options[activeIndex] ? `${listId}-${activeIndex}` : undefined}
          value={query}
          placeholder={placeholder}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setOpen(false);
            } else if (event.key === 'ArrowDown' && options.length > 0) {
              event.preventDefault();
              setActiveIndex((index) => (index + 1) % options.length);
            } else if (event.key === 'ArrowUp' && options.length > 0) {
              event.preventDefault();
              setActiveIndex((index) => (index - 1 + options.length) % options.length);
            } else if (event.key === 'Enter' && open && options[activeIndex]) {
              event.preventDefault();
              choose(options[activeIndex]);
            }
          }}
          className={`${fieldClass} font-normal outline-none transition focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10`}
        />
      )}
      {open && !value && options.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full min-w-56 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 font-normal shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              // mousedown, because the blur a click causes would close the list first.
              onMouseDown={(event) => {
                event.preventDefault();
                choose(option);
              }}
              onMouseEnter={() => setActiveIndex(index)}
              className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-1.5 text-sm text-slate-800 dark:text-slate-100 ${index === activeIndex ? 'bg-slate-100 dark:bg-slate-800' : ''}`}
            >
              <span className="truncate">{option.label}</span>
              {option.hint ? <span className="shrink-0 text-xs text-slate-400">{option.hint}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
