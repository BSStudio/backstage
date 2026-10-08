/** @jsxImportSource preact */
import {
  BRAND,
  Callout,
  Catalogue,
  EmailDocument,
  InfoBox,
  Link,
  MailLink,
  Prose,
  type RenderedEmail,
  renderEmail,
  Section,
  Sections,
} from "./components";
import {
  MATTERMOST_URL,
  ONBOARDING_SIGNUP_URL,
  PEK_URL,
  studioCatalogue,
} from "./links";

const SUBJECT = "Üdvözlet a stúdióban! 🎥";
const PREHEADER =
  "Létrehoztuk a fiókodat — itt van minden tudnivaló az induláshoz.";

export interface WelcomeEmailInput {
  firstName: string;
  /** The name Authentik settled on after its collision loop. */
  username: string;
  portalUrl: string;
  loginUrl: string;
  /** Null when the deployment has no mailing list configured. */
  mailingListAddress: string | null;
}

export function renderWelcomeEmail(input: WelcomeEmailInput): RenderedEmail {
  return renderEmail({
    subject: SUBJECT,
    document: <WelcomeEmail {...input} />,
    text: renderText(input),
  });
}

function WelcomeEmail({
  firstName,
  username,
  portalUrl,
  loginUrl,
  mailingListAddress,
}: WelcomeEmailInput) {
  return (
    <EmailDocument
      title={SUBJECT}
      preheader={PREHEADER}
      heroEmoji="🎬"
      heading="Üdv a BSS-ben!"
    >
      <Prose>
        <p style={{ marginTop: 0, fontSize: "18px" }}>
          <strong>Szia {firstName}!</strong>
        </p>
        <p>
          Ezt a levelet azért kapod, mert elvégezted a tanfolyamot, és aktívan
          jelen voltál a stúdió eseményein. Ezzel hivatalosan is{" "}
          <span
            style={{
              backgroundColor: "#ffeacc",
              color: "#d97706",
              padding: "2px 6px",
              borderRadius: "4px",
              fontWeight: "bold",
            }}
          >
            stúdiós-jelölt jelölt
          </span>{" "}
          státuszba léptél. Gratulálunk! 🎉
        </p>
        <p style={{ marginBottom: 0 }}>
          <strong>
            Kérlek, a következő információkat figyelmesen olvasd el!
          </strong>
        </p>
      </Prose>

      <Sections>
        <Section title="🔑 Regisztráció és IT fiókok">
          Létrehoztuk a fiókodat az <Link href={loginUrl}>Autentik</Link> (IdP)
          rendszerben. Ezzel eléred a Backstage-t, az Adáswebet, a
          Felkéréskezelőt, a Wikit és a Plankát.
          <InfoBox>
            <strong>Felhasználóneved:</strong> <code>{username}</code>
            <br />
            <strong>Teendő:</strong> első belépésnél az{" "}
            <strong style={{ color: BRAND }}>elfelejtett jelszó</strong> gombbal
            kérj új jelszót!
          </InfoBox>
        </Section>

        <Section title="🎬 Backstage — a stúdió portálja">
          A saját adataidat, a stúdió naptárát, a gépterem szabad gépeit és az
          összes belső alkalmazást a <Link href={portalUrl}>Backstage-en</Link>{" "}
          találod. Ha valamelyik adatod hibás, a profilodon szólhatsz érte.
        </Section>

        {mailingListAddress && (
          <Section title="📬 BSS levelezőlista">
            Felkerültél a listára. Ide írj bátran, ha kérdésed, produkció- vagy
            bármilyen kört érintő ötleted van!{" "}
            <MailLink address={mailingListAddress} />
          </Section>
        )}

        <Section title="🏛️ Profil és Körök (PéK)">
          Jelentkezz a körbe a{" "}
          <Link href={PEK_URL}>{new URL(PEK_URL).host}</Link> oldalon! Ez a
          félév végi közösségi pontozás és adminisztráció miatt kulcsfontosságú.
        </Section>

        <Section title="📅 Naptár és Google Drive">
          Minden eseményt, produkciót és foglalást a közös naptárban találsz — a
          Backstage kezdőlapja is ezt mutatja. Az archivált nyerseket és
          projekteket a Google Team Drive <i>„Megosztott meghajtók”</i>
          menüpontja alatt éred el.
        </Section>

        <Section title="💬 Belső kommunikáció">
          A mindennapi dumára a <Link href={MATTERMOST_URL}>Mattermostot</Link>{" "}
          használjuk. Ide regisztrálj be, és csatlakozz minden számodra érdekes
          csatornához!
        </Section>
      </Sections>

      <Callout
        title="🤯 Sok az infó? Segítünk!"
        body="Tartunk egy IT gyorstalpalót, ahol személyesen is megmutatjuk az összes rendszert és felületet, hogy ne tévedj el."
        cta={{
          label: "Jelentkezem az IT gyorstalpalóra →",
          url: ONBOARDING_SIGNUP_URL,
        }}
      />

      <Prose>
        <p style={{ margin: 0 }}>
          Ha bármilyen elakadásod van, keress bátran minket vagy a többi
          stúdióst, írj Mattermoston, vagy válaszolj erre a levélre!
        </p>
      </Prose>

      <Catalogue
        title="Hasznos linkgyűjtemény"
        entries={studioCatalogue(portalUrl)}
      />
    </EmailDocument>
  );
}

