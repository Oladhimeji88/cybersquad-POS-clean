import { Dialog, DialogContent } from "@/components/ui/dialog";

interface ImageLightboxProps {
  imageUrl: string | null;
  onClose: () => void;
  alt?: string;
}

export default function ImageLightbox({ imageUrl, onClose, alt = "Preview image" }: ImageLightboxProps) {
  return (
    <Dialog open={Boolean(imageUrl)} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="max-w-6xl border-none bg-transparent p-0 shadow-none">
        {imageUrl && (
          <img
            src={imageUrl}
            alt={alt}
            className="max-h-[90vh] w-full rounded-md object-contain"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
