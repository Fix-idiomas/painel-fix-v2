"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const KEY = "__fix_finance_mock__";
const SCHEMA_VERSION = 1; // ↑ incremente se mudar a estrutura no futuro

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    "-" +
    pad(d.getHours()) +
    pad(d.getMinutes())
  );
}

function safeParse(txt) {
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

function validateShape(obj) {
  return (
    obj &&
    typeof obj === "object" &&
    Array.isArray(obj.students) &&
    Array.isArray(obj.payers) &&
    Array.isArray(obj.payments) &&
    (obj.teachers === undefined || Array.isArray(obj.teachers))
  );
}

export default function DevStoragePage() {
  const fileRef = useRef(null);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState("");
  const [schemaInfo, setSchemaInfo] = useState(null);
  const [origin, setOrigin] = useState(""); // ← evita hydration mismatch

  // carrega o JSON atual do localStorage (client-only)
  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      setRaw(v || "");
      setError("");

      setSchemaInfo({
        expected: SCHEMA_VERSION,
        note:
          "Armazenamos apenas {students,payers,payments} no localStorage. " +
          "Os metadados são adicionados apenas no arquivo exportado.",
      });

      setOrigin(location.origin); // só executa no cliente
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const size = useMemo(() => (raw ? new Blob([raw]).size : 0), [raw]);

  const pretty = useMemo(() => {
    if (!raw) return "";
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw; // se estiver corrompido, mostra cru
    }
  }, [raw]);

  // --------- Exporta com metadados ---------
  function handleExport() {
    let payload;
    try {
      payload = raw ? JSON.parse(raw) : { students: [], payers: [], payments: [] };
    } catch {
      payload = { students: [], payers: [], payments: [] };
    }

    const enriched = {
      schemaVersion: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      origin: origin || "", // informativo
      data: payload,
    };

    const blob = new Blob([JSON.stringify(enriched, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fix-mock-backup-${nowStamp()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // --------- Importa (com ou sem metadados) ---------
  async function handleImportFile(e) {
    const f = e.target.files?.[0];
    e.target.value = ""; // permite importar o mesmo arquivo novamente
    if (!f) return;

    const text = await f.text();
    const obj = safeParse(text);

    // se vier com metadados, extrai .data
    const payload = obj?.data && validateShape(obj.data) ? obj.data : obj;

    if (!validateShape(payload)) {
      alert("Arquivo inválido. Esperado um JSON com {students, payers, payments}.");
      return;
    }

    // checagem de schemaVersion (se veio com metadados)
    const importedSchema = obj?.schemaVersion;
    if (importedSchema != null && importedSchema !== SCHEMA_VERSION) {
      const proceed = confirm(
        `Aviso: schemaVersion do backup (${importedSchema}) é diferente do esperado (${SCHEMA_VERSION}).\n` +
          "Deseja importar mesmo assim?"
      );
      if (!proceed) return;
    }

    localStorage.setItem(KEY, JSON.stringify(payload));
    alert("Importado com sucesso! Recarregarei a página.");
    location.reload();
  }

  function handlePickFile() {
    fileRef.current?.click();
  }

  // --------- Reset ---------
  function handleReset() {
    if (!confirm("Resetar o mock? Isso vai limpar alunos/pagadores/lançamentos.")) return;
    const empty = { students: [], payers: [], payments: [] };
    localStorage.setItem(KEY, JSON.stringify(empty));
    location.reload();
  }

  // --------- Seed ---------
  function handleSeed() {
    if (!confirm("Carregar dados de exemplo? (isso SOBRESCREVE o estado atual)")) return;
    const seed = {
      students: [
        {
          id: "stu_a",
          name: "Bruno",
          monthly_value: 500,
          due_day: 5,
          status: "ativo",
          payer_id: null,
          birth_date: "1984-09-20",
        },
        {
          id: "stu_b",
          name: "Celso",
          monthly_value: 500,
          due_day: 10,
          status: "ativo",
          payer_id: null,
          birth_date: "1942-10-10",
        },
        {
          id: "stu_c",
          name: "Marcelo",
          monthly_value: 500,
          due_day: 15,
          status: "ativo",
          payer_id: null,
          birth_date: "1980-11-10",
        },
      ],
      payers: [],
      payments: [],
        teachers: [],
    };
    localStorage.setItem(KEY, JSON.stringify(seed));
    location.reload();
  }

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Dev · Storage</h1>
      <p className="text-slate-600">
        Utilitário para <b>exportar/importar/resetar</b> o mock (<code>{KEY}</code>) usado no projeto.
      </p>

      <section className="flex flex-wrap gap-2">
        <button onClick={handleExport} className="border rounded px-3 py-2">
          Exportar JSON
        </button>
        <button onClick={handlePickFile} className="border rounded px-3 py-2">
          Importar JSON…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          onChange={handleImportFile}
          className="hidden"
        />
        <button onClick={handleReset} className="border rounded px-3 py-2">
          Resetar mock
        </button>
        <button onClick={handleSeed} className="border rounded px-3 py-2">
          Popular com exemplos (seed)
        </button>
      </section>

      <section className="border rounded p-4 bg-white shadow-sm">
        <div className="text-sm text-slate-600 mb-2 space-y-1">
          <div>
            Origem: <code>{origin || "(carregando...)"}</code>
          </div>
          <div>Tamanho atual: {size} bytes</div>
          {schemaInfo && (
            <div>
              Schema esperado: <code>{schemaInfo.expected}</code>
              <div className="text-xs text-slate-500">{schemaInfo.note}</div>
            </div>
          )}
        </div>
        {error ? (
          <div className="text-red-600">Erro ao ler storage: {error}</div>
        ) : (
          <>
            <div className="text-xs uppercase text-gray-500 mb-1">
              Conteúdo (somente leitura)
            </div>
            <textarea
              className="w-full border rounded p-2 font-mono text-xs"
              rows={18}
              readOnly
              value={pretty || "(vazio)"}
            />
          </>
        )}
      </section>
    </main>
  );
}
