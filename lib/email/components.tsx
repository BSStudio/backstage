/** @jsxImportSource preact */
// biome-ignore-all lint/style/noHeadElement: an email is a whole document, not a Next page
// biome-ignore-all lint/performance/noImgElement: next/image has no meaning in a mail client
import type {
  ComponentChildren,
  CSSProperties,
  HTMLAttributes,
  VNode,
} from "preact";
import { render } from "preact-render-to-string";

// Preact, not React: Next refuses `react-dom/server` anywhere in the RSC import graph and
// a welcome letter is rendered from a Server Action. `preact-render-to-string` has no such
// restriction, escapes its children, and renders these attributes the way a mail client
// wants them. Nothing outside lib/email/ uses it.

// Every rule is inline. Gmail and Outlook each drop a <style> block on at least one of
// their surfaces, and a letter that arrives unstyled is worse than one that never looked
// like the portal.
export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderEmail(email: {
  subject: string;
  document: VNode;
  text: string;
}): RenderedEmail {
  return {
    subject: email.subject,
    // A doctype is not a node, so it is prepended rather than rendered.
    html: `<!DOCTYPE html>
${render(email.document)}`,
    text: email.text,
  };
}

export const BRAND = "#005baa";
export const ACCENT = "#f39434";

const LINK_STYLE: CSSProperties = {
  color: ACCENT,
  textDecoration: "none",
  fontWeight: 600,
};

const LOGO_SIMONYI = "https://logotar.schdesign.hu/api/media/file/Simonyi.svg";
const LOGO_BSS = "https://logotar.schdesign.hu/api/media/file/BSS.svg";

// The presentational attributes email layout is built from were dropped from the JSX
// types years ago. They are still the only thing every client agrees on, so one wrapper
// passes them through rather than each call site casting.
function legacy<T extends EventTarget>(
  attributes: Record<string, string>,
): HTMLAttributes<T> {
  return attributes as HTMLAttributes<T>;
}

export function Table({
  style,
  width = "100%",
  children,
}: {
  style?: CSSProperties;
  width?: string;
  children: ComponentChildren;
}) {
  return (
    <table
      {...legacy<HTMLTableElement>({
        border: "0",
        cellpadding: "0",
        cellspacing: "0",
        width,
      })}
      style={style}
    >
      <tbody>{children}</tbody>
    </table>
  );
}

export function Cell({
  style,
  align,
  width,
  children,
}: {
  style?: CSSProperties;
  align?: "center";
  width?: string;
  children?: ComponentChildren;
}) {
  return (
    <td
      {...legacy<HTMLTableCellElement>(width ? { width } : {})}
      align={align}
      style={style}
    >
      {children}
    </td>
  );
}

export function Link({
  href,
  children,
}: {
  href: string;
  children: ComponentChildren;
}) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={LINK_STYLE}>
      {children}
    </a>
  );
}

export function MailLink({ address }: { address: string }) {
  return (
    <a href={`mailto:${address}`} style={LINK_STYLE}>
      {address}
    </a>
  );
}

/** Free prose, for the opening and the closing lines. */
export function Prose({ children }: { children: ComponentChildren }) {
  return (
    <tr>
      <td
        style={{
          padding: "20px 40px 10px 40px",
          color: "#333333",
          fontSize: "16px",
          lineHeight: 1.6,
        }}
      >
        {children}
      </td>
    </tr>
  );
}

export function Section({
  title,
  children,
}: {
  title: string;
  children: ComponentChildren;
}) {
  return (
    <tr>
      <td style={{ padding: "15px 0", borderBottom: "1px solid #edf2f7" }}>
        <span
          style={{
            fontSize: "16px",
            fontWeight: 600,
            color: BRAND,
            display: "block",
            marginBottom: "4px",
          }}
        >
          {title}
        </span>
        <span
          style={{
            fontSize: "15px",
            color: "#555555",
            lineHeight: 1.5,
            display: "block",
          }}
        >
          {children}
        </span>
      </td>
    </tr>
  );
}

/** The list of titled sections that carries most of a letter. */
export function Sections({ children }: { children: ComponentChildren }) {
  return (
    <tr>
      <td style={{ padding: "10px 40px 20px 40px" }}>
        <Table>{children}</Table>
      </td>
    </tr>
  );
}

/** An aside inside a section — the username, and what to do with it. */
export function InfoBox({ children }: { children: ComponentChildren }) {
  return (
    <span
      style={{
        fontSize: "14px",
        color: "#666666",
        backgroundColor: "#f8fafc",
        padding: "10px",
        borderLeft: `3px solid ${ACCENT}`,
        display: "block",
        lineHeight: 1.5,
        marginTop: "10px",
      }}
    >
      {children}
    </span>
  );
}

