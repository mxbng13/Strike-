import { describe, it, expect } from "vitest";
import { renderMarkdown, lineDiff } from "@/components/markdown";

describe("rendu Markdown des livrables", () => {
  it("échappe le HTML et n'autorise que les liens http(s)", () => {
    const html = renderMarkdown('# T <script>alert(1)</script>\n\n[x](javascript:alert(1)) [ok](https://a.example/" onmouseover="x)\n\n| a | <img src=x onerror=y> |\n|---|---|\n| 1 | 2 |');
    expect(html).not.toMatch(/<script|<img/);
    expect(html).not.toMatch(/href="javascript/);
    expect(html).not.toMatch(/ onmouseover="/);
    expect(renderMarkdown("[ok](https://a.example/p)")).toBe('<p><a href="https://a.example/p" target="_blank" rel="noopener noreferrer nofollow">ok</a></p>');
    expect(html).toContain("<table>");
  });
  it("calcule une différence ligne à ligne", () => {
    expect(lineDiff("a\nb", "a\nc")).toEqual([{ op: "same", text: "a" }, { op: "del", text: "b" }, { op: "add", text: "c" }]);
  });
});
