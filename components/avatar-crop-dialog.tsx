"use client";

import { ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Area } from "react-easy-crop";
import Cropper from "react-easy-crop";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

type CropStep = "square" | "portrait";

async function cropImage(
  imageSrc: string,
  pixelCrop: Area,
  outputWidth: number,
  outputHeight: number,
): Promise<Blob> {
  const image = new Image();
  image.src = imageSrc;
  await new Promise((resolve) => {
    image.onload = resolve;
  });

  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputWidth,
    outputHeight,
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob failed"));
      },
      "image/webp",
      0.85,
    );
  });
}

export function AvatarCropDialog({
  imageSrc,
  open,
  onOpenChange,
  onComplete,
}: {
  imageSrc: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (square: Blob, portrait: Blob) => void;
}) {
  const [step, setStep] = useState<CropStep>("square");
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedArea, setCroppedArea] = useState<Area | null>(null);
  const [squareBlob, setSquareBlob] = useState<Blob | null>(null);
  const [ready, setReady] = useState(false);

  const onCropComplete = useCallback(
    (_croppedArea: Area, croppedAreaPixels: Area) => {
      setCroppedArea(croppedAreaPixels);
    },
    [],
  );

  // Reset state when dialog opens; delay cropper render until animation settles
  useEffect(() => {
    if (open) {
      setStep("square");
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedArea(null);
      setSquareBlob(null);
      setReady(false);
      const timer = setTimeout(() => setReady(true), 200);
      return () => clearTimeout(timer);
    }
    setReady(false);
  }, [open]);

  async function handleNext() {
    if (!croppedArea) return;

    if (step === "square") {
      const blob = await cropImage(imageSrc, croppedArea, 400, 400);
      setSquareBlob(blob);
      setStep("portrait");
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedArea(null);
    } else {
      if (!squareBlob) return;
      const portrait = await cropImage(imageSrc, croppedArea, 300, 400);
      onComplete(squareBlob, portrait);
    }
  }

  function handleCancel() {
    onOpenChange(false);
  }

  function handleOpenChange(isOpen: boolean) {
    onOpenChange(isOpen);
  }

  const aspect = step === "square" ? 1 : 3 / 4;
  const stepLabel =
    step === "square" ? "Profilkép (négyzet, 1:1)" : "Portréfotó (álló, 3:4)";
  const stepNumber = step === "square" ? 1 : 2;

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Kép kivágása ({stepNumber}/2)</AlertDialogTitle>
          <AlertDialogDescription>{stepLabel}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="relative h-[350px] overflow-hidden rounded-md bg-muted">
          {ready && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              maxZoom={3}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </div>

        <div className="flex items-center gap-3 px-1">
          <ZoomOut className="h-4 w-4 shrink-0 text-muted-foreground" />
          <Slider
            min={1}
            max={3}
            step={0.01}
            value={[zoom]}
            onValueChange={([v]) => setZoom(v)}
          />
          <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" />
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancel}>Mégse</AlertDialogCancel>
          <Button onClick={handleNext}>
            {step === "square" ? "Következő" : "Feltöltés"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
