"use client";

import { useEffect, useState } from "react";
import { X, AlertTriangle, Loader2, Trash2 } from "lucide-react";

export default function PreviewModal({ title, onClose, children, maxWidth = "md" }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const maxClass = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
  }[maxWidth] || "max-w-md";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className={`w-full ${maxClass} rounded-t-2xl bg-[var(--p-surface)] shadow-xl sm:rounded-2xl max-h-[92vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--p-border)] bg-[var(--p-surface)] px-5 py-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-[var(--p-text-muted)] hover:bg-[var(--p-surface-2)]"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function FormError({ message }) {
  if (!message) return null;
  return (
    <div className="rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-3 py-2 text-xs text-[var(--p-danger)]">
      {message}
    </div>
  );
}

export function ModalActions({ onCancel, submitting, submitLabel = "Salvar", submitIcon: SubmitIcon }) {
  return (
    <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onCancel}
        disabled={submitting}
        className="p-btn p-btn-ghost"
      >
        Cancelar
      </button>
      <button type="submit" disabled={submitting} className="p-btn p-btn-primary">
        {SubmitIcon && <SubmitIcon className="h-4 w-4" />}
        <span>{submitting ? "Salvando…" : submitLabel}</span>
      </button>
    </div>
  );
}

export function ConfirmDeleteModal({
  title = "Remover item",
  description,
  itemName,
  onCancel,
  onConfirm,
}) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  async function handleConfirm() {
    try {
      setLoading(true);
      setErr(null);
      await onConfirm();
    } catch (e) {
      setErr(e?.message || String(e));
      setLoading(false);
    }
  }

  return (
    <PreviewModal title={title} onClose={loading ? () => {} : onCancel} maxWidth="sm">
      <div className="flex flex-col gap-4 px-5 py-5">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--p-danger-50)] text-[var(--p-danger)]">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1 text-sm">
            {itemName && (
              <div className="font-medium text-[var(--p-text)]">
                {itemName}
              </div>
            )}
            <p className="mt-1 text-[var(--p-text-muted)]">
              {description || "Esta ação não pode ser desfeita."}
            </p>
          </div>
        </div>
        <FormError message={err} />
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="p-btn p-btn-ghost"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--p-danger)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--p-danger)]/90 disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            <span>{loading ? "Removendo…" : "Remover"}</span>
          </button>
        </div>
      </div>
    </PreviewModal>
  );
}
