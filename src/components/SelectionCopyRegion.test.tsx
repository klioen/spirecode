import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "../i18n";
import {
  SelectionCopyRegion,
  selectionTextWithin,
} from "./SelectionCopyRegion";

const writeText = vi.fn().mockResolvedValue(undefined);

function selectContents(node: Node): Selection {
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  const range = document.createRange();
  range.selectNodeContents(node);
  selection.addRange(range);
  return selection;
}

beforeEach(() => {
  setLanguage("en");
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText },
  });
  window.getSelection()?.removeAllRanges();
});

describe("SelectionCopyRegion", () => {
  it("returns the exact non-empty selection only when both ends are in the region", () => {
    const { container } = render(
      <>
        <SelectionCopyRegion data-testid="region">
          <span data-testid="inside"> copied text </span>
        </SelectionCopyRegion>
        <span data-testid="outside">outside</span>
      </>,
    );
    const region = screen.getByTestId("region");
    const inside = screen.getByTestId("inside").firstChild!;
    const outside = screen.getByTestId("outside").firstChild!;

    expect(selectionTextWithin(region, selectContents(inside))).toBe(
      " copied text ",
    );
    expect(selectionTextWithin(region, selectContents(outside))).toBeNull();

    const whitespace = document.createTextNode("   \n");
    container.append(whitespace);
    region.append(whitespace);
    expect(selectionTextWithin(region, selectContents(whitespace))).toBeNull();

    const selection = window.getSelection()!;
    selection.removeAllRanges();
    const crossingRange = document.createRange();
    crossingRange.setStart(inside, 1);
    crossingRange.setEnd(outside, outside.textContent!.length);
    selection.addRange(crossingRange);
    expect(selectionTextWithin(region, selection)).toBeNull();
  });

  it("opens only for a valid in-region selection and copies the captured full text", async () => {
    render(
      <SelectionCopyRegion data-testid="region">
        <span data-testid="text"> complete selection </span>
      </SelectionCopyRegion>,
    );
    const region = screen.getByTestId("region");
    selectContents(screen.getByTestId("text").firstChild!);

    fireEvent.contextMenu(region, { clientX: 24, clientY: 30 });
    const copy = screen.getByRole("menuitem", { name: "Copy" });
    expect(copy).toHaveFocus();
    fireEvent.click(copy);

    expect(writeText).toHaveBeenCalledWith(" complete selection ");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("does not consume a context menu without a valid selection", () => {
    render(
      <SelectionCopyRegion data-testid="region">
        No selection
      </SelectionCopyRegion>,
    );
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
    });

    screen.getByTestId("region").dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("uses the current Chinese copy label", () => {
    setLanguage("zh-CN");
    render(
      <SelectionCopyRegion data-testid="region">
        <span data-testid="text">可复制文字</span>
      </SelectionCopyRegion>,
    );
    selectContents(screen.getByTestId("text").firstChild!);

    fireEvent.contextMenu(screen.getByTestId("region"));

    expect(screen.getByRole("menuitem", { name: "复制" })).toBeInTheDocument();
  });
});
