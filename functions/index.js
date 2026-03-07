const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { getSchoolProfilePrompt } = require("./prompts");
const crypto = require("crypto");

const Anthropic = require("@anthropic-ai/sdk");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

/**
 * Downloads an image URL server-side and stores it in Firebase Storage.
 * Returns a Firebase Storage download URL (firebasestorage.googleapis.com).
 * @param {string} imageUrl - External image URL to download
 * @param {string} pathBase - Storage path base (e.g. "schools/id/banner"); extension is appended from content-type
 */
async function downloadAndStoreImage(imageUrl, pathBase) {
  const imageResponse = await fetch(imageUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "image/*, */*",
    },
    redirect: "follow",
  });
  if (!imageResponse.ok) {
    throw new Error(`Failed to download image: ${imageResponse.status} ${imageResponse.statusText}`);
  }
  const contentType = imageResponse.headers.get("content-type") || "image/jpeg";
  const ext = contentType.includes("png") ? "png" : "jpg";
  const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

  // Get bucket name from Firebase config env var (set automatically in Cloud Functions)
  let bucketName;
  try {
    bucketName = JSON.parse(process.env.FIREBASE_CONFIG || "{}").storageBucket;
  } catch {}

  const bucket = admin.storage().bucket(bucketName);
  const filePath = pathBase.includes(".") ? pathBase : `${pathBase}.${ext}`;
  const file = bucket.file(filePath);

  // Generate a Firebase download token so the URL matches what getDownloadURL() produces
  const downloadToken = crypto.randomUUID();
  await file.save(imageBuffer, {
    contentType,
    metadata: { metadata: { firebaseStorageDownloadTokens: downloadToken } },
  });

  const encodedPath = encodeURIComponent(filePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;
}

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

      // Multi-turn loop: web search returns pause_turn with no text on first pass
      const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
      const messages = [{ role: "user", content: userPrompt }];
      const allTextBlocks = [];
      const MAX_ITER = 15;
      let lastResponse;

      for (let iter = 0; iter < MAX_ITER; iter++) {
        lastResponse = await client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 16000,
          system: systemPrompt,
          messages,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
        });

        const textBlocks = lastResponse.content.filter((b) => b.type === "text");
        allTextBlocks.push(...textBlocks);

        logger.info("generateSchoolProfile iteration", {
          iter,
          stopReason: lastResponse.stop_reason,
          blockCount: lastResponse.content.length,
          blockTypes: lastResponse.content.map((b) => b.type),
          textLength: textBlocks.reduce((s, b) => s + b.text.length, 0),
        });

        if (lastResponse.stop_reason === "end_turn") break;

        messages.push({ role: "assistant", content: lastResponse.content });
        // pause_turn means the server-side tool is mid-execution — re-send without
        // a new user message so the tool result can complete. Only prompt on other stops.
        if (lastResponse.stop_reason !== "pause_turn") {
          messages.push({ role: "user", content: [{ type: "text", text: "Please continue with your research and provide the complete JSON profile." }] });
        }
      }

      // Concatenate ALL text blocks accumulated across all iterations
      const rawText = allTextBlocks.map((b) => b.text).join("");

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

      // If Claude found a banner image, download and store in Firebase Storage
      // to avoid CORB issues with cross-origin Wikimedia URLs in the browser.
      if (profile.images?.banner?.url) {
        try {
          const storageUrl = await downloadAndStoreImage(profile.images.banner.url, `schools/${profile.id}/banner`);
          profile.images.banner.originalUrl = profile.images.banner.url;
          profile.images.banner.url = storageUrl;
          logger.info("generateSchoolProfile: banner stored in Storage", { schoolId: profile.id, storageUrl });
        } catch (imgErr) {
          logger.warn("generateSchoolProfile: failed to store banner image, clearing it", { error: imgErr.message });
          delete profile.images.banner;
        }
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
 * chatWithClaire
 *
 * AI chatbot that answers questions about Claire's college list.
 * Loads all school data from Firestore, injects into system prompt,
 * and uses web search for questions the data doesn't cover.
 * Requires authentication.
 */
exports.chatWithClaire = onCall(
  {
    region: "us-central1",
    secrets: ["CLAUDE_API_KEY"],
    timeoutSeconds: 120,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in to use this function.");
    }

    const { message, conversationHistory = [], schoolId } = request.data;
    if (!message || typeof message !== "string") {
      throw new HttpsError("invalid-argument", "message is required.");
    }

    logger.info("chatWithClaire called", { uid: request.auth.uid, schoolId });

    // 1. Fetch all non-archived schools from Firestore
    const schoolsSnap = await db.collection("schools")
      .where("archived", "!=", true)
      .get();
    const schools = schoolsSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.rank || 99) - (b.rank || 99));

    // 1b. Fetch notes for each school (up to 10 per school, newest first)
    const notesPromises = schools.map(async (s) => {
      try {
        const snap = await db.collection("schools").doc(s.id)
          .collection("notes").orderBy("createdAt", "desc").limit(10).get();
        return {
          schoolId: s.id,
          notes: snap.docs.map((d) => {
            const n = d.data();
            return {
              text: n.text,
              authorName: n.authorName,
              category: n.category,
              createdAt: n.createdAt ? n.createdAt.toDate().toISOString() : null,
            };
          }),
        };
      } catch {
        return { schoolId: s.id, notes: [] };
      }
    });
    const notesResults = await Promise.all(notesPromises);
    const notesBySchool = {};
    notesResults.forEach(({ schoolId, notes }) => { notesBySchool[schoolId] = notes; });

    // 2. Build school data context
    const schoolDataJSON = JSON.stringify(
      schools.map((s) => ({
        id: s.id,
        name: s.name,
        rank: s.rank,
        primaryColor: s.primaryColor,
        overview: s.overview,
        nursing: s.nursing,
        campusLife: s.campusLife,
        claireFit: s.claireFit,
        video: s.video,
        customMetrics: s.customMetrics,
        notes: notesBySchool[s.id] || [],
      })),
      null,
      2
    );

    // 3. Determine current school name if schoolId provided
    let currentSchoolLine = "";
    if (schoolId) {
      const currentSchool = schools.find((s) => s.id === schoolId);
      if (currentSchool) {
        currentSchoolLine = `\nClaire is currently viewing: ${currentSchool.name} (id: "${schoolId}")`;
      }
    }

    // 4. Load system prompt from Firestore or use hardcoded default
    const DEFAULT_CHAT_SYSTEM = `You are Claire's college research assistant. Claire is a high school student researching nursing programs. You have access to her collected school data and can also search the web for additional information.

CLAIRE'S SCHOOL DATA:
{{schoolData}}
{{currentSchool}}

RULES:
1. When answering questions about schools on Claire's list, ALWAYS use the data provided above first. Cite which school's data you're referencing.
2. For comparisons between schools on her list, use the collected data to build tables or side-by-side breakdowns.
3. For questions the data doesn't cover (weather, distance, crime rates, specific program details not in the data, etc.), use web search to find answers.
4. When you find information that differs from what's in Claire's data, point out the discrepancy and ask if she'd like to update it. Format the suggestion as: [SUGGEST_UPDATE: schoolId="{id}", field="{field.path}", newValue="{value}", source="{source}", sourceUrl="{url}"]
5. When Claire asks about rankings or preferences, give your honest assessment with reasoning but frame it as a suggestion, not a decision. Format ranking suggestions as: [SUGGEST_RERANK: schoolId1, schoolId2, schoolId3, ...]
6. Be conversational, warm, and direct. Claire is a teenager — don't be overly formal.
7. Use specific numbers and data points from her collected data. Don't be vague.
8. If comparing schools, format as a clean comparison — not walls of text.
9. Keep responses concise. If Claire wants more detail, she'll ask.`;

    let systemPrompt = DEFAULT_CHAT_SYSTEM;
    try {
      const promptDoc = await db.collection("prompts").doc("chat-assistant").get();
      if (promptDoc.exists) {
        systemPrompt = promptDoc.data().system || DEFAULT_CHAT_SYSTEM;
        logger.info("chatWithClaire: using Firestore system prompt");
      }
    } catch (promptErr) {
      logger.warn("chatWithClaire: failed to load Firestore prompt, using default", { error: promptErr.message });
    }

    // Inject school data
    systemPrompt = systemPrompt
      .replace("{{schoolData}}", schoolDataJSON)
      .replace("{{currentSchool}}", currentSchoolLine);

    // 5. Call Claude with web search
    const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
    const messages = [
      ...(conversationHistory || []).slice(-10),
      { role: "user", content: message },
    ];

    try {
      // Multi-turn loop: web search may return pause_turn with no text on first pass
      const allTextBlocks = [];
      const MAX_ITER = 10;

      for (let iter = 0; iter < MAX_ITER; iter++) {
        const response = await client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4000,
          system: systemPrompt,
          messages,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
        });

        const textBlocks = response.content.filter((b) => b.type === "text");
        allTextBlocks.push(...textBlocks);

        logger.info("chatWithClaire iteration", {
          iter,
          stopReason: response.stop_reason,
          blockCount: response.content.length,
          blockTypes: response.content.map((b) => b.type),
          textLength: textBlocks.reduce((s, b) => s + b.text.length, 0),
        });

        if (response.stop_reason === "end_turn") break;

        messages.push({ role: "assistant", content: response.content });
        if (response.stop_reason !== "pause_turn") {
          messages.push({ role: "user", content: [{ type: "text", text: "Please continue." }] });
        }
      }

      const fullText = allTextBlocks.map((b) => b.text).join("");

      // 6. Parse [SUGGEST_UPDATE: ...] patterns
      const suggestedUpdates = [];
      const updatePattern = /\[SUGGEST_UPDATE:\s*schoolId="([^"]+)",\s*field="([^"]+)",\s*newValue="([^"]+)",\s*source="([^"]*)",\s*sourceUrl="([^"]*)"\]/g;
      let match;
      while ((match = updatePattern.exec(fullText)) !== null) {
        suggestedUpdates.push({
          schoolId: match[1],
          field: match[2],
          newValue: match[3],
          source: match[4],
          sourceUrl: match[5],
        });
      }

      // 7. Parse [SUGGEST_RERANK: ...] pattern
      let suggestedRerank = null;
      const rerankMatch = fullText.match(/\[SUGGEST_RERANK:\s*([^\]]+)\]/);
      if (rerankMatch) {
        suggestedRerank = rerankMatch[1].split(",").map((s) => s.trim()).filter(Boolean);
      }

      // 8. Strip suggestion tags from response text
      const cleanText = fullText
        .replace(/\[SUGGEST_UPDATE:[^\]]+\]/g, "")
        .replace(/\[SUGGEST_RERANK:[^\]]+\]/g, "")
        .trim();

      logger.info("chatWithClaire response", {
        textLength: cleanText.length,
        suggestedUpdates: suggestedUpdates.length,
        suggestedRerank: suggestedRerank ? suggestedRerank.length : 0,
      });

      return { response: cleanText, suggestedUpdates, suggestedRerank };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error("chatWithClaire failed", { message: err.message });
      throw new HttpsError("internal", `Chat failed: ${err.message}`);
    }
  }
);

