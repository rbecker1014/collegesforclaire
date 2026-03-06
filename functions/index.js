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
        max_tokens: 8000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      });

      // Extract text blocks from the response
      const textBlocks = response.content.filter((b) => b.type === "text");
      let rawText = textBlocks.map((b) => b.text).join("");

      // Strip markdown code fences if present
      rawText = rawText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      // Parse JSON
      let profile;
      try {
        profile = JSON.parse(rawText);
      } catch (parseError) {
        logger.error("JSON parse failed", { rawText: rawText.slice(0, 500) });
        throw new HttpsError(
          "internal",
          `Failed to parse Claude response as JSON: ${rawText.slice(0, 200)}`
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