/** The one thing we want the reader to do, given its own tinted panel. */
export function Callout({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta: { label: string; url: string };
}) {
  return (
    <tr>
      <td style={{ padding: "10px 40px 30px 40px" }}>
        <Table
          style={{
            backgroundColor: "#fdf2e9",
            borderRadius: "12px",
            padding: "20px",
            border: `1px dashed ${ACCENT}`,
          }}
        >
          <tr>
            <td>
              <span
                style={{
                  fontSize: "16px",
                  fontWeight: 700,
                  color: "#c2410c",
                  display: "block",
                  marginBottom: "6px",
                }}
              >
                {title}
              </span>
              <p
                style={{
                  margin: "0 0 15px 0",
                  fontSize: "14px",
                  color: "#7c2d12",
                  lineHeight: 1.5,
                }}
              >
                {body}
              </p>
              <a
                href={cta.url}
                target="_blank"
                rel="noreferrer"
                style={{
                  backgroundColor: ACCENT,
                  color: "#ffffff",
                  textDecoration: "none",
                  padding: "10px 20px",
                  fontSize: "14px",
                  fontWeight: "bold",
                  borderRadius: "6px",
                  display: "inline-block",
                }}
              >
                {cta.label}
              </a>
            </td>
          </tr>
        </Table>
      </td>
    </tr>
  );
}

export interface CatalogueEntry {
  icon: string;
  name: string;
  url: string;
}

export function Catalogue({
  title,
  entries,
}: {
  title: string;
  entries: CatalogueEntry[];
}) {
  const rows: CatalogueEntry[][] = [];
  for (let i = 0; i < entries.length; i += 2) {
    rows.push(entries.slice(i, i + 2));
  }

  return (
    <tr>
      <td
        style={{
          padding: "30px 40px",
          backgroundColor: "#fafafa",
          borderTop: "1px solid #edf2f7",
        }}
      >
        <h3
          style={{
            margin: "0 0 15px 0",
            color: BRAND,
            fontSize: "16px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          }}
        >
          {title}
        </h3>
        <Table style={{ fontSize: "14px" }}>
          {rows.map((row) => (
            <tr key={row[0]?.url}>
              {row.map((entry) => (
                <Cell key={entry.url} width="50%" style={{ padding: "4px 0" }}>
                  <a
                    href={entry.url}
                    style={{ color: BRAND, textDecoration: "none" }}
                  >
                    {entry.icon} <strong>{entry.name}:</strong>{" "}
                    {new URL(entry.url).host}
                  </a>
                </Cell>
              ))}
              {/* An empty cell keeps a trailing link half-width instead of stretched. */}
              {row.length === 1 && <Cell width="50%" />}
            </tr>
          ))}
        </Table>
      </td>
    </tr>
  );
}

export function EmailDocument({
  title,
  preheader,
  heroEmoji,
  heading,
  children,
}: {
  /** Also the <title>; the subject is passed to the transport separately. */
  title: string;
  /** The line a client shows next to the subject in the inbox. */
  preheader: string;
  heroEmoji: string;
  heading: string;
  /** Rows of the card, in order. */
  children: ComponentChildren;
}) {
  return (
    <html lang="hu">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>{title}</title>
      </head>
      <body
        style={{
          margin: 0,
          padding: 0,
          backgroundColor: "#f4f6f9",
          fontFamily: "Arial,Helvetica,sans-serif",
        }}
      >
        <div
          style={{
            display: "none",
            maxHeight: 0,
            overflow: "hidden",
            opacity: 0,
          }}
        >
          {preheader}
        </div>
        <Table style={{ backgroundColor: "#f4f6f9", padding: "40px 10px" }}>
          <tr>
            <Cell align="center">
              <Table
                style={{
                  maxWidth: "650px",
                  backgroundColor: "#ffffff",
                  borderRadius: "16px",
                  overflow: "hidden",
                  borderTop: `6px solid ${BRAND}`,
                }}
              >
                <tr>
                  <Cell
                    align="center"
                    style={{ padding: "40px 40px 20px 40px" }}
                  >
                    <div
                      style={{
                        backgroundColor: "#f0f7ff",
                        width: "70px",
                        height: "70px",
                        borderRadius: "50%",
                        lineHeight: "75px",
                        textAlign: "center",
                        fontSize: "32px",
                        marginBottom: "20px",
                      }}
                    >
                      {heroEmoji}
                    </div>
                    <h1
                      style={{
                        color: BRAND,
                        margin: 0,
                        fontSize: "28px",
                        fontWeight: 700,
                        letterSpacing: "-0.5px",
                      }}
                    >
                      {heading}
                    </h1>
                  </Cell>
                </tr>

                {children}

                <tr>
                  <td
                    style={{
                      padding: "30px 40px",
                      color: "#333333",
                      fontSize: "15px",
                    }}
                  >
                    Üdvözlettel:
                    <br />
                    <strong style={{ color: BRAND, fontSize: "16px" }}>
                      a Budavári Schönherz Stúdió
                    </strong>
                  </td>
                </tr>

                <tr>
                  <Cell
                    align="center"
                    style={{
                      padding: "15px 30px 10px",
                      backgroundColor: "#e2e2e2",
                      borderRadius: "0 0 15px 15px",
                    }}
                  >
                    <Table>
                      <tr>
                        <Cell align="center">
                          <img
                            src={LOGO_SIMONYI}
                            alt="Simonyi Károly Szakkollégium"
                            style={{ height: "30px" }}
                          />
                        </Cell>
                        <Cell
                          align="center"
                          style={{ verticalAlign: "middle" }}
                        >
                          <img
                            src={LOGO_BSS}
                            alt="Budavári Schönherz Stúdió"
                            style={{ height: "100px" }}
                          />
                        </Cell>
                      </tr>
                    </Table>
                  </Cell>
                </tr>
              </Table>
            </Cell>
          </tr>
        </Table>
      </body>
    </html>
  );
}
