"use client";

interface SelectImageButtonProps {
  disabled: boolean;
  onClick: () => void;
}

export function SelectImageButton({ disabled, onClick }: SelectImageButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="vm-button-primary w-full text-center disabled:cursor-not-allowed disabled:opacity-45"
    >
      Select IMG
    </button>
  );
}
