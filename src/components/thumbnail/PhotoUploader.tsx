"use client";

interface PhotoUploaderProps {
  localPath: string | null;
  onFile: (file: File) => void;
}

export function PhotoUploader({ localPath, onFile }: PhotoUploaderProps) {
  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) onFile(file);
  }

  return (
    <label
      className="vm-dropzone flex min-h-[132px] cursor-pointer flex-col items-center justify-center gap-2 px-4 py-6 text-center"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        handleFiles(event.dataTransfer.files);
      }}
    >
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => handleFiles(event.target.files)}
      />
      <span className="text-[13px] uppercase tracking-[0.18em]">Import Photo</span>
      <span className="text-[11px] text-[var(--vm-muted)]">
        Drag image here or click to choose
      </span>
      {localPath && (
        <span className="max-w-full truncate text-[10px] text-[var(--vm-subtle)]">
          {localPath}
        </span>
      )}
    </label>
  );
}
