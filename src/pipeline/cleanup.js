// The corpus is shared with Maia RAG. Keep this command for compatibility with
// existing operator scripts, but never delete source documents, even with --apply.
export async function cleanup() {
  console.log(
    "Corpus retention enabled: PDFs and extracted text are preserved for Maia RAG. No files removed.",
  );
}
