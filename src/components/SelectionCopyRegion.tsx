import {
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "../i18n";

const MENU_WIDTH = 142;
const MENU_HEIGHT = 35;
const VIEWPORT_MARGIN = 8;

interface CopyMenuState {
  text: string;
  left: number;
  top: number;
}

interface SelectionCopyRegionProps extends HTMLAttributes<HTMLElement> {
  as?: "article" | "div";
  elementRef?: (node: HTMLElement | null) => void;
}

export function selectionTextWithin(
  region: HTMLElement,
  selection: Selection | null,
): string | null {
  if (
    !selection ||
    selection.rangeCount === 0 ||
    !selection.anchorNode ||
    !selection.focusNode ||
    !region.contains(selection.anchorNode) ||
    !region.contains(selection.focusNode)
  )
    return null;
  const text = selection.toString();
  return text.trim() ? text : null;
}

export function SelectionCopyRegion({
  as: Tag = "div",
  children,
  elementRef,
  onContextMenu,
  ...props
}: SelectionCopyRegionProps) {
  const { t } = useTranslation();
  const regionRef = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<CopyMenuState | null>(null);

  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const closeOnOutsidePress = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setMenu(null);
    };
    const close = () => setMenu(null);
    document.addEventListener("mousedown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  const handleContextMenu = (event: ReactMouseEvent<HTMLElement>) => {
    onContextMenu?.(event);
    if (event.defaultPrevented) return;
    const region = regionRef.current;
    const text = region
      ? selectionTextWithin(region, window.getSelection())
      : null;
    if (!text) {
      setMenu(null);
      return;
    }
    event.preventDefault();
    const maxLeft = Math.max(VIEWPORT_MARGIN, window.innerWidth - MENU_WIDTH);
    const maxTop = Math.max(VIEWPORT_MARGIN, window.innerHeight - MENU_HEIGHT);
    setMenu({
      text,
      left: Math.max(VIEWPORT_MARGIN, Math.min(event.clientX, maxLeft)),
      top: Math.max(VIEWPORT_MARGIN, Math.min(event.clientY, maxTop)),
    });
  };

  return (
    <>
      <Tag
        {...props}
        ref={(node) => {
          regionRef.current = node;
          elementRef?.(node);
        }}
        onContextMenu={handleContextMenu}
      >
        {children}
      </Tag>
      {menu
        ? createPortal(
            <div
              className="selection-copy-menu"
              role="menu"
              ref={menuRef}
              style={{ left: menu.left, top: menu.top }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  const copy = navigator.clipboard?.writeText(menu.text);
                  setMenu(null);
                  void copy?.catch(() => undefined);
                }}
              >
                {t("contextMenu.copy")}
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
