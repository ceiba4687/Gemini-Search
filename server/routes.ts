import type { Express } from "express";
import { createServer, type Server } from "http";
import {
  GoogleGenerativeAI,
  type ChatSession,
  type GenerateContentResult,
} from "@google/generative-ai";
import { marked } from "marked";
import { setupEnvironment } from "./env";

const env = setupEnvironment();
const defaultGenAI = new GoogleGenerativeAI(env.GOOGLE_API_KEY);

// 修改getGoogleAI函数，处理没有API密钥的情况
function getGoogleAI(apiKey?: string) {
  const key = apiKey || process.env.GOOGLE_API_KEY;
  
  if (!key) {
    throw new Error("No API key provided. Please provide an API key via query parameter or set it in the .env file");
  }
  
  return new GoogleGenerativeAI(key);
}

// 创建模型实例的函数
function getModel(genAI: GoogleGenerativeAI) {
  return genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    generationConfig: {  
      temperature: 0.3,
      topP: 0,
      topK: 1,
      maxOutputTokens: 8192,
    },
    systemInstruction: {
      role: "system", 
      parts: [{ text: "research in english, respond in chinese." }]
    }
  });
}

// Store chat sessions in memory
const chatSessions = new Map<string, ChatSession>();

// Format raw text into proper markdown
async function formatResponseToMarkdown(
  text: string | Promise<string>
): Promise<string> {
  // Ensure we have a string to work with
  const resolvedText = await Promise.resolve(text);

  // First, ensure consistent newlines
  let processedText = resolvedText.replace(/\r\n/g, "\n");

  // Process main sections (lines that start with word(s) followed by colon)
  processedText = processedText.replace(
    /^([A-Za-z][A-Za-z\s]+):(\s*)/gm,
    "## $1$2"
  );

  // Process sub-sections (any remaining word(s) followed by colon within text)
  processedText = processedText.replace(
    /(?<=\n|^)([A-Za-z][A-Za-z\s]+):(?!\d)/gm,
    "### $1"
  );

  // Process bullet points
  processedText = processedText.replace(/^[•●○]\s*/gm, "* ");

  // Split into paragraphs
  const paragraphs = processedText.split("\n\n").filter(Boolean);

  // Process each paragraph
  const formatted = paragraphs
    .map((p) => {
      // If it's a header or list item, preserve it
      if (p.startsWith("#") || p.startsWith("*") || p.startsWith("-")) {
        return p;
      }
      // Add proper paragraph formatting
      return `${p}\n`;
    })
    .join("\n\n");

  // Configure marked options for better header rendering
  marked.setOptions({
    gfm: true,
    breaks: true,
  });

  // Convert markdown to HTML using marked
  return marked.parse(formatted);
}

interface WebSource {
  uri: string;
  title: string;
}

interface GroundingChunk {
  web?: WebSource;
}

interface TextSegment {
  startIndex: number;
  endIndex: number;
  text: string;
}

interface GroundingSupport {
  segment: TextSegment;
  groundingChunkIndices: number[];
  confidenceScores: number[];
}

interface GroundingMetadata {
  groundingChunks: GroundingChunk[];
  groundingSupports: GroundingSupport[];
  searchEntryPoint?: any;
  webSearchQueries?: string[];
}

