import {
  type FocusEvent,
  type KeyboardEvent,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

const itemSelector = '[role="treeitem"][data-tree-id]';

const visibleItems = (tree: HTMLElement) =>
  Array.from(tree.querySelectorAll<HTMLElement>(itemSelector));

export function useTreeKeyboard(): {
  treeRef: RefObject<HTMLDivElement | null>;
  focusedId: string | null;
  onItemFocus: (event: FocusEvent<HTMLElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void;
} {
  const treeRef = useRef<HTMLDivElement>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const hadFocusedItem = useRef(false);

  useLayoutEffect(() => {
    const tree = treeRef.current;
    if (!tree) return;
    const items = visibleItems(tree);
    if (!items.length) {
      if (focusedId !== null) setFocusedId(null);
      return;
    }
    if (!items.some((item) => item.dataset.treeId === focusedId)) {
      const first = items[0];
      setFocusedId(first.dataset.treeId ?? null);
      if (hadFocusedItem.current) first.focus();
    }
  });

  const focusItem = (item: HTMLElement | undefined) => {
    if (!item) return;
    setFocusedId(item.dataset.treeId ?? null);
    item.focus();
  };

  const onItemFocus = (event: FocusEvent<HTMLElement>) => {
    hadFocusedItem.current = true;
    setFocusedId(event.currentTarget.dataset.treeId ?? null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const tree = treeRef.current;
    const current = event.currentTarget;
    if (!tree || current.getAttribute("role") !== "treeitem") return;
    const items = visibleItems(tree);
    const index = items.indexOf(current);
    if (index < 0) return;

    let handled = true;
    switch (event.key) {
      case "ArrowDown":
        focusItem(items[Math.min(index + 1, items.length - 1)]);
        break;
      case "ArrowUp":
        focusItem(items[Math.max(index - 1, 0)]);
        break;
      case "Home":
        focusItem(items[0]);
        break;
      case "End":
        focusItem(items[items.length - 1]);
        break;
      case "ArrowRight":
        if (current.hasAttribute("aria-expanded")) {
          if (current.getAttribute("aria-expanded") === "false") {
            current.click();
          } else {
            const level = Number(current.getAttribute("aria-level"));
            const next = items[index + 1];
            if (next && Number(next.getAttribute("aria-level")) === level + 1) {
              focusItem(next);
            }
          }
        }
        break;
      case "ArrowLeft":
        if (current.getAttribute("aria-expanded") === "true") {
          current.click();
        } else {
          const parentId = current.dataset.treeParentId;
          focusItem(items.find((item) => item.dataset.treeId === parentId));
        }
        break;
      case "Enter":
      case " ":
        current.click();
        break;
      default:
        handled = false;
    }
    if (handled) event.preventDefault();
  };

  return { treeRef, focusedId, onItemFocus, onKeyDown };
}
