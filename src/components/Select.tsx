"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import "@/app/select.css";

type SelectOption = {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

type SelectProps = {
  id: string;
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

export default function Select({ id, label, value, options, onChange, placeholder = "Choose an option", disabled }: SelectProps) {
  const listId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const search = useRef({ text: "", at: 0 });
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [placement, setPlacement] = useState<CSSProperties>({});
  const selected = options.find(option => option.value === value);
  const enabled = options.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);
  const expanded = open && !disabled;

  function measure() {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportWidth = viewport?.width ?? window.innerWidth;
    const viewportHeight = viewport?.height ?? window.innerHeight;
    const width = Math.min(Math.max(rect.width, 280), viewportWidth - 24);
    const below = viewportTop + viewportHeight - rect.bottom - 12;
    const above = rect.top - viewportTop - 12;
    const upwards = below < 240 && above > below;
    setPlacement({
      left: Math.max(viewportLeft + 12, Math.min(rect.left, viewportLeft + viewportWidth - width - 12)),
      width,
      maxHeight: Math.max(48, Math.min(360, upwards ? above - 6 : below - 6)),
      ...(upwards ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }),
    });
  }

  function show(index = options.findIndex(option => option.value === value && !option.disabled)) {
    if (disabled || !enabled.length) return;
    measure();
    setActiveIndex(index >= 0 ? index : enabled[0]);
    setOpen(true);
  }

  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled) return;
    setOpen(false);
    search.current.text = "";
    if (option.value !== value) onChange(option.value);
    trigger.current?.focus({ preventScroll: true });
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key === "Escape") {
      if (expanded) event.preventDefault();
      setOpen(false);
      search.current.text = "";
      return;
    }
    if (event.key === "Enter" || (event.key === " " && (!search.current.text || Date.now() - search.current.at > 700))) {
      event.preventDefault();
      if (expanded) choose(activeIndex);
      else show();
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      search.current.text = "";
      if (event.key === "Home") show(enabled[0]);
      else if (event.key === "End") show(enabled.at(-1));
      else if (!expanded) show();
      else {
        const current = enabled.indexOf(activeIndex);
        const next = current + (event.key === "ArrowDown" ? 1 : -1);
        setActiveIndex(enabled[(next + enabled.length) % enabled.length]);
      }
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      const query = (now - search.current.at > 700 ? "" : search.current.text) + event.key.toLocaleLowerCase();
      search.current = { text: query, at: now };
      const repeated = [...query].every(character => character === query[0]);
      const matchText = repeated ? query[0] : query;
      const start = repeated ? activeIndex + 1 : 0;
      const ordered = [...enabled.filter(index => index >= start), ...enabled.filter(index => index < start)];
      const match = ordered.find(index => options[index].label.toLocaleLowerCase().startsWith(matchText));
      if (match !== undefined) show(match);
    }
  }

  useEffect(() => {
    if (!expanded) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !trigger.current?.contains(event.target) && !list.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
    };
  }, [expanded]);

  useEffect(() => {
    if (expanded) document.getElementById(`${listId}-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [expanded, activeIndex, listId]);

  return (
    <div className="buffer-select">
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-activedescendant={expanded && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        className={`buffer-select-trigger${expanded ? " is-open" : ""}`}
        disabled={disabled}
        onClick={() => expanded ? setOpen(false) : show()}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      >
        <span className={selected ? "" : "buffer-select-placeholder"}>{selected?.label ?? placeholder}</span>
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {expanded && createPortal(
        <div ref={list} id={listId} role="listbox" aria-label={label} className="buffer-select-list" style={placement}>
          {options.map((option, index) => (
            <div
              key={option.value}
              id={`${listId}-${index}`}
              role="option"
              aria-label={option.label}
              aria-selected={option.value === value}
              aria-disabled={option.disabled || undefined}
              className={`buffer-select-option${index === activeIndex ? " is-active" : ""}`}
              onPointerDown={event => event.preventDefault()}
              onPointerMove={event => { if (event.pointerType === "mouse" && !option.disabled) setActiveIndex(index); }}
              onClick={() => choose(index)}
            >
              <span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>
              {option.value === value && <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true"><path d="m3.5 8 3 3 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
