import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/index.css", "utf8");

describe("Task layout", () => {
  it("centers a shared content column instead of separately centering resettable children", () => {
    expect(css).toMatch(
      /\.task-page-content\s*\{[^}]*width:\s*min\(920px, 100%\);[^}]*min-width:\s*0;[^}]*margin:\s*0 auto;/s,
    );
    expect(css).not.toMatch(/\.task-page\s*>\s*\*\s*\{/);
  });

  it("keeps the page as the scroll and responsive container", () => {
    expect(css).toMatch(
      /\.task-page\s*\{[^}]*container-type:\s*inline-size;[^}]*container-name:\s*task-surface;[^}]*height:\s*100%;[^}]*overflow:\s*auto;/s,
    );
    expect(css).toContain("@container task-surface (max-width: 600px)");
    expect(css).toContain("@container task-surface (max-width: 420px)");
    expect(css).toMatch(
      /@container task-surface \(max-width: 420px\)[\s\S]*?\.task-dashboard-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/,
    );
  });

  it("uses a four-column overview and flat detail sections", () => {
    expect(css).toMatch(
      /\.task-dashboard-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/s,
    );
    expect(css).toMatch(
      /\.task-detail\s*>\s*\.task-detail-section\s*\{[^}]*border:\s*0;[^}]*border-top:\s*1px solid var\(--border-muted\);[^}]*border-radius:\s*0;[^}]*background:\s*transparent;/s,
    );
    expect(css).toMatch(
      /\.task-metrics-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\)/s,
    );
  });
});