// Not optional: a client without HTML, a preview pane and a spam filter all read this one.
function renderText({
  firstName,
  username,
  portalUrl,
  loginUrl,
  mailingListAddress,
}: WelcomeEmailInput): string {
  const mailingList = mailingListAddress
    ? `BSS LEVELEZŐLISTA
Felkerültél a listára. Ide írj bátran, ha kérdésed, produkció- vagy bármilyen kört
érintő ötleted van! ${mailingListAddress}

`
    : "";

  const links = studioCatalogue(portalUrl)
    .map(({ name, url }) => `${name}: ${url}`)
    .join("\n");

  return `Üdv a BSS-ben!

Szia ${firstName}!

Ezt a levelet azért kapod, mert elvégezted a tanfolyamot, és aktívan jelen voltál a
stúdió eseményein. Ezzel hivatalosan is stúdiós-jelölt jelölt státuszba léptél.
Gratulálunk!

REGISZTRÁCIÓ ÉS IT FIÓKOK
Létrehoztuk a fiókodat az Autentik (IdP) rendszerben (${loginUrl}). Ezzel eléred a
Backstage-t, az Adáswebet, a Felkéréskezelőt, a Wikit és a Plankát.
Felhasználóneved: ${username}
Teendő: első belépésnél az "elfelejtett jelszó" gombbal kérj új jelszót!

BACKSTAGE — A STÚDIÓ PORTÁLJA
A saját adataidat, a stúdió naptárát, a gépterem szabad gépeit és az összes belső
alkalmazást itt találod: ${portalUrl}

${mailingList}PROFIL ÉS KÖRÖK (PÉK)
Jelentkezz a körbe a ${PEK_URL} oldalon! Ez a félév végi közösségi pontozás és
adminisztráció miatt kulcsfontosságú.

NAPTÁR ÉS GOOGLE DRIVE
Minden eseményt, produkciót és foglalást a közös naptárban találsz — a Backstage
kezdőlapja is ezt mutatja. Az archivált nyerseket és projekteket a Google Team Drive
"Megosztott meghajtók" menüpontja alatt éred el.

BELSŐ KOMMUNIKÁCIÓ
A mindennapi dumára a Mattermostot használjuk (${MATTERMOST_URL}). Ide regisztrálj be,
és csatlakozz minden számodra érdekes csatornához!

SOK AZ INFÓ? SEGÍTÜNK!
Tartunk egy IT gyorstalpalót, ahol személyesen is megmutatjuk az összes rendszert és
felületet. Jelentkezés: ${ONBOARDING_SIGNUP_URL}

Ha bármilyen elakadásod van, keress bátran minket vagy a többi stúdióst, írj
Mattermoston, vagy válaszolj erre a levélre!

HASZNOS LINKGYŰJTEMÉNY
${links}

Üdvözlettel:
a Budavári Schönherz Stúdió`;
}
