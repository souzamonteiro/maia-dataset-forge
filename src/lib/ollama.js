let thermalGuard;
export function setThermalGuard(guard) {
  thermalGuard = guard;
}
export async function ollamaJson(options) {
  const operation = (signal) =>
    requestJson({ ...options, thermalSignal: signal });
  return thermalGuard ? thermalGuard(operation) : operation();
}
async function requestJson({
  thermalSignal,
  model,
  withMetrics = false,
  seed,
  prompt,
  temperature = 0.2,
  baseUrl = "http://127.0.0.1:11434",
  numThreads = 4,
  stream = false,
  numCtx = 16384,
  numPredict = 4096,
  timeoutMs = 600000,
}) {
  if (Math.ceil(Buffer.byteLength(prompt) / 2) + numPredict > numCtx)
    throw new Error("Prompt exceeds estimated context budget");
  const r = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: thermalSignal
      ? AbortSignal.any([thermalSignal, AbortSignal.timeout(timeoutMs)])
      : AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({
      model,
      prompt,
      stream,
      format: "json",
      options: {
        num_thread: numThreads,
        temperature,
        num_ctx: numCtx,
        num_predict: numPredict,
        ...(seed === undefined ? {} : { seed }),
      },
    }),
  });
  if (!r.ok) throw new Error(`Ollama HTTP ${r.status}`);
  let result;
  if (!stream) result = await r.json();
  else {
    if (!r.body) throw new Error("Missing Ollama stream");
    let buffer = "",
      content = "";
    const decoder = new TextDecoder();
    const consume = (line) => {
      if (!line.trim()) return;
      const item = JSON.parse(line);
      if (item.error) throw new Error("Ollama streaming error");
      content += item.response || "";
      if (item.done) result = item;
    };
    for await (const bytes of r.body) {
      buffer += decoder.decode(bytes, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) consume(line);
    }
    buffer += decoder.decode();
    consume(buffer);
    if (!result) throw new Error("Ollama returned an incomplete response");
    result.response = content;
  }
  if (result.error || result.done !== true || result.done_reason === "length")
    throw new Error("Ollama returned an incomplete response");
  const value = JSON.parse(result.response);
  return withMetrics
    ? {
        value,
        metrics: {
          totalDurationNs: result.total_duration ?? null,
          loadDurationNs: result.load_duration ?? null,
          promptTokens: result.prompt_eval_count ?? null,
          completionTokens: result.eval_count ?? null,
          evalDurationNs: result.eval_duration ?? null,
        },
      }
    : value;
}
export function teacherOptions(cfg) {
  return {
    model: process.env.TEACHER_MODEL || cfg.teacherModel,
    baseUrl: process.env.OLLAMA_BASE_URL || cfg.ollamaBaseUrl,
    numThreads: cfg.numThreads ?? 4,
    numCtx: cfg.numCtx,
    numPredict: cfg.numPredict,
    timeoutMs: cfg.timeoutMs,
  };
}

// Fail closed if memory cannot be released before switching models.
export async function releaseOtherModels(baseUrl, target) {
  const list = async () => {
    const response = await fetch(`${baseUrl}/api/ps`, {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      throw new Error(`Ollama model inventory HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.models))
      throw new Error("Invalid Ollama model inventory");
    return data.models;
  };
  for (const model of await list()) {
    const name = model.name || model.model;
    if (name === target) continue;
    if (!name) throw new Error("Missing loaded model name");
    const response = await fetch(`${baseUrl}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(30000),
      body: JSON.stringify({ model: name, stream: false, keep_alive: 0 }),
    });
    if (!response.ok)
      throw new Error(`Could not unload ${name}: HTTP ${response.status}`);
    await response.json();
  }
  if ((await list()).some((model) => (model.name || model.model) !== target))
    throw new Error(
      "Other models remain loaded; benchmark stopped to protect memory",
    );
}

export function connectionFailure(error) {
  return (
    error.message === "fetch failed" ||
    error.name === "TimeoutError" ||
    error.name === "AbortError" ||
    /Ollama HTTP 5\d\d/.test(error.message) ||
    Boolean(error.cause?.code)
  );
}
