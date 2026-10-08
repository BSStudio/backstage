import { describe, expect, it } from "vitest";
import {
  renderWelcomeEmail,
  type WelcomeEmailInput,
} from "@/lib/email/welcome";

const INPUT: WelcomeEmailInput = {
  firstName: "János",
  username: "jkovacs",
  portalUrl: "https://backstage.bsstudio.hu",
  loginUrl: "https://login.bsstudio.hu",
  mailingListAddress: "bss@simonyi.bme.hu",
};

function render(overrides: Partial<WelcomeEmailInput> = {}) {
  return renderWelcomeEmail({ ...INPUT, ...overrides });
}

describe("renderWelcomeEmail", () => {
  it("greets the member and names the username they sign in with", () => {
    const { subject, html, text } = render();

    expect(subject).toBe("Üdvözlet a stúdióban! 🎥");
    for (const body of [html, text]) {
      expect(body).toContain("Szia János");
      expect(body).toContain("jkovacs");
      expect(body).toContain("elvégezted a tanfolyamot");
      expect(body).toContain("elfelejtett jelszó");
    }
  });

  it("links the portal and the Authentik instance it was told about", () => {
    const { html, text } = render({
      portalUrl: "https://portal.example.hu",
      loginUrl: "https://auth.example.hu",
    });

    expect(html).toContain('href="https://portal.example.hu"');
    expect(html).toContain('href="https://auth.example.hu"');
    expect(text).toContain("https://portal.example.hu");
    expect(text).toContain("https://auth.example.hu");
  });

  it("names the mailing list the member was added to", () => {
    const { html, text } = render();

    expect(html).toContain("BSS levelezőlista");
    expect(html).toContain('href="mailto:bss@simonyi.bme.hu"');
    expect(text).toContain("bss@simonyi.bme.hu");
  });

  it("drops the mailing list section when there is no list", () => {
    const { html, text } = render({ mailingListAddress: null });

    expect(html).not.toContain("levelezőlista");
    expect(text).not.toContain("LEVELEZŐLISTA");
    expect(html).toContain("Szia János");
  });

  // The catalogue is eight entries with the portal, so the grid closes evenly; a shorter
  // list still has to leave the last row half-width.
  it("lays the link collection out two to a row", () => {
    const { html } = render();
    const rows = html.split("Hasznos linkgyűjtemény")[1] ?? "";

    expect(rows).toContain("bsstudio.hu");
    expect(rows).toContain("backstage.bsstudio.hu");
    expect(rows.match(/<td width="50%"/g)?.length).toBe(8);
  });

  it("escapes what the member table supplies, without being asked to", () => {
    const { html } = render({
      firstName: '<script>alert("x")</script>',
      username: "j&kovacs",
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script>");
    expect(html).toContain("j&amp;kovacs");
  });

  it("styles every rule inline, since a <style> block would be stripped", () => {
    const { html } = render();

    expect(html).not.toContain("<style");
    expect(html).toContain('style="');
  });
});
