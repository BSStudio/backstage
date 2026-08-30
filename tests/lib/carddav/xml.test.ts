import { describe, expect, it } from "vitest";
import {
  buildMultiStatus,
  escapeXml,
  parsePropRequest,
  parseReport,
} from "@/lib/carddav/xml";

describe("escapeXml", () => {
  it("escapes every character XML gives its own meaning", () => {
    expect(escapeXml(`Tom & <Jerry> "quoted" 'single'`)).toBe(
      "Tom &amp; &lt;Jerry&gt; &quot;quoted&quot; &apos;single&apos;",
    );
  });

  it("escapes a carriage return, which a parser would otherwise normalise away", () => {
    expect(escapeXml("BEGIN:VCARD\r\nEND:VCARD\r\n")).toBe(
      "BEGIN:VCARD&#13;\nEND:VCARD&#13;\n",
    );
  });
});

describe("parsePropRequest", () => {
  it("reads the requested properties in document order", () => {
    expect(
      parsePropRequest(
        `<?xml version="1.0"?>
         <D:propfind xmlns:D="DAV:">
           <D:prop><D:resourcetype/><D:getetag/><D:displayname/></D:prop>
         </D:propfind>`,
      ),
    ).toEqual({
      names: ["resourcetype", "getetag", "displayname"],
      allprop: false,
    });
  });

  it("treats a property as the same one whatever prefix the client picked", () => {
    const expected = { names: ["getetag"], allprop: false };

    expect(
      parsePropRequest(
        `<A:propfind xmlns:A="DAV:"><A:prop><A:GetETag/></A:prop></A:propfind>`,
      ),
    ).toEqual(expected);
    expect(
      parsePropRequest(
        `<propfind xmlns="DAV:"><prop><getetag/></prop></propfind>`,
      ),
    ).toEqual(expected);
  });

  it("reads a cross-namespace property list", () => {
    expect(
      parsePropRequest(
        `<d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/"
                     xmlns:card="urn:ietf:params:xml:ns:carddav">
           <d:prop><cs:getctag/><card:address-data/></d:prop>
         </d:propfind>`,
      ),
    ).toEqual({ names: ["getctag", "address-data"], allprop: false });
  });

  it("falls back to allprop when the client names no properties", () => {
    const allprop = { names: [], allprop: true };

    expect(
      parsePropRequest(`<d:propfind xmlns:d="DAV:"><d:allprop/></d:propfind>`),
    ).toEqual(allprop);
    expect(parsePropRequest("")).toEqual(allprop);
    expect(parsePropRequest("   \n  ")).toEqual(allprop);
  });

  it("reports a malformed body rather than reading it as allprop", () => {
    expect(
      parsePropRequest(`<d:propfind xmlns:d="DAV:"><d:prop></d:propfind>`),
    ).toBeNull();
    expect(parsePropRequest("not xml at all")).toBeNull();
  });
});

describe("parseReport", () => {
  it("reads a multiget's type, hrefs and properties", () => {
    expect(
      parseReport(
        `<card:addressbook-multiget xmlns:d="DAV:"
                                    xmlns:card="urn:ietf:params:xml:ns:carddav">
           <d:prop><d:getetag/><card:address-data/></d:prop>
           <d:href>/api/carddav/addressbooks/studio/one.vcf</d:href>
           <d:href> /api/carddav/addressbooks/studio/two.vcf </d:href>
         </card:addressbook-multiget>`,
      ),
    ).toEqual({
      type: "addressbook-multiget",
      hrefs: [
        "/api/carddav/addressbooks/studio/one.vcf",
        "/api/carddav/addressbooks/studio/two.vcf",
      ],
      props: { names: ["getetag", "address-data"], allprop: false },
    });
  });

  it("reads a query, which names no hrefs", () => {
    expect(
      parseReport(
        `<card:addressbook-query xmlns:d="DAV:"
                                 xmlns:card="urn:ietf:params:xml:ns:carddav">
           <d:prop><d:getetag/></d:prop>
           <card:filter/>
         </card:addressbook-query>`,
      ),
    ).toEqual({
      type: "addressbook-query",
      hrefs: [],
      props: { names: ["getetag"], allprop: false },
    });
  });

  it("reports no type for an empty body", () => {
    expect(parseReport("")).toEqual({
      type: null,
      hrefs: [],
      props: { names: [], allprop: true },
    });
  });

  it("reports a malformed body", () => {
    expect(parseReport("<card:addressbook-multiget>")).toBeNull();
  });
});

describe("buildMultiStatus", () => {
  it("declares the namespaces the properties are written in", () => {
    const xml = buildMultiStatus([]);

    expect(xml).toContain(`<?xml version="1.0" encoding="utf-8"?>`);
    expect(xml).toContain(`xmlns:d="DAV:"`);
    expect(xml).toContain(`xmlns:card="urn:ietf:params:xml:ns:carddav"`);
    expect(xml).toContain(`xmlns:cs="http://calendarserver.org/ns/"`);
    expect(xml).toContain("<d:multistatus");
    expect(xml).toContain("</d:multistatus>");
  });

  it("renders a filled property as an element and an empty one as self-closing", () => {
    const xml = buildMultiStatus([
      {
        href: "/api/carddav/addressbooks/studio/",
        props: {
          "d:resourcetype": "<d:collection/><card:addressbook/>",
          "d:displayname": "BSS",
          "cs:getctag": "abc",
          "d:getcontenttype": "",
        },
      },
    ]);

    expect(xml).toContain(
      "<d:resourcetype><d:collection/><card:addressbook/></d:resourcetype>",
    );
    expect(xml).toContain("<d:displayname>BSS</d:displayname>");
    expect(xml).toContain("<d:getcontenttype/>");
    expect(xml).toContain("<d:status>HTTP/1.1 200 OK</d:status>");
    expect(xml).not.toContain("404");
  });

  it("puts an unsupported property in a 404 propstat of its own", () => {
    const xml = buildMultiStatus([
      {
        href: "/api/carddav/",
        props: { "d:getetag": '"abc"', "d:sync-token": null },
      },
    ]);

    expect(xml).toContain(
      `<d:propstat><d:prop><d:getetag>"abc"</d:getetag></d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>`,
    );
    expect(xml).toContain(
      `<d:propstat><d:prop><d:sync-token/></d:prop><d:status>HTTP/1.1 404 Not Found</d:status></d:propstat>`,
    );
  });

  it("omits both propstats when a resource carries no properties", () => {
    const xml = buildMultiStatus([{ href: "/api/carddav/", props: {} }]);

    expect(xml).toContain(
      "<d:response><d:href>/api/carddav/</d:href></d:response>",
    );
    expect(xml).not.toContain("propstat");
  });

  it("escapes the href", () => {
    const xml = buildMultiStatus([
      { href: "/api/carddav/addressbooks/studio/a&b.vcf", props: {} },
    ]);

    expect(xml).toContain(
      "<d:href>/api/carddav/addressbooks/studio/a&amp;b.vcf</d:href>",
    );
  });
});
