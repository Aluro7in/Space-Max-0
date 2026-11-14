import "dotenv/config";
import express from "express";
import type { Request, Response } from "express";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type ChatRoleId = "explorer" | "astrophysicist" | "analyst";
type ChatModelMode = "fast" | "balanced" | "deep";

interface IncomingHistoryItem {
  role: "user" | "model";
  text: string;
}

interface TelemetryContextPayload {
  targetName?: string;
  ra?: number;
  dec?: number;
  cnnVerdict?: string;
  cnnMatchPct?: number;
  rnnClassification?: string;
  gnnShift?: string;
  pmRa?: number;
  pmDec?: number;
  radialVel?: number;
  gaiaMatched?: boolean;
}

interface ChatRequestBody {
  message?: string;
  history?: IncomingHistoryItem[];
  role?: ChatRoleId;
  modelMode?: ChatModelMode;
  telemetryContext?: TelemetryContextPayload;
}

const ROLE_INSTRUCTIONS: Record<ChatRoleId, string> = {
  explorer:
    "You are the Space-Max 0 Explorer Guide for curious young scientists and NASA Space Apps visitors. " +
    "Explain SPHEREx infrared telescope findings, Brown Dwarfs, H2O/CH4 cloud absorption dips, and moving sky objects " +
    "in warm, vivid, kid-friendly language (2 to 4 clear sentences unless asked for more). Avoid dense jargon.",
  astrophysicist:
    "You are a senior NASA/JPL SPHEREx Infrared Astrophysicist. Provide scientifically rigorous, accurate analysis " +
    "covering 102-band near-infrared spectrophotometry (0.75-5.0 um), water ice/vapor (1.4 um), methane (3.3 um), " +
    "carbon monoxide (4.6 um), ESA Gaia DR3 optical crossmatching, and 2MASS/WISE multi-epoch proper motion.",
  analyst:
    "You are the Space-Max 0 Tri-Model AI Telemetry Engineer. Explain how the PyTorch 2D-CNN artifact classifier, " +
    "102-band Spectral LSTM/RNN chemical model, and Gaia Star-Field GNN kinematic vector collaborate to confirm " +
    "uncatalogued moving infrared candidates while filtering cosmic rays and detector artifacts.",
};

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY_MISSING");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function buildSystemInstruction(
  role: ChatRoleId,
  telemetry?: TelemetryContextPayload
): string {
  const baseRole = ROLE_INSTRUCTIONS[role] ?? ROLE_INSTRUCTIONS.explorer;
  if (!telemetry) return baseRole;

  const targetLine = telemetry.targetName
    ? `Active Target: ${telemetry.targetName}`
    : "Active Target: Custom Sky Coordinate";
  const raStr =
    typeof telemetry.ra === "number" ? telemetry.ra.toFixed(5) : "166.33243";
  const decStr =
    typeof telemetry.dec === "number" ? telemetry.dec.toFixed(5) : "29.94057";
  const gaiaStatus = telemetry.gaiaMatched
    ? "Matched in ESA Gaia DR3 star catalog"
    : "0 matches in ESA Gaia DR3 optical catalog (uncatalogued infrared candidate)";

  return [
    baseRole,
    "",
    "Current Space-Max 0 Telescope Context (use accurately when relevant):",
    `- ${targetLine} (RA ${raStr} deg, Dec ${decStr} deg)`,
    `- 2D-CNN Verdict: ${telemetry.cnnVerdict ?? "Confirmed Celestial Object"} (${telemetry.cnnMatchPct ?? 96}% match)`,
    `- Spectral RNN (102-band 0.75-5.0 um): ${telemetry.rnnClassification ?? "Brown Dwarf (H2O + CH4)"}`,
    `- Kinematic GNN: ${telemetry.gnnShift ?? "Significant Proper Motion"} (pmRA ${telemetry.pmRa ?? 14.2} mas/yr, pmDec ${telemetry.pmDec ?? -6.8} mas/yr, radial velocity ${telemetry.radialVel ?? 41.5} km/s)`,
    `- ESA Gaia DR3 Crossmatch: ${gaiaStatus}`,
  ].join("\n");
}

function selectModelAndConfig(modelMode: ChatModelMode) {
  if (modelMode === "fast") {
    return {
      model: "gemini-3.1-flash-lite",
      thinkingConfig: undefined,
    };
  }
  if (modelMode === "deep") {
    return {
      model: "gemini-4-hydrogen",
      thinkingConfig: { thinkingLevel: ThinkingLevel.XHIGH },
    };
  }
  return {
    model: "gemini-4-hydrogen",
    thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  app.post("/api/chat", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as ChatRequestBody;
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!message) {
      res.status(400).json({ error: "Please enter a question before sending." });
      return;
    }

    const role: ChatRoleId =
      body.role === "astrophysicist" || body.role === "analyst"
        ? body.role
        : "explorer";
    const modelMode: ChatModelMode =
      body.modelMode === "fast" || body.modelMode === "deep"
        ? body.modelMode
        : "balanced";

    const rawHistory = Array.isArray(body.history) ? body.history : [];
    const formattedHistory = rawHistory
      .filter(
        (item) =>
          item &&
          (item.role === "user" || item.role === "model") &&
          typeof item.text === "string" &&
          item.text.trim().length > 0
      )
      .slice(-20)
      .map((item) => ({
        role: item.role,
        parts: [{ text: item.text.trim() }],
      }));

    const { model, thinkingConfig } = selectModelAndConfig(modelMode);
    const systemInstruction = buildSystemInstruction(role, body.telemetryContext);

    try {
      const ai = getGeminiClient();
      const chat = ai.chats.create({
        model,
        history: formattedHistory,
        config: {
          systemInstruction,
          ...(thinkingConfig ? { thinkingConfig } : {}),
        },
      });

      const response = await chat.sendMessage({ message });
      const replyText = response.text?.trim();

      if (!replyText) {
        res.status(502).json({
          error: "Gemini returned an empty response. Please try rephrasing your question.",
        });
        return;
      }

      res.json({
        reply: replyText,
        modelUsed: model,
        roleUsed: role,
      });
    } catch (err: unknown) {
      const errMessage =
        err instanceof Error ? err.message : "Unexpected Gemini server error";

      if (errMessage === "GEMINI_API_KEY_MISSING") {
        res.status(503).json({
          error:
            "Gemini API key is not configured yet. Please add GEMINI_API_KEY in Settings > Secrets.",
        });
        return;
      }

      const lower = errMessage.toLowerCase();
      if (
        lower.includes("403") ||
        lower.includes("permission_denied") ||
        lower.includes("api_key_invalid") ||
        lower.includes("api key not valid")
      ) {
        res.status(403).json({
          error:
            "Gemini API key could not be verified. Please check your GEMINI_API_KEY in Settings > Secrets.",
        });
        return;
      }

      if (lower.includes("429") || lower.includes("resource_exhausted")) {
        res.status(429).json({
          error:
            "Rate limit reached on Gemini API. Please wait a moment and try again, or switch to Fast mode.",
        });
        return;
      }

      if (lower.includes("404") || lower.includes("not_found")) {
        res.status(502).json({
          error: `Requested Gemini model (${model}) was unavailable: ${errMessage}`,
        });
        return;
      }

      res.status(500).json({
        error: `Gemini chat request failed: ${errMessage}`,
      });
    }
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  const port = 3000;
  app.listen(port, "0.0.0.0", () => {
    console.log(`Space-Max 0 server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
