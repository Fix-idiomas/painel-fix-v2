// src/app/(app)/cadastro/page.jsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Guard from "@/components/Guard";
import { supabase } from "@/lib/supabaseClient";
import { financeGateway } from "@/lib/financeGateway";
import {
  Users,
  GraduationCap,
  Wallet,
  ArrowUpRight,
  Loader2,
} from "lucide-react";

export default function CadastrosHubPage() {
  return (
    <Guard
      check={async () => {
        const { data: canReg, error: e1 } = await supabase.rpc(
          "can_registry_read"
        );
        if (e1) throw e1;
        return !!canReg;
      }}
      fallback={
        <div className="space-y-2 p-6">
          <h1 className="text-xl font-semibold">Acesso negado</h1>
          <p className="text-sm text-[var(--p-text-muted)]">
            Você não tem permissão para visualizar <b>Cadastros</b>.
          </p>
        </div>
      }
    >
      <CadastrosContent />
    </Guard>
  );
}

function CadastrosContent() {
  const [counts, setCounts] = useState({
    students: null,
    teachers: null,
    payers: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        const [stu, tea, pay] = await Promise.all([
          financeGateway.listStudents().catch(() => []),
          financeGateway.listTeachers().catch(() => []),
          financeGateway.listPayers?.().catch(() => []) ?? [],
        ]);
        if (cancelled) return;
        const stuArr = Array.isArray(stu) ? stu : [];
        const teaArr = Array.isArray(tea) ? tea : [];
        const payArr = Array.isArray(pay) ? pay : [];
        setCounts({
          students: {
            total: stuArr.length,
            active: stuArr.filter((s) => s.status === "ativo").length,
          },
          teachers: {
            total: teaArr.length,
            active: teaArr.filter((t) => t.status === "ativo").length,
          },
          payers: {
            total: payArr.length,
            active: payArr.length, // pagadores não têm status
          },
        });
      } catch (e) {
        if (!cancelled) setError(e?.message || String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const sections = [
    {
      key: "alunos",
      label: "Alunos",
      desc: "Cadastro de alunos com mensalidade, vencimento e foto",
      href: "/alunos",
      icon: Users,
      count: counts.students,
      countLabel: counts.students
        ? `${counts.students.total} cadastrados · ${counts.students.active} ativos`
        : null,
    },
    {
      key: "professores",
      label: "Professores",
      desc: "Corpo docente com tarifa por hora e payouts mensais",
      href: "/professores",
      icon: GraduationCap,
      count: counts.teachers,
      countLabel: counts.teachers
        ? `${counts.teachers.total} cadastrados · ${counts.teachers.active} ativos`
        : null,
    },
    {
      key: "pagadores",
      label: "Pagadores",
      desc: "Responsáveis financeiros (próprio aluno ou terceiro)",
      href: "/pagadores",
      icon: Wallet,
      count: counts.payers,
      countLabel: counts.payers
        ? `${counts.payers.total} ${counts.payers.total === 1 ? "pagador" : "pagadores"}`
        : null,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Cadastros
        </h1>
        <p className="mt-1 text-sm text-[var(--p-text-muted)]">
          Gerencie alunos, professores e pagadores da escola.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-[var(--p-danger)]/30 bg-[var(--p-danger-50)] px-4 py-3 text-sm text-[var(--p-danger)]">
          Erro ao carregar contagens: {error}
        </div>
      )}

      {/* Grid de áreas */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.key}
              href={s.href}
              prefetch={false}
              className="p-card p-card-hover flex flex-col gap-4 p-5"
            >
              <div className="flex items-start justify-between">
                <div className="grid h-11 w-11 place-items-center rounded-lg bg-[var(--p-primary-50)] text-[var(--p-primary)]">
                  <Icon className="h-5 w-5" />
                </div>
                <ArrowUpRight className="h-4 w-4 text-[var(--p-text-faint)]" />
              </div>
              <div>
                <div className="text-base font-semibold tracking-tight">
                  {s.label}
                </div>
                <div className="mt-1 text-xs text-[var(--p-text-muted)] leading-relaxed">
                  {s.desc}
                </div>
              </div>
              <div className="mt-auto flex items-center gap-2 border-t border-[var(--p-border)] pt-3 text-xs text-[var(--p-text-muted)]">
                {loading ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" /> Carregando…
                  </span>
                ) : s.countLabel ? (
                  <span className="font-medium tabular-nums">
                    {s.countLabel}
                  </span>
                ) : (
                  <span>—</span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
