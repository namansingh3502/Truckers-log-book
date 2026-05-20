import { useEffect, useId, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { Input } from './ui/input';
import { searchSuggestions, type GeocodeResult } from '../services/routing';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect?: (suggestion: GeocodeResult) => void;
  placeholder?: string;
  required?: boolean;
  debounceMs?: number;
}

export function LocationAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder,
  required,
  debounceMs = 250,
}: Props) {
  const [suggestions, setSuggestions] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const skipNextFetchRef = useRef(false);
  const listboxId = useId();

  useEffect(() => {
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }
    const query = value.trim();
    if (query.length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const handle = window.setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      searchSuggestions(query, controller.signal)
        .then((results) => {
          if (controller.signal.aborted) return;
          setSuggestions(results);
          setActiveIndex(results.length > 0 ? 0 : -1);
        })
        .catch((err: Error) => {
          if (err.name !== 'AbortError') setSuggestions([]);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, debounceMs);

    return () => {
      window.clearTimeout(handle);
    };
  }, [value, debounceMs]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function pick(suggestion: GeocodeResult) {
    skipNextFetchRef.current = true;
    onChange(suggestion.displayName);
    onSelect?.(suggestion);
    setSuggestions([]);
    setOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (event.key === 'Enter') {
      if (activeIndex >= 0) {
        event.preventDefault();
        pick(suggestions[activeIndex]);
      }
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  }

  const showDropdown = open && (loading || suggestions.length > 0);

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={
          activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined
        }
      />
      {showDropdown && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg"
        >
          {loading && suggestions.length === 0 && (
            <li className="px-3 py-2 text-slate-500">Searching…</li>
          )}
          {suggestions.map((suggestion, index) => (
            <li
              id={`${listboxId}-opt-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              key={`${suggestion.lat}-${suggestion.lon}-${index}`}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => {
                event.preventDefault();
                pick(suggestion);
              }}
              className={`flex cursor-pointer items-start gap-2 px-3 py-2 ${
                index === activeIndex ? 'bg-blue-50 text-blue-950' : 'text-slate-800'
              }`}
            >
              <MapPin size={14} className="mt-0.5 shrink-0 text-slate-500" />
              <span className="truncate">{suggestion.displayName}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
