import OpenAI from "openai";

export const runtime = "nodejs";

export async function GET() {
  try {
    const client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY || "",
      defaultHeaders: {
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Tender Dashboard",
      },
    });

    const stream = await client.chat.completions.create({
      model: "cohere/command-r-plus",
      messages: [
        {
          role: "user",
          content: "How many r's are in the word 'strawberry'?",
        },
      ],
      stream: true,
    });

    // Return a ReadableStream so the client can stream the response
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              controller.enqueue(encoder.encode(content));
            }
          }
        } catch (err) {
          controller.error(err);
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Transfer-Encoding": "chunked",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("OpenRouter error:", error);
    return new Response(
      `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      {
        status: 500,
        headers: { "Content-Type": "text/plain" },
      }
    );
  }
}