import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Kezdőlap</h1>
        <p className="text-muted-foreground">Üdvözlünk a Backstage-ben.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hamarosan</CardTitle>
          <CardDescription>
            Ezen az oldalon fogjuk megjeleníteni a naptár eseményeit,
            számítógépek állapotát és a gyakran használt alkalmazások linkjeit.
          </CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
