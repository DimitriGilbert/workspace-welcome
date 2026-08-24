import { Upload } from "lucide-react";
import { useState } from "react";
import { useDropzone } from "react-dropzone";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace-welcome/ui/components/dialog";
import { Button } from "@workspace-welcome/ui/components/button";
import { cn } from "@workspace-welcome/ui/lib/utils";

/** Mirrors the server's cap (file-ops writeUpload) so oversized files are
 * refused before we base64-encode them. */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

interface UploadDropzoneProps {
  /** Upload target — the currently listed directory. */
  dir: string;
  /** Entry names already in `dir`, for the overwrite confirmation. */
  existing: string[];
  /** Uploads one file; rejects on failure (the toast came from the mutation). */
  upload: (name: string, contentBase64: string) => Promise<unknown>;
  /** Called after a batch with at least one successful upload. */
  onUploaded: () => void;
}

/** arrayBuffer → base64 in bounded chunks (a single fromCharCode call blows
 * the stack on multi-MB files). */
async function toBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Upload panel under the tree. Dropping reads each file as base64, confirms
 * before overwriting existing names, then uploads sequentially so failures
 * toast per file without aborting the rest of the batch.
 */
export function UploadDropzone({
  dir,
  existing,
  upload,
  onUploaded,
}: UploadDropzoneProps) {
  const [busy, setBusy] = useState(false);
  // A dropped batch parked until the overwrite decision is made.
  const [pending, setPending] = useState<File[] | null>(null);

  const dirLabel = dir === "" ? "the project root" : dir;

  const runUploads = async (files: File[]) => {
    setBusy(true);
    let uploaded = 0;
    try {
      for (const file of files) {
        if (file.size > MAX_UPLOAD_BYTES) {
          toast.error(`${file.name}: over the 10 MB upload limit.`);
          continue;
        }
        let content: string;
        try {
          content = await toBase64(file);
        } catch {
          toast.error(`${file.name}: couldn't read the file.`);
          continue;
        }
        try {
          await upload(file.name, content);
          uploaded += 1;
        } catch {
          // The mutation's onError already toasted this file's failure;
          // keep going with the rest of the batch.
        }
      }
    } finally {
      setBusy(false);
    }
    if (uploaded > 0) onUploaded();
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    disabled: busy,
    onDrop: (files) => {
      const collisions = files.filter((f) => existing.includes(f.name));
      if (collisions.length > 0) setPending(files);
      else runUploads(files);
    },
  });

  const collidingNames = (pending ?? [])
    .filter((f) => existing.includes(f.name))
    .map((f) => f.name);

  return (
    <>
      <div
        {...getRootProps({
          className: cn(
            "flex cursor-pointer flex-col items-center gap-1.5 rounded-none border border-dashed border-border px-3 py-4 text-center transition-colors hover:bg-muted/40",
            isDragActive && "border-primary bg-primary/5",
            busy && "pointer-events-none opacity-60",
          ),
        })}
      >
        <input {...getInputProps()} />
        <Upload className="size-4 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          {busy ? (
            "Uploading…"
          ) : isDragActive ? (
            "Drop to upload"
          ) : (
            <>
              Drop files or click to browse — uploads land in{" "}
              <span className="font-mono">{dirLabel}</span>
            </>
          )}
        </p>
      </div>

      <Dialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Overwrite existing files?</DialogTitle>
            <DialogDescription>
              <span className="break-all font-mono">
                {collidingNames.join(", ")}
              </span>{" "}
              already exist in{" "}
              <span className="font-mono">{dirLabel}</span>. Uploading replaces
              them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const files = pending;
                setPending(null);
                if (files) runUploads(files);
              }}
            >
              Overwrite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
