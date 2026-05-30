"use client";

interface ExportButtonProps {
  disabled: boolean;
  onClick: () => void;
}

export function ExportButton({ disabled, onClick }: ExportButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="vm-button-secondary w-full text-center disabled:cursor-not-allowed disabled:opacity-45"
    >
      Download PNG 1280x720
    </button>
  );
}