/**
 * generateMetric
 *
 * Accepts { metricId, metricName, metricDescription } and calls Claude (with
 * web search) to research the metric for every non-archived school, then
 * batch-writes the results to each school's customMetrics field and to the
 * top-level metrics collection.
 * Requires authentication.
 */
exports.generateMetric = onCall(
  {
    region: "us-central1",
    secrets: ["CLAUDE_API_KEY"],
    timeoutSeconds: 300,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in to use this function.");
    }

    const { metricName, metricDescription = "", metricId: providedId } = request.data;
    if (!metricName || typeof metricName !== "string") {
      throw new HttpsError("invalid-argument", "metricName is required.");
    }

    // Derive a stable metricId slug
    const metricId = providedId || metricName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

    logger.info("generateMetric called", { uid: request.auth.uid, metricName, metricId });

    // Load prompts from Firestore (fall back to hardcoded defaults)
    const DEFAULT_METRIC_SYSTEM = "You are a research assistant gathering specific data about US universities for college comparison. You will research one metric for a given university and return a JSON object. Return ONLY valid JSON with no markdown, no backticks, no explanation. If you cannot find a value, set value to \"Not available\" and source to \"Not found\". sourceUrl must be a real, valid URL.";
    const DEFAULT_METRIC_USER = `Research the following metric for {{schoolName}}:\n\nMetric: {{metricName}}\nDescription: {{metricDescription}}\n\nReturn ONLY this JSON object:\n{\n  "value": "The specific value found",\n  "source": "Source name",\n  "sourceUrl": "https://real-url.edu",\n  "asOf": "Year or time period"\n}\n\nBe specific and precise. Return ONLY the JSON object, nothing else.`;

    let systemPrompt = DEFAULT_METRIC_SYSTEM;
    let userTemplate = DEFAULT_METRIC_USER;
    try {
      const promptDoc = await db.collection("prompts").doc("metric-research").get();
      if (promptDoc.exists) {
        const data = promptDoc.data();
        systemPrompt = data.system || DEFAULT_METRIC_SYSTEM;
        userTemplate = data.user || DEFAULT_METRIC_USER;
        logger.info("generateMetric: using Firestore prompts");
      }
    } catch (promptErr) {
      logger.warn("generateMetric: failed to load Firestore prompts", { error: promptErr.message });
    }

    // Fetch all non-archived schools
    const schoolsSnap = await db.collection("schools").where("archived", "!=", true).get();
    const schools = schoolsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    logger.info("generateMetric: researching metric for schools", { count: schools.length, metricId });

    const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

    // Research metric for each school with concurrency limit of 3
    async function researchSchool(school) {
      const userPrompt = userTemplate
        .replace(/\{\{schoolName\}\}/g, school.name)
        .replace(/\{\{metricName\}\}/g, metricName)
        .replace(/\{\{metricDescription\}\}/g, metricDescription);

      try {
        // Multi-turn loop: web search may return pause_turn with no text on first pass
        const metricMessages = [{ role: "user", content: userPrompt }];
        const allTextBlocks = [];
        const MAX_ITER = 10;

        for (let iter = 0; iter < MAX_ITER; iter++) {
          const response = await client.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 800,
            system: systemPrompt,
            messages: metricMessages,
            tools: [{ type: "web_search_20250305", name: "web_search" }],
          });

          const textBlocks = response.content.filter((b) => b.type === "text");
          allTextBlocks.push(...textBlocks);

          logger.info("generateMetric school iteration", {
            schoolId: school.id,
            iter,
            stopReason: response.stop_reason,
            blockTypes: response.content.map((b) => b.type),
            textLength: textBlocks.reduce((s, b) => s + b.text.length, 0),
          });

          if (response.stop_reason === "end_turn") break;

          metricMessages.push({ role: "assistant", content: response.content });
          if (response.stop_reason !== "pause_turn") {
            metricMessages.push({ role: "user", content: [{ type: "text", text: "Please provide the JSON result." }] });
          }
        }

        const rawText = allTextBlocks.map((b) => b.text).join("").trim();

        // Parse JSON — strip fences, find { ... }
        const stripped = rawText.replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();
        let result;
        try {
          const first = stripped.indexOf("{");
          const last = stripped.lastIndexOf("}");
          if (first !== -1 && last > first) {
            result = JSON.parse(stripped.slice(first, last + 1));
          } else {
            result = JSON.parse(stripped);
          }
        } catch (parseErr) {
          logger.warn("generateMetric: JSON parse failed for school", { schoolId: school.id, error: parseErr.message, raw: stripped.slice(0, 200) });
          result = { value: "Not available", source: "Parse error", sourceUrl: "", asOf: "" };
        }

        return { schoolId: school.id, schoolName: school.name, ...result, name: metricName };
      } catch (err) {
        logger.warn("generateMetric: Claude call failed for school", { schoolId: school.id, error: err.message });
        return { schoolId: school.id, schoolName: school.name, value: "Error", source: err.message, sourceUrl: "", asOf: "", name: metricName };
      }
    }

    // Concurrency limiter: process in batches of 3
    const results = [];
    for (let i = 0; i < schools.length; i += 3) {
      const batch = schools.slice(i, i + 3);
      const batchResults = await Promise.all(batch.map(researchSchool));
      results.push(...batchResults);
    }

    // Batch-write results to Firestore
    const writeBatch = db.batch();

    for (const result of results) {
      const schoolRef = db.collection("schools").doc(result.schoolId);
      const metricData = {
        name: metricName,
        value: result.value,
        source: result.source || "",
        sourceUrl: result.sourceUrl || "",
        asOf: result.asOf || "",
        description: metricDescription,
        researchedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      writeBatch.update(schoolRef, { [`customMetrics.${metricId}`]: metricData });
    }

    // Write metric definition to metrics collection
    const metricRef = db.collection("metrics").doc(metricId);
    writeBatch.set(metricRef, {
      id: metricId,
      name: metricName,
      description: metricDescription,
      lastResearchedAt: admin.firestore.FieldValue.serverTimestamp(),
      schoolCount: results.length,
    }, { merge: true });

    await writeBatch.commit();

    logger.info("generateMetric: completed", { metricId, schoolCount: results.length });

    return {
      success: true,
      metricId,
      metricName,
      results: results.map((r) => ({ schoolId: r.schoolId, schoolName: r.schoolName, value: r.value })),
    };
  }
);

