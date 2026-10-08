import { render } from "preact-render-to-string";
import { describe, expect, it } from "vitest";
import { Catalogue, type CatalogueEntry } from "@/lib/email/components";

const ENTRY: CatalogueEntry = {
  icon: "🌐",
  name: "BSS Web",
  url: "https://bsstudio.hu",
};

// Called rather than written as JSX: this file needs no pragma of its own to reach a
// branch the welcome letter's own catalogue, being even, never takes.
function catalogue(entries: CatalogueEntry[]) {
  return render(Catalogue({ title: "Linkek", entries }));
}

describe("Catalogue", () => {
  it("lays entries out two to a row", () => {
    const html = catalogue([
      ENTRY,
      { ...ENTRY, url: "https://wiki.bsstudio.hu" },
    ]);

    expect(html.match(/<td width="50%"/g)).toHaveLength(2);
    expect(html).toContain("bsstudio.hu");
    expect(html).toContain("wiki.bsstudio.hu");
  });

  it("keeps a trailing entry half-width instead of stretched", () => {
    const html = catalogue([ENTRY]);

    expect(html).toContain('<td width="50%"></td>');
  });
});
