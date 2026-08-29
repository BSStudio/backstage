import { parseXml, XmlElement } from "@rgrove/parse-xml";

export const DAV_NAMESPACES = [
  'xmlns:d="DAV:"',
  'xmlns:card="urn:ietf:params:xml:ns:carddav"',
  'xmlns:cs="http://calendarserver.org/ns/"',
].join(" ");

export interface PropRequest {
  /** Lowercased local names, in document order. */
  names: string[];
  allprop: boolean;
}

export interface ReportRequest {
  /** Lowercased local name of the report's root element. */
  type: string | null;
  hrefs: string[];
  props: PropRequest;
}

export interface DavResource {
  href: string;
  /**
   * Qualified name to inner XML, already escaped. `""` renders an empty element, `null`
   * puts the property in the 404 propstat instead.
   */
  props: Record<string, string | null>;
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Clients pick their own prefixes, and no local name is shared across the three
// vocabularies answered here — so matching on the local name alone is unambiguous.
function localName(element: XmlElement): string {
  const { name } = element;
  return name.slice(name.indexOf(":") + 1).toLowerCase();
}

function childElements(element: XmlElement): XmlElement[] {
  return element.children.filter((child) => child instanceof XmlElement);
}

function descendants(element: XmlElement): XmlElement[] {
  return [element, ...childElements(element).flatMap(descendants)];
}

// Empty is not malformed: RFC 4918 reads it as allprop. Unparseable comes back undefined
// for the caller to answer with a 400.
function parseRoot(body: string): XmlElement | null | undefined {
  if (body.trim() === "") return null;
  try {
    return parseXml(body).root;
  } catch {
    return undefined;
  }
}

function readProps(elements: XmlElement[]): PropRequest {
  const prop = elements.find((element) => localName(element) === "prop");
  if (!prop) return { names: [], allprop: true };

  return { names: childElements(prop).map(localName), allprop: false };
}

/** `null` when the body is not well-formed XML. */
export function parsePropRequest(body: string): PropRequest | null {
  const root = parseRoot(body);
  if (root === undefined) return null;

  return readProps(root ? descendants(root) : []);
}

/** `null` when the body is not well-formed XML. */
export function parseReport(body: string): ReportRequest | null {
  const root = parseRoot(body);
  if (root === undefined) return null;

  const elements = root ? descendants(root) : [];

  return {
    type: root ? localName(root) : null,
    hrefs: elements
      .filter((element) => localName(element) === "href")
      .map((element) => element.text.trim()),
    props: readProps(elements),
  };
}

function renderPropstat(props: [string, string][], status: string): string {
  if (props.length === 0) return "";

  const body = props
    .map(([name, value]) =>
      value === "" ? `<${name}/>` : `<${name}>${value}</${name}>`,
    )
    .join("");

  return `<d:propstat><d:prop>${body}</d:prop><d:status>HTTP/1.1 ${status}</d:status></d:propstat>`;
}

function renderResource(resource: DavResource): string {
  const entries = Object.entries(resource.props);

  return [
    `<d:response><d:href>${escapeXml(resource.href)}</d:href>`,
    renderPropstat(
      entries.filter((entry): entry is [string, string] => entry[1] !== null),
      "200 OK",
    ),
    renderPropstat(
      entries
        .filter((entry) => entry[1] === null)
        .map(([name]): [string, string] => [name, ""]),
      "404 Not Found",
    ),
    "</d:response>",
  ].join("");
}

export function buildMultiStatus(resources: DavResource[]): string {
  const body = resources.map(renderResource).join("");
  return `<?xml version="1.0" encoding="utf-8"?><d:multistatus ${DAV_NAMESPACES}>${body}</d:multistatus>`;
}
