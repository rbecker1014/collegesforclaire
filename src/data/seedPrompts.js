import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';

export const DEFAULT_SYSTEM = `You are a college research assistant helping a high school student named Claire evaluate nursing programs. Claire's three core criteria are:
1. Direct admission to nursing (apply to nursing with freshman application, no reapplication later)
2. Big school with major sports programs (large enrollment, D1 athletics, active social scene)
3. College town atmosphere (vibrant campus life, things to do, not isolated)

Claire also plays tennis on her high school team (not required for college but nice to have), enjoys socializing, and prefers access to a larger pool of people.

You must return ONLY valid JSON with no markdown, no backticks, no preamble. The JSON must exactly match the schema provided in the user message.

CRITICAL SOURCE REQUIREMENTS:
- Every data point must include its source. Use this hierarchy of preferred sources:
  1. The school's official website (always preferred)
  2. US News Best Colleges (for enrollment, tuition, acceptance rate, rankings, grad rate)
  3. College Scorecard / IPEDS (federal data)
  4. Niche.com (for campus life ratings, student reviews)
  5. The school's official nursing program page (for NCLEX, cohort size, clinical info)
  6. RegisteredNursing.org or AllNurses.com (nursing-specific)
  7. College Transitions (admissions data)
- Be CONSISTENT: use the same source for the same type of data across all schools.
- If you cannot find a data point, set value to "Not available" and source to "Not found".
- sourceUrl must be a real, valid URL. Do not fabricate URLs.
- asOf should reflect when the data is from (e.g., "Fall 2024", "2025-2026").`;

