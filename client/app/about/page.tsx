import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function AboutPage() {
  return (
    <main className="doc-page mx-auto min-h-screen w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-10">
      <div className="rounded-[32px] bg-slate-950 px-6 py-7 text-white shadow-2xl shadow-slate-950/20 sm:px-8 sm:py-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-300 transition hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          Back to workspace
        </Link>
        <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl">PDF Workspace Technical Documentation</h1>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300 sm:text-base">
          This page documents what we built, why we changed it, and how the full system works end-to-end.
        </p>
      </div>

      <section className="panel-surface mt-6 space-y-8 px-6 py-7 sm:px-8 sm:py-8">
        <section className="space-y-3">
          <h2 className="text-2xl font-semibold text-slate-950">1. Project Goal</h2>
          <p className="text-base leading-8 text-slate-700">
            Build a production-style PDF RAG system where users can upload PDF documents, wait for indexing,
            and ask grounded questions against a selected document. Responses must use retrieved evidence, not
            hallucinated context.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold text-slate-950">2. High-Level Architecture</h2>
          <p className="text-base leading-8 text-slate-700">The system is split into three runtime layers:</p>
          <ol className="list-decimal space-y-2 pl-6 text-base leading-8 text-slate-700">
            <li>Frontend (Next.js): upload UI, document library, and grounded chat interface.</li>
            <li>API (Express): document lifecycle endpoints and chat/stream orchestration.</li>
            <li>Worker (BullMQ): background ingestion pipeline for PDF parsing and indexing.</li>
          </ol>
          <p className="text-base leading-8 text-slate-700">Supporting services:</p>
          <ol className="list-decimal space-y-2 pl-6 text-base leading-8 text-slate-700">
            <li>Redis for queue transport.</li>
            <li>Qdrant for vector storage and similarity search.</li>
            <li>JSON metadata storage for document state tracking.</li>
          </ol>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold text-slate-950">3. Ingestion Lifecycle</h2>
          <p className="text-base leading-8 text-slate-700">Each upload follows deterministic state transitions:</p>
          <ol className="list-decimal space-y-2 pl-6 text-base leading-8 text-slate-700">
            <li>Upload accepted with status queued.</li>
            <li>Worker picks job and sets status processing.</li>
            <li>PDF text extraction and normalization are performed.</li>
            <li>Text is chunked and embedded.</li>
            <li>Vectors are upserted into Qdrant with document-level payload filters.</li>
            <li>Status becomes ready, or failed with error details.</li>
          </ol>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold text-slate-950">4. Retrieval and Chat Flow</h2>
          <ol className="list-decimal space-y-2 pl-6 text-base leading-8 text-slate-700">
            <li>User selects a ready document in the workspace.</li>
            <li>Query is embedded using the configured embedding model.</li>
            <li>Qdrant search is filtered by selected document ID.</li>
            <li>Top-K retrieved chunks are assembled as strict context.</li>
            <li>Groq model generates final answer and streaming tokens.</li>
            <li>UI shows the answer with source chunks and match scores.</li>
          </ol>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold text-slate-950">5. UI/UX Decisions</h2>
          <ol className="list-decimal space-y-2 pl-6 text-base leading-8 text-slate-700">
            <li>Primary page simplified to a single operational workspace.</li>
            <li>Large hero header removed to reduce vertical scrolling friction.</li>
            <li>Scrollable regions constrained to document list and chat history only.</li>
            <li>Batch upload enabled for up to 10 PDFs in one action.</li>
            <li>Chat panel includes conversation controls, copy actions, and source details.</li>
          </ol>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold text-slate-950">6. Monorepo and Structure</h2>
          <p className="text-base leading-8 text-slate-700">
            The workspace uses a pnpm multi-package setup with separate frontend and backend packages so
            development scripts, builds, and future maintenance remain clean and scalable.
          </p>
          <ol className="list-decimal space-y-2 pl-6 text-base leading-8 text-slate-700">
            <li>Root-level workspace scripts orchestrate all packages.</li>
            <li>Frontend and backend package names are explicit and production-aligned.</li>
            <li>Redundant empty folders were removed during cleanup.</li>
          </ol>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-semibold text-slate-950">7. Operational Notes</h2>
          <ol className="list-decimal space-y-2 pl-6 text-base leading-8 text-slate-700">
            <li>Local mode requires Redis and Qdrant available on host ports.</li>
            <li>Docker mode can run all services together or infra-only.</li>
            <li>Ingestion worker concurrency is intentionally set to one for sequential processing.</li>
          </ol>
        </section>

        <section className="rounded-3xl border border-cyan-200 bg-cyan-50 px-5 py-4">
          <h2 className="text-lg font-semibold text-cyan-900">Summary</h2>
          <p className="mt-2 text-base leading-8 text-cyan-900/90">
            The result is a focused, easier-to-use workspace for daily document operations, backed by a clearer
            architecture and a documented implementation that is easier to maintain and extend.
          </p>
        </section>
      </section>
    </main>
  );
}
