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
        className="absolute inset-0 flex justify-center items-end sm:items-center p-0 sm:p-4"
      >
        <div className="w-full sm:max-w-xl bg-white shadow-lg flex flex-col overflow-hidden rounded-t-2xl sm:rounded-lg h-[90dvh] sm:h-auto sm:max-h-[calc(100vh-2rem)]">
          <div className="border-b px-4 py-3">
            <h2 className="text-lg font-semibold">{title}</h2>
          </div>
          <div className="p-4 overflow-y-auto flex-1">{children}</div>
          {footer && <div className="border-t px-4 py-3 flex justify-end gap-2 bg-white">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
