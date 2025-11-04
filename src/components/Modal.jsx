"use client";

export default function Modal({ open, onClose, title, children, footer }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="absolute inset-0 flex items-center justify-center p-4"
      >
        <div className="w-full max-w-xl rounded-lg bg-white shadow-lg max-h-[calc(100vh-2rem)] flex flex-col">
          <div className="border-b px-4 py-3">
            <h2 className="text-lg font-semibold">{title}</h2>
          </div>
          <div className="p-4 overflow-y-auto">{children}</div>
          {footer && <div className="border-t px-4 py-3 flex justify-end gap-2">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
