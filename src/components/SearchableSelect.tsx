import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useTranslation } from "../i18n";

export interface SearchableSelectOption {
  value: string;
  label: string;
  group?: string;
  keywords?: string[];
  disabled?: boolean;
}

export interface SearchableSelectProps {
  ariaLabel: string;
  value: string;
  options: SearchableSelectOption[];
  onChange(value: string): void;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
}

export function SearchableSelect({
  ariaLabel,
  value,
  options,
  onChange,
  disabled = false,
  autoFocus = false,
  className,
  searchPlaceholder,
  emptyLabel,
}: SearchableSelectProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listboxId = `${useId()}-options`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((option) => option.value === value);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredOptions = useMemo(
    () =>
      options.filter((option) => {
        if (!normalizedQuery) return true;
        return [option.label, option.group, ...(option.keywords ?? [])].some(
          (candidate) =>
            candidate?.toLocaleLowerCase().includes(normalizedQuery),
        );
      }),
    [normalizedQuery, options],
  );
  const selectedIndex = filteredOptions.findIndex(
    (option) => option.value === value && !option.disabled,
  );
  const firstEnabledIndex = filteredOptions.findIndex(
    (option) => !option.disabled,
  );
  const [activeIndex, setActiveIndex] = useState(
    selectedIndex >= 0 ? selectedIndex : Math.max(firstEnabledIndex, 0),
  );

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const nextSelected = filteredOptions.findIndex(
      (option) => option.value === value && !option.disabled,
    );
    const nextEnabled = filteredOptions.findIndex((option) => !option.disabled);
    setActiveIndex(nextSelected >= 0 ? nextSelected : Math.max(nextEnabled, 0));
  }, [filteredOptions, value]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (rootRef.current && event.composedPath().includes(rootRef.current))
        return;
      setOpen(false);
      setQuery("");
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
  }, [open]);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    setQuery("");
    if (returnFocus) triggerRef.current?.focus();
  };

  const choose = (option: SearchableSelectOption) => {
    if (option.disabled) return;
    onChange(option.value);
    close(true);
  };

  const moveActive = (offset: number) => {
    if (!filteredOptions.some((option) => !option.disabled)) return;
    setActiveIndex((current) => {
      let next = current;
      do {
        next =
          (next + offset + filteredOptions.length) % filteredOptions.length;
      } while (filteredOptions[next]?.disabled);
      return next;
    });
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter") {
      const option = filteredOptions[activeIndex];
      if (!option || option.disabled) return;
      event.preventDefault();
      choose(option);
    }
  };

  const groups = filteredOptions.reduce<
    Array<{
      label?: string;
      options: Array<{ option: SearchableSelectOption; index: number }>;
    }>
  >((result, option, index) => {
    const previous = result[result.length - 1];
    if (previous && previous.label === option.group) {
      previous.options.push({ option, index });
    } else {
      result.push({ label: option.group, options: [{ option, index }] });
    }
    return result;
  }, []);

  const resolvedSearchPlaceholder =
    searchPlaceholder ?? t("common.searchOptions", { label: ariaLabel });
  const resolvedEmptyLabel = emptyLabel ?? t("common.noOptionsFound");

  return (
    <div
      ref={rootRef}
      className={["searchable-select", className].filter(Boolean).join(" ")}
    >
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        onClick={() => {
          setQuery("");
          setOpen((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (!open) setOpen(true);
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            close(false);
          }
        }}
      >
        <span>{selected?.label ?? value}</span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open ? (
        <div className="searchable-select-popover">
          <input
            ref={searchRef}
            type="search"
            aria-label={resolvedSearchPlaceholder}
            aria-controls={listboxId}
            aria-activedescendant={
              filteredOptions[activeIndex]
                ? `${listboxId}-option-${activeIndex}`
                : undefined
            }
            value={query}
            placeholder={resolvedSearchPlaceholder}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={onSearchKeyDown}
          />
          <div
            id={listboxId}
            className="searchable-select-options"
            role="listbox"
          >
            {groups.length ? (
              groups.map((group, groupIndex) => (
                <div
                  className="searchable-select-group"
                  key={`${group.label ?? ""}-${groupIndex}`}
                >
                  {group.label ? (
                    <div className="searchable-select-group-label">
                      {group.label}
                    </div>
                  ) : null}
                  {group.options.map(({ option, index }) => (
                    <button
                      id={`${listboxId}-option-${index}`}
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={option.value === value}
                      disabled={option.disabled}
                      className={index === activeIndex ? "active" : undefined}
                      onPointerMove={() => {
                        if (!option.disabled) setActiveIndex(index);
                      }}
                      onClick={() => choose(option)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ))
            ) : (
              <p className="searchable-select-empty">{resolvedEmptyLabel}</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
