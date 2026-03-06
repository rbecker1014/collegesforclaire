const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { getSchoolProfilePrompt, getMetricPrompt } = require("./prompts");

const Anthropic = require("@anthropic-ai/sdk");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

/**
 * generateSchoolProfile
 *
 * Accepts { schoolName } and calls Claude (with web search) to generate a full
 * school profile object, then writes it to Firestore schools/{id}.
 * Requires authentication.
 */
exports.generateSchoolProfile = onCall(
  {
    region: "us-central1",
    secrets: ["CLAUDE_API_KEY"],
    timeoutSeconds: 120,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in to use this function.");
    }

    const { schoolName } = request.data;
    if (!schoolName || typeof schoolName !== "string") {
      throw new HttpsError("invalid-argument", "schoolName is required.");
    }

    logger.info("generateSchoolProfile called", {
      uid: request.auth.uid,
      schoolName,
    });

    try {
      // Check Firestore for custom prompt overrides
      let systemPrompt, userPrompt;
      const promptDoc = await db.collection("prompts").doc("school-profile").get();
      if (promptDoc.exists) {
        const data = promptDoc.data();
        systemPrompt = data.system;
        // Support both {{schoolName}} (Prompt Editor format) and ${schoolName} (legacy)
        userPrompt = data.user
          .replace(/\{\{schoolName\}\}/g, schoolName)
          .replace(/\$\{schoolName\}/g, schoolName);
        logger.info("Using custom prompts from Firestore");
      } else {
        const prompts = getSchoolProfilePrompt(schoolName);
        systemPrompt = prompts.system;
        userPrompt = prompts.user;
        logger.info("Using default prompts from prompts.js");
      }

      // Call Claude with web search
      const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      });

      // Log content block summary to help debug parsing issues
      const blockSummary = response.content.map((b) => ({
        type: b.type,
        len: b.type === "text" ? b.text.length : undefined,
      }));
      logger.info("Claude response blocks", {
        stopReason: response.stop_reason,
        blockCount: response.content.length,
        blocks: blockSummary,
      });

      // Concatenate ALL text blocks (web search may interleave tool_use/tool_result blocks)
      const rawText = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");

      // Strip markdown code fences if present
      const stripped = rawText
        .replace(/```json\n?/gi, "")
        .replace(/```\n?/g, "")
        .trim();

      logger.info("Extracted text for parsing", {
        totalLength: stripped.length,
        first500: stripped.slice(0, 500),
        last500: stripped.slice(-500),
      });

      // Parse JSON with multiple fallback strategies
      let profile;
      let parseError;

      // Strategy 1: direct parse after fence stripping
      try {
        profile = JSON.parse(stripped);
      } catch (e1) {
        parseError = e1;
        logger.warn("Strategy 1 (direct parse) failed", { error: e1.message });
      }

      // Strategy 2: extract between first '{' and last '}'
      if (!profile) {
        try {
          const first = stripped.indexOf("{");
          const last = stripped.lastIndexOf("}");
          if (first !== -1 && last > first) {
            profile = JSON.parse(stripped.slice(first, last + 1));
          }
        } catch (e2) {
          logger.warn("Strategy 2 (brace extraction) failed", { error: e2.message });
        }
      }

      // Strategy 3: same extraction on the raw (un-stripped) concatenated text
      if (!profile) {
        try {
          const first = rawText.indexOf("{");
          const last = rawText.lastIndexOf("}");
          if (first !== -1 && last > first) {
            profile = JSON.parse(rawText.slice(first, last + 1));
          }
        } catch (e3) {
          logger.warn("Strategy 3 (raw brace extraction) failed", { error: e3.message });
        }
      }

      if (!profile) {
        logger.error("All JSON parse strategies failed", {
          strippedLength: stripped.length,
          rawLength: rawText.length,
          first500: stripped.slice(0, 500),
          last500: stripped.slice(-500),
          parseError: parseError ? parseError.message : "unknown",
        });
        throw new HttpsError(
          "internal",
          `Failed to parse Claude response as JSON. ` +
          `stop_reason=${response.stop_reason} ` +
          `text_length=${stripped.length} ` +
          `preview: ${stripped.slice(0, 1000)}`
        );
      }

      // Validate required top-level fields
      if (!profile.id || !profile.name || !profile.overview || !profile.nursing) {
        throw new HttpsError(
          "internal",
          "Claude response is missing required fields (id, name, overview, nursing)."
        );
      }

      // Assign rank = count of existing non-archived schools + 1
      const countSnapshot = await db
        .collection("schools")
        .where("archived", "!=", true)
        .count()
        .get();
      profile.rank = countSnapshot.data().count + 1;

      // Write to Firestore
      await db.collection("schools").doc(profile.id).set(profile);
      logger.info("School profile saved to Firestore", {
        schoolId: profile.id,
        rank: profile.rank,
      });

      return { success: true, schoolId: profile.id, schoolName: profile.name };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.error("generateSchoolProfile failed", {
        message: error.message,
        stack: error.stack,
      });
      throw new HttpsError("internal", `Failed to generate school profile: ${error.message}`);
    }
  }
);

/**
 * generateMetric
 *
 * Accepts { metricName, metricDescription, schoolId } and will call Claude
 * to research a specific custom metric for a school.
 * Requires authentication.
 */
exports.generateMetric = onCall(
  // secrets: ["CLAUDE_API_KEY"] — added when Claude calls are wired up
  { region: "us-central1" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in to use this function.");
    }

    const { metricName, metricDescription, schoolId } = request.data;
    if (!metricName || !schoolId) {
      throw new HttpsError("invalid-argument", "metricName and schoolId are required.");
    }

    logger.info("generateMetric called", {
      uid: request.auth.uid,
      metricName,
      schoolId,
    });

    // Build prompts (full implementation in Phase 3)
    const prompts = getMetricPrompt(schoolId, metricName, metricDescription || "");
    logger.debug("Prompts built", { system: prompts.system.slice(0, 80) });

    // TODO Phase 3: call Claude API here
    return { status: "not yet implemented", metricName, schoolId, prompts };
  }
);

/**
 * searchSchools
 *
 * Proxies the College Scorecard API server-side to avoid CORS issues.
 * Accepts { query } — no auth required.
 * Returns { results: [{ id, name, city, state, url }] }
 */
exports.searchSchools = onCall(
  { region: "us-central1" },
  async (request) => {
    const { query } = request.data;
    if (!query || typeof query !== "string" || query.trim().length < 3) {
      throw new HttpsError("invalid-argument", "query must be at least 3 characters.");
    }

    const encoded = encodeURIComponent(query.trim());
    const url =
      `https://api.data.gov/ed/collegescorecard/v1/schools.json` +
      `?school.name=${encoded}` +
      `&fields=id,school.name,school.city,school.state,school.school_url` +
      `&per_page=8&api_key=DEMO_KEY`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new HttpsError("internal", `College Scorecard API error: ${res.status}`);
      }
      const data = await res.json();
      const results = (data.results || []).map((s) => ({
        id: s.id,
        name: s["school.name"],
        city: s["school.city"],
        state: s["school.state"],
        url: s["school.school_url"],
      }));
      return { results };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error("searchSchools failed", { message: err.message });
      throw new HttpsError("internal", `Search failed: ${err.message}`);
    }
  }
);
