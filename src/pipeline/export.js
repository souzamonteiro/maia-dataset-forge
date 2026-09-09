import { readJsonl, writeJsonl } from "../lib/io.js";
import { paperSplit } from "../lib/quality.js";
export async function exportDataset() {
  const raw = await readJsonl("data/datasets/raw.jsonl");
  const accepted = await readJsonl("data/datasets/validated.jsonl");
  const rejected = await readJsonl("data/rejected/rejected.jsonl");
  const done = new Set([...accepted, ...rejected].map((x) => x.id));
  if (!raw.length || raw.some((x) => !done.has(x.id)))
    throw new Error("Complete validation before export");
  const rows = accepted.map((x) => ({
    messages: [
      {
        role: "system",
        content:
          "You are Maia Academic, an academic assistant for computational modeling, science, engineering and software.",
      },
      { role: "user", content: x.question },
      { role: "assistant", content: x.answer },
    ],
    metadata: {
      ...x,
      split: paperSplit(x.paperId),
      question: undefined,
      answer: undefined,
    },
  }));
  for (const split of ["train", "validation", "test"])
    await writeJsonl(
      `data/datasets/${split}.jsonl`,
      rows.filter((x) => x.metadata.split === split),
    );
  await writeJsonl("data/datasets/maia-academic-qwen-sft.jsonl", rows);
  console.log(
    `Exported ${rows.length} examples; deterministic paper splits (approximately 80/10/10).`,
  );
}