export const DEFAULT_USER = `Research {{schoolName}} and return a complete profile as JSON matching this exact schema:

{
  "id": "lowercase-hyphenated-school-name",
  "name": "Full Official School Name",
  "nickname": "Common nickname or mascot name",
  "primaryColor": "#hexcolor (the school's primary brand color)",
  "rank": 99,
  "archived": false,
  "archiveReason": null,
  "generatedAt": "YYYY-MM-DD",
  "overview": {
    "enrollment": { "value": "XX,XXX", "source": "Source Name", "sourceUrl": "https://...", "asOf": "Fall YYYY" },
    "tuitionInState": { "value": "$XX,XXX/yr", "source": "...", "sourceUrl": "...", "asOf": "..." },
    "tuitionOutState": { "value": "$XX,XXX/yr", "source": "...", "sourceUrl": "...", "asOf": "..." },
    "totalCostOOS": { "value": "~$XX,XXX/yr", "source": "...", "sourceUrl": "...", "asOf": "..." },
    "acceptanceRate": { "value": "XX%", "source": "...", "sourceUrl": "...", "asOf": "..." },
    "campusSize": { "value": "XXX acres", "source": "...", "sourceUrl": "...", "asOf": "..." },
    "setting": { "value": "City/Suburban/Rural/Town", "source": "...", "sourceUrl": "...", "asOf": "..." },
    "studentFacultyRatio": { "value": "XX:1", "source": "...", "sourceUrl": "...", "asOf": "..." },
    "conference": { "value": "Conference Name", "source": "...", "sourceUrl": "...", "asOf": "..." },
    "usNewsRank": { "value": "#XX Category", "source": "...", "sourceUrl": "...", "asOf": "..." },
    "clubsOrgs": { "value": "XXX+", "source": "...", "sourceUrl": "...", "asOf": "..." },
    "greekLife": { "value": "XX chapters, XX% of undergrads", "source": "...", "sourceUrl": "...", "asOf": "..." },
    "scholarshipInfo": { "value": "...", "source": "...", "sourceUrl": "...", "asOf": "..." },
    "location": { "value": "City, State", "source": "...", "sourceUrl": "...", "asOf": "..." },
    "founded": { "value": "YYYY", "source": "...", "sourceUrl": "...", "asOf": "..." },
    "type": { "value": "Public/Private, classification", "source": "...", "sourceUrl": "...", "asOf": "..." },
    "fourYearGradRate": { "value": "XX%", "source": "...", "sourceUrl": "...", "asOf": "..." }
  },
  "nursing": {
    "programRank": { "value": "...", "source": "...", "sourceUrl": "...", "asOf": "..." },
    "nclexPassRate": { "value": "XX% (YYYY)", "source": "...", "sourceUrl": "...", "asOf": "..." },
    "admissionType": { "value": "Direct Freshman Admit / Apply Sophomore Year / etc", "source": "...", "sourceUrl": "...", "asOf": "..." },
    "cohortSize": { "value": "~XXX students/year", "source": "...", "sourceUrl": "...", "asOf": "..." },
    "gpaRequirement": { "value": "...", "source": "...", "sourceUrl": "...", "asOf": "..." },
    "clinicalPartner": { "value": "...", "source": "...", "sourceUrl": "...", "asOf": "..." },
    "newFacility": { "value": "... or N/A", "source": "...", "sourceUrl": "...", "asOf": "..." },
    "bsnScholarsProgram": { "value": "... or N/A", "source": "...", "sourceUrl": "...", "asOf": "..." },
    "programDescription": "2-3 sentence description of the nursing program."
  },
  "campusLife": {
    "athletics": "2-3 sentences about athletics, notable sports, stadium, recent achievements.",
    "socialScene": "2-3 sentences about social life, clubs, Greek life, events.",
    "locationHighlights": "2-3 sentences about the city/town, nearby attractions.",
    "housing": "2-3 sentences about freshman housing, dorms, off-campus situation.",
    "tennis": "1-2 sentences about tennis facilities, D1/club/intramural options."
  },
  "claireFit": {
    "directAdmit": { "meets": true, "detail": "1-2 sentence explanation" },
    "bigSchoolSports": { "meets": true, "detail": "1-2 sentence explanation" },
    "collegeTownVibe": { "meets": true, "detail": "1-2 sentence explanation" },
    "pros": ["6-8 specific pros for Claire"],
    "cons": ["4-6 honest cons or considerations"]
  },
  "video": {
    "url": "https://youtube.com/watch?v=... (official admissions/campus tour video, last 2 years, under 5 min)",
    "title": "Video title",
    "description": "1 sentence describing what the video shows",
    "altSearch": "YouTube search query suggestion for more campus videos"
  },
  "customMetrics": {}
}

Important: Research thoroughly using web search. Be honest in the Claire's Fit assessment. Not every school will meet all three criteria. Pros and cons should be specific, not generic.`;

export const DEFAULT_SEARCH_SYSTEM = `You are a US college/university lookup tool. You know every accredited US college, including their common abbreviations, nicknames, and acronyms. Return ONLY a JSON array. No markdown, no backticks, no explanation.`;

export const DEFAULT_SEARCH_USER = `Find US colleges/universities matching "{{query}}". The query might be an abbreviation (e.g., "UConn", "SDSU", "MIT", "UCLA"), a nickname (e.g., "Rocky Top", "Boilermakers"), a partial name (e.g., "Clemson", "Iowa"), or a full name. Return up to 8 matching results as a JSON array: [{"name": "Full Official Name", "city": "City", "state": "ST", "url": "https://school-website.edu"}]. Include the most likely match first. Only include real, accredited US schools. If the query is a well-known abbreviation, the first result should be that school. Return ONLY the JSON array, nothing else.`;

export async function seedDefaultPrompts(db) {
  const seeds = [
    { id: 'school-profile', system: DEFAULT_SYSTEM, user: DEFAULT_USER },
    { id: 'school-search', system: DEFAULT_SEARCH_SYSTEM, user: DEFAULT_SEARCH_USER },
  ];
  await Promise.all(seeds.map(async ({ id, system, user }) => {
    const ref = doc(db, 'prompts', id);
    const snap = await getDoc(ref);
    if (snap.exists()) return;
    await setDoc(ref, {
      system,
      user,
      lastEditedBy: 'System',
      lastEditedAt: serverTimestamp(),
      version: 1,
    });
  }));
}
