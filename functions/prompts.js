/**
 * Prompt templates for Claude API calls.
 * These will be expanded in the next phase with full research prompts.
 */

/**
 * Returns the system + user prompts for generating a full school profile.
 * @param {string} schoolName
 * @returns {{ system: string, user: string }}
 */
function getSchoolProfilePrompt(schoolName) {
  const system = `You are a college research assistant helping a high school student named Claire \
research nursing programs. You return structured JSON data about colleges with accurate, \
cited information. Focus on nursing program quality, campus life, and fit for a student \
who wants a big school with sports, a college-town vibe, and direct admission to nursing.`;

  const user = `Research the nursing program and campus life at ${schoolName}. \
Return a complete school profile object matching the established data schema. \
Placeholder — full prompt coming in Phase 3.`;

  return { system, user };
}

/**
 * Returns the system + user prompts for researching a custom metric.
 * @param {string} schoolName
 * @param {string} metricName
 * @param {string} metricDescription
 * @returns {{ system: string, user: string }}
 */
function getMetricPrompt(schoolName, metricName, metricDescription) {
  const system = `You are a college research assistant. You look up specific data points \
about colleges and return structured JSON with a value, source, sourceUrl, and asOf date.`;

  const user = `For ${schoolName}, research the following metric:
Name: ${metricName}
Description: ${metricDescription}

Return a JSON object: { value, source, sourceUrl, asOf }
Placeholder — full prompt coming in Phase 3.`;

  return { system, user };
}

module.exports = { getSchoolProfilePrompt, getMetricPrompt };
