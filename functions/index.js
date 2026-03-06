const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { getSchoolProfilePrompt, getMetricPrompt } = require("./prompts");

/**
 * generateSchoolProfile
 *
 * Accepts { schoolName } and will call Claude to generate a full school
 * profile object matching the app's data schema.
 * Requires authentication.
 */
exports.generateSchoolProfile = onCall(
  // secrets: ["CLAUDE_API_KEY"] — added in Phase 3 when Claude calls are wired up
  { region: "us-central1" },
  async (request) => {
    // Auth check
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

    // Build prompts (full implementation in Phase 3)
    const prompts = getSchoolProfilePrompt(schoolName);
    logger.debug("Prompts built", { system: prompts.system.slice(0, 80) });

    // TODO Phase 3: call Claude API here
    return { status: "not yet implemented", schoolName, prompts };
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
  // secrets: ["CLAUDE_API_KEY"] — added in Phase 3 when Claude calls are wired up
  { region: "us-central1" },
  async (request) => {
    // Auth check
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
