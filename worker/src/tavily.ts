// Tavily web search — minimal port of the web_search tool call.

export interface TavilyResult {
  title: string;
  content: string;
}

export async function tavilySearch(apiKey: string, query: string): Promise<TavilyResult[]> {
  const resp = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: apiKey, query, max_results: 5, include_answer: false }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!resp.ok) throw new Error(`tavily HTTP ${resp.status}`);
  const body = (await resp.json()) as { results?: { title?: string; content?: string }[] };
  return (body.results ?? []).map((r) => ({ title: r.title ?? "", content: r.content ?? "" }));
}