/**
 * backfillSchoolImages
 *
 * Accepts { schoolId, schoolName } and uses Claude (with web search) to find
 * 6 candidate campus photos, downloads them server-side, uploads to Firebase Storage,
 * and saves the candidates array to schools/{schoolId}/images.candidates.
 * Returns the candidates array to the client for display in the photo picker.
 * Requires authentication.
 */
exports.backfillSchoolImages = onCall(
  {
    region: "us-central1",
    secrets: ["CLAUDE_API_KEY"],
    timeoutSeconds: 180,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be signed in.");
    }

    const { schoolId, schoolName } = request.data;
    if (!schoolId || !schoolName) {
      throw new HttpsError("invalid-argument", "schoolId and schoolName are required.");
    }

    logger.info("backfillSchoolImages called", { uid: request.auth.uid, schoolId, schoolName });

    const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });

    // ── Fetch already-known URLs to avoid duplicates ─────────────────────────
    const schoolDoc = await db.collection("schools").doc(schoolId).get();
    const schoolData = schoolDoc.exists ? schoolDoc.data() : {};
    const existingUrls = [
      ...(schoolData.images?.candidates || []).map((c) => c.url),
      ...(schoolData.images?.gallery || []).map((g) => g.url),
    ].filter(Boolean);

    const avoidSection = existingUrls.length > 0
      ? `\n\nDo NOT return any of these URLs — they were already found in a previous search:\n${existingUrls.map((u) => `- ${u}`).join("\n")}`
      : "";

    const searchTimestamp = Date.now();

    // ── Step 1: Multi-turn web search to gather photo URLs ───────────────────
    const messages = [{
      role: "user",
      content: `Search attempt #${searchTimestamp} — find campus photos of ${schoolName}. I need DIVERSE photos showing DIFFERENT aspects of campus.

Find a direct image URL for EACH of these 8 specific categories (search separately for each):

1. AERIAL/OVERVIEW — aerial or wide shot showing the full campus layout. Search: "${schoolName} aerial campus photo"
2. ICONIC BUILDING — the school's most recognizable or historic building. Search: "${schoolName} most famous building"
3. STUDENT LIFE — students on campus walking, studying, or socializing. Search: "${schoolName} students campus"
4. ATHLETICS/STADIUM — football stadium, basketball arena, or sports facility. Search: "${schoolName} stadium arena"
5. LIBRARY/ACADEMICS — the main library or an impressive academic building. Search: "${schoolName} library"
6. CAMPUS SCENERY — quad, gardens, fountain, or scenic campus view. Search: "${schoolName} campus quad fountain"
7. DORMS/HOUSING — residence halls or student housing exterior. Search: "${schoolName} residence hall dorms"
8. NURSING/HEALTH — nursing building, simulation lab, or health sciences facility. Search: "${schoolName} nursing school building"

For each category, do a SEPARATE web search. Look for direct image URLs (ending in .jpg .jpeg .png .webp) from:
- The school's official website and subpages (try /admissions, /about, /campus-life)
- upload.wikimedia.org/wikipedia/commons/ (search site:commons.wikimedia.org "${schoolName}")
- The school's official Flickr or social media pages
- News articles or press photos of the campus

Each URL must be from a DIFFERENT page or source — do not list multiple photos from the same page.${avoidSection}`,
    }];

    const allTextBlocks = [];
    const MAX_ITER = 15;

    for (let iter = 0; iter < MAX_ITER; iter++) {
      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 8000,
        system: "You are a research assistant finding campus photos for US universities. Search thoroughly and report every direct image URL you find.",
        messages,
        tools: [{ type: "web_search_20250305", name: "web_search" }],
      });

      const textBlocks = response.content.filter((b) => b.type === "text");
      allTextBlocks.push(...textBlocks);

      logger.info("backfillSchoolImages search iteration", {
        iter,
        stopReason: response.stop_reason,
        blockCount: response.content.length,
        textLength: textBlocks.reduce((s, b) => s + b.text.length, 0),
        textPreview: textBlocks.map((b) => b.text.slice(0, 200)).join(" | "),
      });

      if (response.stop_reason === "end_turn") break;

      messages.push({ role: "assistant", content: response.content });
      if (response.stop_reason !== "pause_turn") {
        messages.push({ role: "user", content: [{ type: "text", text: "Continue searching and list all image URLs you found." }] });
      }
    }

    const researchText = allTextBlocks.map((b) => b.text).join("\n");
    logger.info("backfillSchoolImages: research complete", {
      schoolId,
      researchLength: researchText.length,
      researchPreview: researchText.slice(0, 1000),
    });

    // ── Step 2: Separate no-tools call to extract URLs as clean JSON ─────────
    // This avoids the problem of web_search responses embedding JSON inside
    // natural language that confuses simple [ → ] extraction.
    const avoidUrlSet = new Set(existingUrls);
    const avoidJsonNote = avoidUrlSet.size > 0
      ? `\n\nDo NOT include any of these already-known URLs:\n${[...avoidUrlSet].map((u) => `- ${u}`).join("\n")}`
      : "";

    const formatResponse = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 3000,
      system: "You extract image URLs from research notes and return ONLY valid JSON. No markdown, no explanation, no code fences.",
      messages: [{
        role: "user",
        content: `From this research about ${schoolName} campus photos, extract 8 UNIQUE image URLs — each showing a DIFFERENT aspect of campus.

Research notes:
${researchText}

Return ONLY this JSON array (absolutely nothing else before or after):
[{"url": "https://example.com/image.jpg", "caption": "description of what's in the photo", "source": "source website name", "category": "one of: aerial, iconic-building, student-life, athletics, library, scenery, dorms, nursing"}]

Rules:
- Only include URLs that start with http:// or https://
- Only include URLs that point to actual photos (ending in .jpg, .jpeg, .png, .webp, .gif, OR from image CDNs: amazonaws.com, cloudinary.com, imgix.net, fastly.net, wp.com, squarespace-cdn.com, wikimedia.org)
- Do NOT include logos, icons, headshots, social media profile images, or graphics — only campus/building/student photographs
- Do NOT include URLs ending in .html, .php, .asp, or paths that are clearly HTML pages
- Each URL must be from a DIFFERENT source/page
- Include exactly ONE URL per category if possible; up to 8 total
- If you find no valid image URLs, return: []${avoidJsonNote}`,
      }],
    });

    const formatText = formatResponse.content
      .filter((b) => b.type === "text").map((b) => b.text).join("").trim();
    const formatStripped = formatText.replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();

    logger.info("backfillSchoolImages: format response", {
      schoolId,
      raw: formatStripped.slice(0, 800),
    });

    // Parse JSON — try multiple strategies
    let photoList = [];

    // Strategy 1: direct parse
    try { photoList = JSON.parse(formatStripped); } catch (_) {}

    // Strategy 2: find [ ... ]
    if (!Array.isArray(photoList) || photoList.length === 0) {
      try {
        const first = formatStripped.indexOf("[");
        const last = formatStripped.lastIndexOf("]");
        if (first !== -1 && last > first) {
          photoList = JSON.parse(formatStripped.slice(first, last + 1));
        }
      } catch (_) {}
    }

    if (!Array.isArray(photoList)) photoList = [];

    logger.info("backfillSchoolImages: parsed photo list", {
      schoolId,
      count: photoList.length,
      urls: photoList.map((p) => p.url),
    });

    // ── Step 3: Download each URL with validation, timeout, and logging ──────
    const FETCH_HEADERS = {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "image/*, */*",
    };

    function isValidImageUrl(url) {
      if (!url || typeof url !== "string") return false;
      if (!url.startsWith("http://") && !url.startsWith("https://")) return false;
      if (url.startsWith("data:") || url.startsWith("blob:")) return false;
      return true;
    }

    async function fetchWithTimeout(url, options, timeoutMs = 10000) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        return await fetch(url, { ...options, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    }

    async function storeImageBuffer(imageBuffer, contentType, filePath) {
      let bucketName;
      try { bucketName = JSON.parse(process.env.FIREBASE_CONFIG || "{}").storageBucket; } catch {}
      const bucket = admin.storage().bucket(bucketName);
      const file = bucket.file(filePath);
      const downloadToken = crypto.randomUUID();
      await file.save(imageBuffer, {
        contentType: contentType || "image/jpeg",
        metadata: { metadata: { firebaseStorageDownloadTokens: downloadToken } },
      });
      const encodedPath = encodeURIComponent(filePath);
      return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${downloadToken}`;
    }

    const candidates = [];
    let storageIndex = 0;
    // Deduplicate: skip URLs already stored in candidates or gallery (by original URL)
    const seenDownloadUrls = new Set(existingUrls);

    for (let i = 0; i < photoList.length; i++) {
      const photo = photoList[i];
      if (!isValidImageUrl(photo.url)) {
        logger.warn("backfillSchoolImages: skipping invalid URL", { schoolId, index: i, url: photo.url });
        continue;
      }
      if (seenDownloadUrls.has(photo.url)) {
        logger.info("backfillSchoolImages: skipping duplicate URL", { schoolId, index: i, url: photo.url });
        continue;
      }
      seenDownloadUrls.add(photo.url);

      logger.info("backfillSchoolImages: attempting download", { schoolId, index: i, url: photo.url });
      try {
        const resp = await fetchWithTimeout(photo.url, { headers: FETCH_HEADERS, redirect: "follow" }, 15000);
        const contentType = resp.headers.get("content-type") || "";

        logger.info("backfillSchoolImages: download response", {
          schoolId, index: i, url: photo.url,
          status: resp.status, contentType,
        });

        if (!resp.ok) {
          logger.warn("backfillSchoolImages: download failed non-ok", { schoolId, index: i, status: resp.status });
          continue;
        }

        // Skip HTML pages — these are redirects to error/login pages, not images
        if (contentType.startsWith("text/html") || contentType.startsWith("text/plain")) {
          logger.warn("backfillSchoolImages: got HTML instead of image, skipping", { schoolId, index: i, contentType });
          continue;
        }

        const imageBuffer = Buffer.from(await resp.arrayBuffer());

        // Sanity check: valid images should be at least 5KB
        if (imageBuffer.length < 5000) {
          logger.warn("backfillSchoolImages: response too small to be an image", { schoolId, index: i, bytes: imageBuffer.length });
          continue;
        }

        const ext = contentType.includes("png") ? "png" : contentType.includes("gif") ? "gif" : contentType.includes("webp") ? "webp" : "jpg";
        const filePath = `schools/${schoolId}/photos/photo-${storageIndex}.${ext}`;
        const storageUrl = await storeImageBuffer(imageBuffer, contentType || "image/jpeg", filePath);

        candidates.push({
          url: storageUrl,
          caption: photo.caption || "",
          source: photo.source || "",
          category: photo.category || "",
          selected: false,
        });
        storageIndex++;
        logger.info("backfillSchoolImages: stored photo", { schoolId, storageIndex, filePath, bytes: imageBuffer.length, category: photo.category });
      } catch (err) {
        logger.warn("backfillSchoolImages: error downloading photo", { schoolId, index: i, url: photo.url, error: err.message });
      }
    }

    // ── Step 4: og:image fallback when fewer than 3 candidates ──────────────
    // Try the homepage and a few sub-pages to supplement whatever Claude found.
    if (candidates.length < 3) {
      logger.info("backfillSchoolImages: fewer than 3 photos, trying og:image fallback", { schoolId, have: candidates.length });
      try {
        // Get official website URL from Claude
        const siteResponse = await client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 100,
          system: "You are a US college database. Return ONLY valid JSON, no markdown.",
          messages: [{ role: "user", content: `Official website URL for ${schoolName}? Return ONLY: {"url": "https://..."}` }],
        });
        const siteText = siteResponse.content.filter((b) => b.type === "text").map((b) => b.text).join("").trim();
        const siteStripped = siteText.replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();
        const siteFirst = siteStripped.indexOf("{");
        const siteLast = siteStripped.lastIndexOf("}");
        const websiteUrl = JSON.parse(siteStripped.slice(siteFirst, siteLast + 1)).url;

        if (websiteUrl && websiteUrl.startsWith("http")) {
          const base = new URL(websiteUrl);
          // Try homepage, /admissions, /about — collect og:image from each
          const pagesToTry = [
            { url: websiteUrl, label: "homepage" },
            { url: `${base.protocol}//${base.host}/admissions`, label: "admissions" },
            { url: `${base.protocol}//${base.host}/about`, label: "about" },
          ];

          const ogHeaders = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,*/*",
          };

          const seenOgUrls = new Set(candidates.map((c) => c.url));

          for (const page of pagesToTry) {
            if (candidates.length >= 6) break;
            try {
              logger.info("backfillSchoolImages: fetching page for og:image", { schoolId, url: page.url, label: page.label });
              const pageResp = await fetchWithTimeout(page.url, { headers: ogHeaders, redirect: "follow" }, 15000);
              if (!pageResp.ok) continue;

              const html = await pageResp.text();
              const ogMatch =
                html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
                html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i) ||
                html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);

              if (!ogMatch || !ogMatch[1]) continue;

              let imageUrl = ogMatch[1].trim();
              if (imageUrl.startsWith("//")) imageUrl = "https:" + imageUrl;
              else if (imageUrl.startsWith("/")) imageUrl = `${base.protocol}//${base.host}${imageUrl}`;

              if (!isValidImageUrl(imageUrl) || seenOgUrls.has(imageUrl)) continue;
              seenOgUrls.add(imageUrl);

              logger.info("backfillSchoolImages: found og:image", { schoolId, imageUrl, page: page.label });
              const storageUrl = await downloadAndStoreImage(imageUrl, `schools/${schoolId}/photos/photo-${storageIndex}`);
              candidates.push({
                url: storageUrl,
                caption: `${schoolName} — ${page.label}`,
                source: websiteUrl,
                selected: false,
              });
              storageIndex++;
              logger.info("backfillSchoolImages: og:image stored", { schoolId, page: page.label, storageUrl });
            } catch (pageErr) {
              logger.warn("backfillSchoolImages: og:image page failed", { schoolId, page: page.url, error: pageErr.message });
            }
          }
        }
      } catch (fallbackErr) {
        logger.warn("backfillSchoolImages: og:image fallback failed", { schoolId, error: fallbackErr.message });
      }
    }

    if (candidates.length === 0) {
      throw new HttpsError("not-found", `Could not download any photos for ${schoolName}. All ${photoList.length} candidate URLs failed.`);
    }

    await db.collection("schools").doc(schoolId).update({
      "images.candidates": candidates,
    });

    logger.info("backfillSchoolImages: saved", { schoolId, count: candidates.length });
    return { success: true, candidates };
  }
);

/**
 * searchSchools
 *
 * Proxies the College Scorecard API server-side (avoids CORS).
 * Caches results in Firestore for 24 hours to avoid DEMO_KEY rate limits.
 * Retries once on 429. Accepts { query } — no auth required.
 * Returns { results: [{ id, name, city, state, url }] }
 */
exports.searchSchools = onCall(
  {
    region: "us-central1",
    secrets: ["CLAUDE_API_KEY"],
  },
  async (request) => {
    const { query } = request.data;
    if (!query || typeof query !== "string" || query.trim().length < 3) {
      throw new HttpsError("invalid-argument", "query must be at least 3 characters.");
    }

    const q = query.trim().toLowerCase();

    // Sanitize to a valid Firestore doc ID
    const cacheRef = db.collection("searchCache").doc(
      q.replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, "-").slice(0, 100)
    );

    // Check Firestore cache (24-hour TTL); skip entries with 0 results
    try {
      const cacheDoc = await cacheRef.get();
      if (cacheDoc.exists) {
        const cached = cacheDoc.data();
        if (!cached.results || cached.results.length === 0) {
          // Stale empty cache — delete and re-search
          logger.info("searchSchools: deleting empty cache entry", { query: q });
          cacheRef.delete().catch(() => {});
        } else {
          const ageMs = Date.now() - (cached.cachedAt?.toMillis() ?? 0);
          if (ageMs < 24 * 60 * 60 * 1000) {
            logger.info("searchSchools cache hit", { query: q, count: cached.results.length });
            return { results: cached.results };
          }
        }
      }
    } catch (cacheErr) {
      logger.warn("searchSchools cache read failed", { error: cacheErr.message });
    }

    // Load prompts from Firestore (fall back to hardcoded defaults)
    const DEFAULT_SYSTEM = "You are a US college/university lookup tool. You know every accredited US college, including their common abbreviations, nicknames, and acronyms. Return ONLY a JSON array. No markdown, no backticks, no explanation.";
    const DEFAULT_USER = `Find US colleges/universities matching "{{query}}". The query might be an abbreviation (e.g., "UConn", "SDSU", "MIT", "UCLA"), a nickname (e.g., "Rocky Top", "Boilermakers"), a partial name (e.g., "Clemson", "Iowa"), or a full name. Return up to 8 matching results as a JSON array: [{"name": "Full Official Name", "city": "City", "state": "ST", "url": "https://school-website.edu"}]. Include the most likely match first. Only include real, accredited US schools. If the query is a well-known abbreviation, the first result should be that school. Return ONLY the JSON array, nothing else.`;

    let systemPrompt = DEFAULT_SYSTEM;
    let userPrompt = DEFAULT_USER;
    try {
      const promptDoc = await db.collection("prompts").doc("school-search").get();
      if (promptDoc.exists) {
        const data = promptDoc.data();
        systemPrompt = data.system || DEFAULT_SYSTEM;
        userPrompt = data.user || DEFAULT_USER;
        logger.info("searchSchools: using Firestore prompts");
      } else {
        logger.info("searchSchools: using hardcoded default prompts");
      }
    } catch (promptErr) {
      logger.warn("searchSchools: failed to load Firestore prompts, using defaults", { error: promptErr.message });
    }

    // Replace {{query}} placeholder
    userPrompt = userPrompt.replace(/\{\{query\}\}/g, query.trim());

    // Call Claude
    try {
      const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY });
      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });

      const rawText = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();

      logger.info("searchSchools Claude response", {
        query: query.trim(),
        raw: rawText.slice(0, 500),
      });

      // Parse JSON array — strip fences, then find [ ... ]
      const stripped = rawText.replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();
      let results = [];
      try {
        const first = stripped.indexOf("[");
        const last = stripped.lastIndexOf("]");
        if (first !== -1 && last > first) {
          const parsed = JSON.parse(stripped.slice(first, last + 1));
          results = Array.isArray(parsed) ? parsed : [];
        } else {
          results = JSON.parse(stripped);
          if (!Array.isArray(results)) results = [];
        }
      } catch (parseErr) {
        logger.warn("searchSchools: JSON parse failed", {
          error: parseErr.message,
          raw: stripped.slice(0, 300),
        });
        results = [];
      }

      // Cache (best-effort)
      cacheRef.set({ results, cachedAt: admin.firestore.FieldValue.serverTimestamp(), query: q })
        .catch((e) => logger.warn("searchSchools cache write failed", { error: e.message }));

      return { results };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      logger.error("searchSchools failed", { message: err.message });
      throw new HttpsError("internal", `Search failed: ${err.message}`);
    }
  }
);
