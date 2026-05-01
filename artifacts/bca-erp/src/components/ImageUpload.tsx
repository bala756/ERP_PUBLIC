import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, X, ImageIcon } from "lucide-react";
import { uploadFile, objectPathToUrl } from "@/lib/uploadFile";
import { useToast } from "@/hooks/use-toast";

interface ImageUploadProps {
  value: string | null;
  onChange: (objectPath: string | null) => void;
  label?: string;
  accept?: string;
  maxSizeMb?: number;
}

export function ImageUpload({
  value,
  onChange,
  label = "Upload Image",
  accept = "image/*",
  maxSizeMb = 5,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handleFile = async (file: File) => {
    if (file.size > maxSizeMb * 1024 * 1024) {
      toast({
        title: `File too large. Max ${maxSizeMb} MB.`,
        variant: "destructive",
      });
      return;
    }
    setUploading(true);
    try {
      const { objectPath } = await uploadFile(file);
      onChange(objectPath);
      toast({ title: "Image uploaded" });
    } catch (err) {
      toast({
        title:
          err instanceof Error ? err.message : "Upload failed. Try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
        data-testid="input-image-upload"
      />

      {value ? (
        <div className="relative inline-block">
          <img
            src={objectPathToUrl(value)}
            alt="Uploaded"
            className="h-32 w-32 object-cover rounded-md border bg-muted"
          />
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="absolute -top-2 -right-2 h-6 w-6 p-0 rounded-full"
            onClick={() => onChange(null)}
            title="Remove image"
            data-testid="button-image-remove"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <div
          onClick={() => inputRef.current?.click()}
          className="h-32 w-32 border-2 border-dashed rounded-md flex flex-col items-center justify-center text-muted-foreground hover-elevate cursor-pointer"
        >
          <ImageIcon className="h-6 w-6 mb-1" />
          <span className="text-xs">No image</span>
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
      >
        <Upload className="h-4 w-4 mr-1" />
        {uploading ? "Uploading…" : value ? "Replace" : label}
      </Button>
    </div>
  );
}
