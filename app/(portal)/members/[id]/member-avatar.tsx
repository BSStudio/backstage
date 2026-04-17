"use client";

import { Camera, Trash2, Upload } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { useAvatar } from "@/components/avatar-context";
import { AvatarCropDialog } from "@/components/avatar-crop-dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getInitials } from "@/lib/members";

export function MemberAvatar({
  memberId,
  firstName,
  lastName,
  avatarUrl,
  portraitUrl,
  canEdit,
  isSelf,
}: {
  memberId: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  portraitUrl: string | null;
  canEdit: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const { setAvatarUrl } = useAvatar();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [cacheBuster, setCacheBuster] = useState("");
  const [deleted, setDeleted] = useState(false);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImageSrc(reader.result as string);
      setViewOpen(false);
      setCropOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function handleCropComplete(square: Blob, portrait: Blob) {
    setCropOpen(false);
    startTransition(async () => {
      const formData = new FormData();
      formData.append("square", square, "square.webp");
      formData.append("portrait", portrait, "portrait.webp");

      const res = await fetch(`/api/members/${memberId}/avatar`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        toast.error("Hiba a kép feltöltésekor");
        return;
      }

      const { avatarUrl: newUrl } = await res.json();
      toast.success("Profilkép frissítve");
      setDeleted(false);
      const busted = `?v=${Date.now()}`;
      setCacheBuster(busted);
      if (isSelf) setAvatarUrl(`${newUrl}${busted}`);
      router.refresh();
    });
  }

  function handleRemove() {
    setViewOpen(false);
    startTransition(async () => {
      const res = await fetch(`/api/members/${memberId}/avatar`, {
        method: "DELETE",
      });

      if (!res.ok) {
        toast.error("Hiba a kép törlésekor");
        return;
      }

      toast.success("Profilkép eltávolítva");
      setDeleted(true);
      setCacheBuster("");
      if (isSelf) setAvatarUrl(null);
      router.refresh();
    });
  }

  const displayUrl =
    !deleted && avatarUrl ? `${avatarUrl}${cacheBuster}` : null;
  const displayPortrait =
    !deleted && portraitUrl ? `${portraitUrl}${cacheBuster}` : null;

  return (
    <>
      <button
        type="button"
        className="group relative shrink-0"
        disabled={isPending}
        onClick={() => setViewOpen(true)}
      >
        <Avatar key={displayUrl ?? "fallback"} className="h-16 w-16">
          {displayUrl && (
            <AvatarImage src={displayUrl} alt={`${lastName} ${firstName}`} />
          )}
          <AvatarFallback className="text-xl">
            {getInitials(firstName, lastName)}
          </AvatarFallback>
        </Avatar>
        {canEdit && (
          <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
            <Camera className="h-5 w-5 text-white" />
          </div>
        )}
      </button>

      <AlertDialog open={viewOpen} onOpenChange={setViewOpen}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {lastName} {firstName}
            </AlertDialogTitle>
            <AlertDialogDescription className="sr-only">
              Profilkép megtekintése
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex justify-center">
            {displayPortrait ? (
              <Image
                src={displayPortrait}
                alt={`${lastName} ${firstName}`}
                width={300}
                height={400}
                unoptimized
                className="max-h-[400px] rounded-md object-contain"
              />
            ) : displayUrl ? (
              <Image
                src={displayUrl}
                alt={`${lastName} ${firstName}`}
                width={400}
                height={400}
                unoptimized
                className="max-h-[400px] rounded-md object-contain"
              />
            ) : (
              <div className="flex h-[200px] w-full items-center justify-center rounded-md bg-muted">
                <span className="text-4xl font-medium text-muted-foreground">
                  {getInitials(firstName, lastName)}
                </span>
              </div>
            )}
          </div>

          <AlertDialogFooter className="flex-row justify-between sm:justify-between">
            {canEdit && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={isPending}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {avatarUrl ? "Csere" : "Feltöltés"}
                </Button>
                {avatarUrl && (
                  <Button
                    variant="outline"
                    disabled={isPending}
                    onClick={handleRemove}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Törlés
                  </Button>
                )}
              </div>
            )}
            <AlertDialogCancel>Bezárás</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      {imageSrc && (
        <AvatarCropDialog
          imageSrc={imageSrc}
          open={cropOpen}
          onOpenChange={setCropOpen}
          onComplete={handleCropComplete}
        />
      )}
    </>
  );
}