export function registerRoutes(app: Express): Server {
  // Search endpoint - creates a new chat session
  app.get("/api/search", async (req, res) => {
    try {
      const query = req.query.q as string;
      const apiKey = req.query.apiKey as string | undefined;

      if (!query) {
        return res.status(400).json({
          message: "Query parameter 'q' is required",
        });
      }

      try {
        // 使用自定义API Key或默认API Key
        const genAI = getGoogleAI(apiKey);
        const model = getModel(genAI);
        
        // 继续原来的代码...
        // Create a new chat session with search capability
        const chat = model.startChat({
          tools: [
            {
              // @ts-ignore - google_search is a valid tool but not typed in the SDK yet
              google_search: {},
            },
          ],
        });

        // Generate content with search tool
        const result = await chat.sendMessage(query);
        const response = await result.response;
        console.log(
          "Raw Google API Response:",
          JSON.stringify(
            {
              text: response.text(),
              candidates: response.candidates,
              groundingMetadata: response.candidates?.[0]?.groundingMetadata,
            },
            null,
            2
          )
        );
        const text = response.text();

        // Format the response text to proper markdown/HTML
        const formattedText = await formatResponseToMarkdown(text);

        // Extract sources from grounding metadata
        const sourceMap = new Map<
          string,
          { title: string; url: string; snippet: string }
        >();

        // Get grounding metadata from response
        const metadata = response.candidates?.[0]?.groundingMetadata as any;
        if (metadata) {
          const chunks = metadata.groundingChunks || [];
          const supports = metadata.groundingSupports || [];

          chunks.forEach((chunk: any, index: number) => {
            if (chunk.web?.uri && chunk.web?.title) {
              const url = chunk.web.uri;
              if (!sourceMap.has(url)) {
                // Find snippets that reference this chunk
                const snippets = supports
                  .filter((support: any) =>
                    support.groundingChunkIndices.includes(index)
                  )
                  .map((support: any) => support.segment.text)
                  .join(" ");

                sourceMap.set(url, {
                  title: chunk.web.title,
                  url: url,
                  snippet: snippets || "",
                });
              }
            }
          });
        }

        const sources = Array.from(sourceMap.values());

        // Generate a session ID and store the chat
        const sessionId = Math.random().toString(36).substring(7);
        chatSessions.set(sessionId, chat);

        res.json({
          sessionId,
          summary: formattedText,
          sources,
        });
      } catch (error) {
        // API密钥相关错误
        if (error instanceof Error && error.message.includes("API key")) {
          return res.status(401).json({
            error: "API key error",
            message: error.message,
            requiresApiKey: true
          });
        }
        // 其他错误重新抛出
        throw error;
      }
    } catch (error: any) {
      console.error("Search error:", error);
      res.status(500).json({
        message:
          error.message || "An error occurred while processing your search",
      });
    }
  });

  // Follow-up endpoint - continues existing chat session
  app.post("/api/follow-up", async (req, res) => {
    try {
      const { sessionId, query, apiKey } = req.body;

      if (!sessionId || !query) {
        return res.status(400).json({
          message: "Both sessionId and query are required",
        });
      }

      const chat = chatSessions.get(sessionId);
      if (!chat) {
        return res.status(404).json({
          message: "Chat session not found",
        });
      }

      // Send follow-up message in existing chat
      const result = await chat.sendMessage(query);
      const response = await result.response;
      console.log(
        "Raw Google API Follow-up Response:",
        JSON.stringify(
          {
            text: response.text(),
            candidates: response.candidates,
            groundingMetadata: response.candidates?.[0]?.groundingMetadata,
          },
          null,
          2
        )
      );
      const text = response.text();

      // Format the response text to proper markdown/HTML
      const formattedText = await formatResponseToMarkdown(text);

      // Extract sources from grounding metadata
      const sourceMap = new Map<
        string,
        { title: string; url: string; snippet: string }
      >();

      // Get grounding metadata from response
      const metadata = response.candidates?.[0]?.groundingMetadata as any;
      if (metadata) {
        const chunks = metadata.groundingChunks || [];
        const supports = metadata.groundingSupports || [];

        chunks.forEach((chunk: any, index: number) => {
          if (chunk.web?.uri && chunk.web?.title) {
            const url = chunk.web.uri;
            if (!sourceMap.has(url)) {
              // Find snippets that reference this chunk
              const snippets = supports
                .filter((support: any) =>
                  support.groundingChunkIndices.includes(index)
                )
                .map((support: any) => support.segment.text)
                .join(" ");

              sourceMap.set(url, {
                title: chunk.web.title,
                url: url,
                snippet: snippets || "",
              });
            }
          }
        });
      }

      const sources = Array.from(sourceMap.values());

      res.json({
        summary: formattedText,
        sources,
      });
    } catch (error: any) {
      console.error("Follow-up error:", error);
      res.status(500).json({
        message:
          error.message ||
          "An error occurred while processing your follow-up question",
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
