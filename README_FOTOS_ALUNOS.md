# Plano de Implementação: Fotos de Alunos

> Documento de planejamento. Não introduz código nem mudanças de schema. Serve como referência para futura implementação respeitando o princípio de levantar o que já existe no projeto antes de propor mudanças.

## 1) Objetivo
Adicionar fotos ao cadastro dos alunos e utilizá‑las em pontos-chave da UI (listagens, presença, relatórios), preservando privacidade, desempenho e simplicidade operacional.

## 2) Onde as fotos agregam valor (UI)
- Listagem de alunos (`/alunos`): avatar pequeno ao lado do nome.
- Membros da turma (`/turmas/[id]`): avatar pequeno para identificação rápida.
- Tomada de presença (na mesma tela de turma): melhora velocidade de marcação.
- Relatórios (assiduidade/inadimplência): avatar opcional para leitura rápida.
- Card/modal do aluno: foto maior, com fallback para iniciais.

Arquivos relevantes hoje (sem alterações):
- `src/app/(app)/turmas/[id]/page.jsx`: lista membros e presença.
- `src/lib/supabaseGateway.js`: CRUD de `students` (poderá receber campo de foto futuramente).

## 3) Armazenamento das imagens
- Provedor: Supabase Storage.
- Bucket proposto: `student-photos` (um bucket por ambiente).
- Estrutura de paths determinística:
  - `tenant/{tenant_id}/students/{student_id}.jpg`
- Visibilidade (decisão a tomar):
  - Privado (recomendado): gerar URL assinada ao exibir, com expiração curta.
  - Público: mais simples, mas requer consentimento explícito e atenção à privacidade.
- Processamento pré-upload (no cliente ou edge):
  - Resize máx. 512x512, `object-fit: cover`.
  - Compressão JPEG/WebP ~80 de qualidade.
  - Remoção de EXIF/metadados (privacidade, menor tamanho).

## 4) Modelagem de dados (futura, sem criar agora)
- Campo em `students`:
  - `photo_url` (string) com o caminho no bucket (não a URL assinada).
  - Alternativa: `photo_obj` (json) com `{ path, version, placeholder }`.
- Não há necessidade de snapshot de foto em `sessions/attendance`.
- Fallback: ausência do campo indica que o aluno não tem foto.

## 5) Fluxo de upload (UX)
1. Usuário abre edição de aluno.
2. Seleciona arquivo (ou drag‑and‑drop) → preview local e recorte opcional quadrado.
3. Otimização local (resize, compressão, remover EXIF).
4. Upload para `student-photos/tenant/{tenant_id}/students/{student_id}.jpg`.
5. Atualiza `students.photo_url` com o caminho (não a URL final).
6. Quando exibir, gerar URL assinada (se privado) ou montar URL pública.
7. Cache‑busting: opcional `?v=<updated_at_epoch>` ao construir a URL de exibição.

Restrições sugeridas:
- Tipos aceitos: `image/jpeg`, `image/webp`.
- Tamanho máximo: 1 MB.
- Ratio: preferir 1:1 (recorte).

## 6) Uso na UI (Avatar)
- Componente `AvatarAluno` (a criar no futuro):
  - Props: `{ student, size = 'sm'|'md'|'lg', rounded = true }`.
  - Lógica:
    - Se `photo_url`: gerar URL para imagem (assinada se privado) e usar `img` com `object-cover`.
    - Fallback: círculo com cor derivada do `student.id` + iniciais do nome (máx. 2 letras).
    - Acessibilidade: `alt="Foto do aluno"`; se sem foto, `alt="Avatar padrão"`.
  - Desempenho:
    - `loading="lazy"` para listas.
    - Dimensões fixas para evitar layout shift.
    - Placeholder blur opcional (salvo no `photo_obj.placeholder` ou gerado on-the-fly).

Locais de uso previsto:
- Listas e tabelas: avatar 24–32 px.
- Cartões/headers: 48–64 px.

## 7) Segurança e privacidade
- Se bucket privado:
  - URLs assinadas com expiração curta (ex.: 5–10 min), cache local por componente para evitar explosão de requisições.
  - Controle de acesso via Supabase (auth presente) — Storage não usa RLS; políticas do bucket devem ser restritivas.
- Se bucket público:
  - Confirmar consentimento de uso de imagem no cadastro.
  - Evitar nomes pessoais no filename além do `student_id`.
- Rate limiting e validação:
  - Limitar reenvios consecutivos; validar tipo e tamanho do arquivo.
- Auditoria (futuro):
  - Tabela `audit_student_photo` (opcional) com `student_id`, `user_id`, `action` (upload/replace/remove), timestamp.

## 8) Desempenho e cache
- CDN do Supabase entrega as imagens rapidamente.
- Use tamanhos fixos e consistentes.
- Estratégia de cache bust simples: query param `v` baseado em `updated_at`.
- Variantes (thumb vs full) só se necessário — começar com um único arquivo otimizado.

## 9) Governança e manutenção
- Limpeza periódica: remover blobs órfãos quando `students` for deletado.
- Quotas por tenant: monitorar bytes armazenados; alertar ao exceder limites definidos.
- Recompressão futura: script para recomprimir acima de 512 px caso mude o padrão.

## 10) Roadmap incremental
1. Decisão: bucket privado vs. público e consentimento.
2. Adicionar campo `photo_url` em `students` (migração futura, quando aprovado).
3. Protótipo de upload na edição de aluno (restrito a owner/admin) — sem produção ainda.
4. Criar `AvatarAluno` com fallback de iniciais.
5. Introduzir avatar nas telas de turma (membros, presença) e na listagem de alunos.
6. Otimizações (lazy, blur placeholder, cache URLs assinadas).
7. Auditoria/quota e rotina de limpeza.

## 11) Decisões em aberto
- Visibilidade do bucket (privado recomendado) e impacto em geração de URLs.
- Armazenar blur placeholder no banco ou gerar sob demanda.
- Aceitar múltiplas resoluções ou apenas uma padronizada.

## 12) Critérios de aceite (MVP)
- Upload aceita apenas imagens válidas, até 1 MB, com compressão aplicada.
- UI exibe avatar com fallback consistente e sem layout shift perceptível.
- Privacidade: não expõe fotos a usuários não autenticados (se privado) ou sem consentimento (se público).
- Operação simples: trocar foto substitui a anterior e reflete na UI em até 1 min (cache bust).

## 13) Riscos e mitigação
- Vazamento de imagens (público): mitigar com consentimento e revisão de políticas.
- Custos/armazenamento: mitigar com compressão e quotas por tenant.
- Performance ao gerar muitas URLs assinadas: mitigar com memoização e expiração adequada.

## 14) Referências internas
- `src/lib/supabaseGateway.js` — CRUD `students` existente (base para adicionar `photo_url` no futuro).
- `src/app/(app)/turmas/[id]/page.jsx` — pontos naturais para exibir avatar em presença e lista de sessões.

---
Status: documento pronto para guiar a implementação quando autorizado. Sem alterações no código ou banco até aqui.
