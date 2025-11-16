"use client";
import React, { useMemo } from "react";

function getInitials(name) {
  const n = String(name || "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase() || first.toUpperCase() || "?";
}

function hashToIndex(str, modulo) {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) | 0;
  return Math.abs(h) % modulo;
}

const COLORS = [
  "#F97316", // orange-500
  "#0EA5E9", // sky-500
  "#22C55E", // green-500
  "#8B5CF6", // violet-500
  "#EAB308", // yellow-500
  "#EF4444", // red-500
  "#06B6D4", // cyan-500
  "#A855F7", // purple-500
];

const SIZE_MAP = {
  sm: 28,
  md: 40,
  lg: 64,
};

export default function AvatarAluno({ student, imageUrl, size = "sm", rounded = true, title }) {
  const dim = SIZE_MAP[size] || SIZE_MAP.sm;

  const name = useMemo(() => {
    const s = student || {};
    return (
      s.name || s.full_name || s.display_name || [s.first_name, s.last_name].filter(Boolean).join(" ") || "Aluno"
    );
  }, [student]);

  const keyForColor = student?.id || name || "x";
  const bg = COLORS[hashToIndex(keyForColor, COLORS.length)];
  const initials = getInitials(name);

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={title || `Foto de ${name}`}
        width={dim}
        height={dim}
        loading="lazy"
        style={{ width: dim, height: dim, objectFit: "cover", borderRadius: rounded ? "9999px" : 6 }}
      />
    );
  }

  return (
    <div
      aria-label={title || `Avatar de ${name}`}
      title={title || name}
      style={{
        width: dim,
        height: dim,
        backgroundColor: bg,
        color: "#fff",
        borderRadius: rounded ? "9999px" : 6,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 600,
        fontSize: Math.max(10, Math.round(dim * 0.38)),
        userSelect: "none",
      }}
    >
      {initials}
    </div>
  );
}
