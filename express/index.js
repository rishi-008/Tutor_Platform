// require('dotenv').config(); Don't need this since using systemd
const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const crypto = require("crypto");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const app = express();
const PORT = Number(process.env.PORT) || 3000;

const asyncHandler = (handler) => (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);

app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend/build")));

// Serve uploaded assets
const uploadsRoot = path.join(__dirname, "uploads");
const profilePicsDir = path.join(uploadsRoot, "profile-pics");
fs.mkdirSync(profilePicsDir, { recursive: true });
app.use("/uploads", express.static(uploadsRoot));

const PROFILE_PIC_MAX_BYTES = 2 * 1024 * 1024; // 2MB

const getSpacesConfig = () => {
    const accessKeyId = process.env.DO_SPACES_ACCESS_KEY || process.env.SPACES_KEY || process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.DO_SPACES_SECRET_KEY || process.env.SPACES_SECRET || process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.DO_SPACES_REGION || "tor1";
    const bucket = process.env.DO_PROFILE_PICS_BUCKET || "tutor-platform-profile-pics";
    // For DigitalOcean Spaces, the S3 endpoint is typically: https://tor1.digitaloceanspaces.com
    const endpoint = process.env.DO_SPACES_ENDPOINT || `https://${region}.digitaloceanspaces.com`;
    // Public base URL can be the bucket origin endpoint: https://<bucket>.<region>.digitaloceanspaces.com
    const publicBaseUrl =
        process.env.DO_PROFILE_PICS_PUBLIC_BASE_URL || `https://${bucket}.${region}.digitaloceanspaces.com`;

    const enabled = Boolean(accessKeyId && secretAccessKey && bucket && endpoint && publicBaseUrl);
    return { enabled, accessKeyId, secretAccessKey, region, bucket, endpoint, publicBaseUrl };
};

const safeImageExtension = (mimetype, originalName) => {
    const mime = typeof mimetype === "string" ? mimetype.toLowerCase() : "";
    if (mime === "image/jpeg" || mime === "image/jpg") return ".jpg";
    if (mime === "image/png") return ".png";
    if (mime === "image/webp") return ".webp";
    if (mime === "image/gif") return ".gif";
    // fall back to original ext if it looks safe
    const ext = (path.extname(originalName || "") || "").toLowerCase();
    if ([".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext)) {
        return ext === ".jpeg" ? ".jpg" : ext;
    }
    return ".jpg";
};

const makeRandomId = () =>
    typeof crypto.randomUUID === "function" ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");

const uploadToSpacesIfConfigured = async ({ buffer, contentType, key }) => {
    const spaces = getSpacesConfig();
    if (!spaces.enabled) return null;

    const client = new S3Client({
        region: spaces.region,
        endpoint: spaces.endpoint,
        credentials: {
            accessKeyId: spaces.accessKeyId,
            secretAccessKey: spaces.secretAccessKey,
        },
    });

    await client.send(
        new PutObjectCommand({
            Bucket: spaces.bucket,
            Key: key,
            Body: buffer,
            ContentType: contentType,
            ACL: "public-read",
        })
    );

    return `${spaces.publicBaseUrl}/${key}`;
};

const profilePicUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: PROFILE_PIC_MAX_BYTES },
    fileFilter: (_req, file, cb) => {
        if (!file || typeof file.mimetype !== "string" || !file.mimetype.startsWith("image/")) {
            return cb(new Error("INVALID_FILE_TYPE"));
        }
        return cb(null, true);
    },
});

const PROOF_DOC_MAX_BYTES = 8 * 1024 * 1024; // 8MB
const safeProofDocExtension = (mimetype, originalName) => {
    const mime = typeof mimetype === "string" ? mimetype.toLowerCase() : "";
    if (mime === "application/pdf") return ".pdf";
    // allow images too
    return safeImageExtension(mimetype, originalName);
};

const proofDocUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: PROOF_DOC_MAX_BYTES },
    fileFilter: (_req, file, cb) => {
        const mime = typeof file?.mimetype === "string" ? file.mimetype.toLowerCase() : "";
        const ok = mime === "application/pdf" || mime.startsWith("image/");
        if (!ok) return cb(new Error("INVALID_FILE_TYPE"));
        return cb(null, true);
    },
});

app.post("/api/upload/proofdoc/tutor/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: "Invalid id" });
    }

    proofDocUpload.single("file")(req, res, (err) => {
        if (err) {
            if (err.code === "LIMIT_FILE_SIZE") {
                return res.status(413).json({ message: "File too large (max 8MB)" });
            }
            if (err.message === "INVALID_FILE_TYPE") {
                return res.status(400).json({ message: "Invalid file type (must be an image or PDF)" });
            }
            console.error("[upload] proofdoc error:", err);
            return res.status(500).json({ message: "Upload failed" });
        }

        if (!req.file) {
            return res.status(400).json({ message: "Missing file" });
        }

        Promise.resolve()
            .then(async () => {
                const ext = safeProofDocExtension(req.file.mimetype, req.file.originalname);
                const key = `proofdocs/tutor-${id}${ext}`;

                const spacesUrl = await uploadToSpacesIfConfigured({
                    buffer: req.file.buffer,
                    contentType: req.file.mimetype,
                    key,
                });
                if (spacesUrl) {
                    res.set("X-Upload-Storage", "spaces");
                    return res.status(201).json({ url: spacesUrl });
                }

                const localPath = path.join(profilePicsDir, key);
                fs.mkdirSync(path.dirname(localPath), { recursive: true });
                fs.writeFileSync(localPath, req.file.buffer);
                const url = `/uploads/profile-pics/${key}`;
                res.set("X-Upload-Storage", "local");
                return res.status(201).json({ url });
            })
            .catch((uploadErr) => {
                console.error("[upload] proofdoc store error:", uploadErr);
                return res.status(500).json({ message: "Upload failed" });
            });
    });
});

app.post("/api/upload/profile-pic", (req, res) => {
    profilePicUpload.single("file")(req, res, (err) => {
        if (err) {
            if (err.code === "LIMIT_FILE_SIZE") {
                return res.status(413).json({ message: "File too large (max 2MB)" });
            }
            if (err.message === "INVALID_FILE_TYPE") {
                return res.status(400).json({ message: "Invalid file type (must be an image)" });
            }
            console.error("[upload] profile-pic error:", err);
            return res.status(500).json({ message: "Upload failed" });
        }

        if (!req.file) {
            return res.status(400).json({ message: "Missing file" });
        }

        Promise.resolve()
            .then(async () => {
                const ext = safeImageExtension(req.file.mimetype, req.file.originalname);
                const key = `profiles/profile-${Date.now()}-${makeRandomId()}${ext}`;

                // Prefer DigitalOcean Spaces when configured
                const spacesUrl = await uploadToSpacesIfConfigured({
                    buffer: req.file.buffer,
                    contentType: req.file.mimetype,
                    key,
                });
                if (spacesUrl) {
                    res.set("X-Upload-Storage", "spaces");
                    return res.status(201).json({ url: spacesUrl });
                }

                // Fallback: store locally on disk
                const localPath = path.join(profilePicsDir, key);
                fs.mkdirSync(path.dirname(localPath), { recursive: true });
                fs.writeFileSync(localPath, req.file.buffer);
                const url = `/uploads/profile-pics/${key}`;
                res.set("X-Upload-Storage", "local");
                return res.status(201).json({ url });
            })
            .catch((uploadErr) => {
                console.error("[upload] profile-pic store error:", uploadErr);
                return res.status(500).json({ message: "Upload failed" });
            });
    });
});

app.post("/api/upload/profile-pic/:userType/:id", (req, res) => {
    const userType = String(req.params.userType || "").toLowerCase();
    const id = Number(req.params.id);
    if (userType !== "student" && userType !== "tutor") {
        return res.status(400).json({ message: "Invalid userType" });
    }
    if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ message: "Invalid id" });
    }

    profilePicUpload.single("file")(req, res, (err) => {
        if (err) {
            if (err.code === "LIMIT_FILE_SIZE") {
                return res.status(413).json({ message: "File too large (max 2MB)" });
            }
            if (err.message === "INVALID_FILE_TYPE") {
                return res.status(400).json({ message: "Invalid file type (must be an image)" });
            }
            console.error("[upload] profile-pic error:", err);
            return res.status(500).json({ message: "Upload failed" });
        }

        if (!req.file) {
            return res.status(400).json({ message: "Missing file" });
        }

        Promise.resolve()
            .then(async () => {
                const ext = safeImageExtension(req.file.mimetype, req.file.originalname);
                const key = `profiles/${userType}-${id}${ext}`;

                const spacesUrl = await uploadToSpacesIfConfigured({
                    buffer: req.file.buffer,
                    contentType: req.file.mimetype,
                    key,
                });
                if (spacesUrl) {
                    res.set("X-Upload-Storage", "spaces");
                    return res.status(201).json({ url: spacesUrl });
                }

                const localPath = path.join(profilePicsDir, key);
                fs.mkdirSync(path.dirname(localPath), { recursive: true });
                fs.writeFileSync(localPath, req.file.buffer);
                const url = `/uploads/profile-pics/${key}`;
                res.set("X-Upload-Storage", "local");
                return res.status(201).json({ url });
            })
            .catch((uploadErr) => {
                console.error("[upload] profile-pic store error:", uploadErr);
                return res.status(500).json({ message: "Upload failed" });
            });
    });
});


const accountsFilePath = path.join(__dirname, "api/accounts.json");
const reportsFilePath = path.join(__dirname, "api/reports.json");
const sessionsFilePath = path.join(__dirname, "api/sessions.json");
const resourcesFilePath = path.join(__dirname, "api/resources.json");
const universityFilePath = path.join(__dirname, "api/universities.json");

// const DATABASE_URL = process.env.DATABASE_URL;

const { Pool } = require("pg");

let OpenAI = null;
try {
    OpenAI = require("openai");
} catch (e) {
    // Optional dependency until installed. Endpoint will fall back to mock.
    OpenAI = null;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // If you use sslmode=require or DO-managed DB, you may need ssl:
  // ssl: { rejectUnauthorized: false },
});

pool.on("error", (err) => {
    console.error("[db] Pool error:", err);
});

const MAX_AI_SESSION_PACKS_PER_ACTIVE_SESSION = 5;

// If the DB schema isn't migrated yet, we'll fall back to an in-memory counter.
// This avoids accidentally overusing OpenAI while keeping the app functional.
const aiSessionPackCountFallback = new Map();

const ensureAiSessionPackCountColumn = async () => {
    try {
        await pool.query(
            "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ai_session_pack_count INTEGER NOT NULL DEFAULT 0"
        );
    } catch (err) {
        console.warn(
            "[db] unable to ensure ai_session_pack_count column; falling back to in-memory limits:",
            err?.message || err
        );
    }
};

ensureAiSessionPackCountColumn();

const TUTOR_SELECT_COLUMNS = `
    SELECT
        u.id,
        u.email,
        u.password,
        u.is_admin,
        u.is_approved,
        u.proof_doc,
        t.user_id,
        t.name,
        t.age,
        t.birthday,
        t.language,
        t.education,
        t.phone,
        t.description,
        t.profile_pic,
        t.banner_key,
        bt.cdn_url AS banner_url,
        t.approved_courses,
        t.rating::float8 AS rating,
        t."costPerHour"::float8 AS "costPerHour"
    FROM tutors t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN banner_types bt ON bt.key = t.banner_key
    WHERE u.user_type = 'tutor'
`;

const STUDENT_SELECT_COLUMNS = `
    SELECT
        u.id,
        u.email,
        u.password,
        u.is_admin,
        u.is_approved,
        u.proof_doc,
        s.user_id,
        s.name,
        s.age,
        s.major,
        s.profile_pic,
        s.birthday,
        s.language
    FROM students s
    JOIN users u ON u.id = s.user_id
    WHERE u.user_type = 'student'
`;

const tutorRowToAccount = (row) => ({
    id: row.id,
    email: row.email,
    password: row.password,
    tutor: {
        name: row.name,
        rating: typeof row.rating === "number" ? row.rating : Number(row.rating || 0),
        education: row.education || "",
        costPerHour:
            typeof row.costPerHour === "number" ? row.costPerHour : Number(row.costPerHour || 0),
        birthday: row.birthday,
        language: row.language,
        description: row.description,
        courses: row.approved_courses || [],
        major: row.education,
        phone: row.phone,
        age: row.age,
        profile_pic: row.profile_pic,
        banner_key: row.banner_key,
        banner_url: row.banner_url,
    },
    isAdmin: row.is_admin,
    notifications: [],
    proofdoc: row.proof_doc,
    isApproved: row.is_approved,
});

const bannerTypeRowToDto = (row) => ({
    key: row.key,
    cdn_url: row.cdn_url,
});

const studentRowToAccount = (row) => ({
    id: row.id,
    email: row.email,
    password: row.password,
    student: {
        name: row.name,
        age: row.age,
        major: row.major,
        birthday: row.birthday,
        language: row.language,
        profile_pic: row.profile_pic,
    },
    isAdmin: row.is_admin,
    notifications: [],
    proofdoc: row.proof_doc,
    isApproved: row.is_approved,
});

const notificationsForUserId = async (userId) => {
    const r = await pool.query(
        "SELECT id, message, category, status FROM notifications WHERE user_id = $1 ORDER BY id ASC",
        [userId]
    );
    return r.rows;
};

const stripPasswordFromAccount = (account) => {
    if (!account || typeof account !== "object") return account;
    const { password, ...rest } = account;
    return rest;
};

const coerceTimestampOrNull = (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed === "") return null;
        return trimmed;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return new Date(value);
    }
    if (value instanceof Date) return value;
    return null;
};

const sessionRowToDto = (row) => {
    const startTime = row.start_time ? new Date(row.start_time).toISOString() : "";
    const endTime = row.end_time ? new Date(row.end_time).toISOString() : "";

    const chatMessages = Array.isArray(row.chat_messages) ? row.chat_messages : row.chat_messages || [];
    const resources = Array.isArray(row.resources) ? row.resources : row.resources || [];

    const dto = {
        id: row.id,
        student: row.student_name,
        studentId: row.student_id,
        studentProfilePic: row.student_profile_pic ?? null,
        tutor: row.tutor_name,
        tutorId: row.tutor_id,
        tutorProfilePic: row.tutor_profile_pic ?? null,
        focus: row.focus,
        profilePic: row.profile_pic,
        status: row.status,
        startTime,
        endTime,
        duration: row.duration,
        progress: row.progress,
        reportId: row.report_id,
        description: row.description,
        classLink: row.class_link,
        reason: row.reason,
        chatMessages,
        resources,
    };

    if (dto.status === "pending") {
        dto.message = row.reason ?? null;
    }

    return dto;
};

const hydrateResourceNamesForSessions = async (sessionDtos) => {
    const ids = new Set();
    for (const s of sessionDtos) {
        if (!s || !Array.isArray(s.resources)) continue;
        for (const r of s.resources) {
            if (typeof r === "number" && Number.isInteger(r)) {
                ids.add(r);
                continue;
            }
            if (typeof r === "string" && /^\d+$/.test(r)) {
                ids.add(Number(r));
            }
        }
    }

    if (ids.size === 0) return sessionDtos;

    const idArray = Array.from(ids);
    const r = await pool.query(
        "SELECT id, name FROM resources WHERE id = ANY($1::int[])",
        [idArray]
    );
    const map = new Map(r.rows.map((row) => [Number(row.id), row.name]));

    for (const s of sessionDtos) {
        if (!s || !Array.isArray(s.resources)) continue;
        s.resources = s.resources.map((val) => {
            if (typeof val === "number" && Number.isInteger(val)) {
                return map.get(val) ?? val;
            }
            if (typeof val === "string" && /^\d+$/.test(val)) {
                const n = Number(val);
                return map.get(n) ?? val;
            }
            return val;
        });
    }

    return sessionDtos;
};

app.get(
    "/api/health/db",
    asyncHandler(async (req, res) => {
        try {
            await pool.query("SELECT 1 AS ok");
            return res.json({ ok: true });
        } catch (err) {
            console.error("[db] health check failed:", err);
            return res.status(503).json({ ok: false, error: err.code || err.message });
        }
    })
);

app.post(
    "/api/ai/session-pack",
    asyncHandler(async (req, res) => {
        const { sessionId, audience } = req.body || {};

        const normalizeAudience = (value) =>
            value === "tutor" || value === "student" ? value : "student";

        const buildMockPack = ({ sessionId, audience }) => {
            const normalizedAudience = normalizeAudience(audience);
            return {
                sessionId: sessionId ?? null,
                audience: normalizedAudience,
                summary:
                    normalizedAudience === "tutor"
                        ? "Tutor view: recap of what was taught, where the student struggled, and suggested next lesson structure."
                        : "Student view: recap of what you learned, key takeaways, and what to practice next.",
                actionItems:
                    normalizedAudience === "tutor"
                        ? [
                              "Next session: start with a 3-minute review, then 2 guided problems, then 1 independent problem.",
                              "Ask the student to verbalize the decision rule before solving.",
                              "End with a quick check: 3-question mini-quiz to confirm retention.",
                          ]
                        : [
                              "Review today’s notes and rewrite them in your own words.",
                              "Do 3 practice questions and note where you got stuck.",
                              "Bring 1 follow-up question to the next session.",
                          ],
                misconceptions:
                    normalizedAudience === "tutor"
                        ? [
                              "Student may memorize steps without understanding when to apply them.",
                              "Student may skip edge-case checks; prompt them to write assumptions explicitly.",
                          ]
                        : [
                              "Mixing up definitions vs. applications.",
                              "Skipping units/edge cases when solving problems.",
                          ],
                quiz:
                    normalizedAudience === "tutor"
                        ? [
                              {
                                  question:
                                      "Tutor prompt: ask the student to explain the concept back to you in 60 seconds.",
                                  answer:
                                      "Look for a definition + when-to-use + a simple example. Correct gently if they skip the ‘when’.",
                                  hint: "If they get stuck, ask: ‘What’s the goal of this method?’",
                              },
                              {
                                  question:
                                      "Tutor check: what misconception is most likely here, and what question reveals it?",
                                  answer:
                                      "Misconception: applying the method in the wrong scenario. Reveal it by asking for the condition that triggers the method.",
                                  hint: "Ask them to state the decision rule before computing.",
                              },
                          ]
                        : [
                              {
                                  question:
                                      "In 1–2 sentences, explain the main concept practiced today.",
                                  answer:
                                      "A concise explanation that defines the concept and states when to use it.",
                                  hint: "Start with a definition, then add a simple example use-case.",
                              },
                              {
                                  question:
                                      "What’s one common mistake people make with this topic, and how do you avoid it?",
                                  answer:
                                      "They skip checking assumptions/units; avoid it by writing assumptions first and verifying at the end.",
                                  hint: "Think about what you tend to forget when rushing.",
                              },
                              {
                                  question:
                                      "Try a practice problem: outline the steps you would take to solve it.",
                                  answer:
                                      "Identify inputs/goal, choose the method, compute step-by-step, then verify the result.",
                                  hint: "Don’t compute first—plan first.",
                              },
                          ],
            };
        };

        const normalizedAudience = normalizeAudience(audience);
        const numericSessionId = Number(sessionId);
        if (!Number.isInteger(numericSessionId)) {
            return res.status(400).json({ message: "Invalid sessionId" });
        }

        const openAiKey = (process.env.OPENAI_API_KEY || "").trim();
        const shouldUseOpenAi = Boolean(openAiKey) && Boolean(OpenAI);
        if (!shouldUseOpenAi) {
            return res.json(buildMockPack({ sessionId: numericSessionId, audience: normalizedAudience }));
        }

        // Fetch session + enforce per-session AI usage limit for active sessions.
        let row = null;
        let aiCount = 0;
        try {
            const sessionResult = await pool.query(
                "SELECT id, status, focus, description, student_name, tutor_name, chat_messages, COALESCE(ai_session_pack_count, 0) AS ai_session_pack_count FROM sessions WHERE id = $1",
                [numericSessionId]
            );
            if (sessionResult.rowCount === 0) {
                return res.status(404).json({ message: "Session not found" });
            }
            row = sessionResult.rows[0];
            aiCount = Number(row.ai_session_pack_count || 0);
        } catch (err) {
            // Handle missing column / migration issues gracefully.
            if (String(err?.code) !== "42703") {
                throw err;
            }
            const sessionResult = await pool.query(
                "SELECT id, status, focus, description, student_name, tutor_name, chat_messages FROM sessions WHERE id = $1",
                [numericSessionId]
            );
            if (sessionResult.rowCount === 0) {
                return res.status(404).json({ message: "Session not found" });
            }
            row = sessionResult.rows[0];
            aiCount = Number(aiSessionPackCountFallback.get(numericSessionId) || 0);
        }

        const status = typeof row.status === "string" ? row.status.toLowerCase() : "";
        const isActive = status === "active";

        if (isActive && aiCount >= MAX_AI_SESSION_PACKS_PER_ACTIVE_SESSION) {
            return res.status(429).json({ message: "summary limit reached" });
        }

        // Increment the counter (best-effort) BEFORE calling OpenAI.
        if (isActive) {
            try {
                const updated = await pool.query(
                    "UPDATE sessions SET ai_session_pack_count = COALESCE(ai_session_pack_count, 0) + 1 WHERE id = $1 AND LOWER(status) = 'active' AND COALESCE(ai_session_pack_count, 0) < $2 RETURNING ai_session_pack_count",
                    [numericSessionId, MAX_AI_SESSION_PACKS_PER_ACTIVE_SESSION]
                );
                if (updated.rowCount === 0) {
                    return res.status(429).json({ message: "summary limit reached" });
                }
            } catch (err) {
                if (String(err?.code) === "42703") {
                    const next = (Number(aiSessionPackCountFallback.get(numericSessionId) || 0) + 1);
                    aiSessionPackCountFallback.set(numericSessionId, next);
                    if (next > MAX_AI_SESSION_PACKS_PER_ACTIVE_SESSION) {
                        return res.status(429).json({ message: "summary limit reached" });
                    }
                } else {
                    console.warn("[ai] unable to increment ai_session_pack_count; proceeding:", err?.message || err);
                }
            }
        }

        const focus = typeof row.focus === "string" ? row.focus : "";
        const description = typeof row.description === "string" ? row.description : "";
        const studentName = typeof row.student_name === "string" ? row.student_name : "Student";
        const tutorName = typeof row.tutor_name === "string" ? row.tutor_name : "Tutor";
        const chatMessages = Array.isArray(row.chat_messages)
            ? row.chat_messages
            : row.chat_messages || [];

        const buildTranscript = (messages, { maxMessages = 80, maxChars = 12000 } = {}) => {
            const safe = Array.isArray(messages) ? messages : [];
            const slice = safe.slice(Math.max(0, safe.length - maxMessages));
            const lines = slice
                .map((m) => {
                    const sender = (m && typeof m.sender === "string" ? m.sender : "").toLowerCase();
                    const raw = m && typeof m.message === "string" ? m.message : "";
                    const text = raw.replace(/\s+/g, " ").trim();
                    if (!text) return null;
                    const label = sender === "tutor" ? tutorName : sender === "student" ? studentName : "User";
                    return `${label}: ${text}`;
                })
                .filter(Boolean);

            let transcript = lines.join("\n");
            if (transcript.length > maxChars) {
                transcript = transcript.slice(transcript.length - maxChars);
            }
            return transcript;
        };

        const transcript = buildTranscript(chatMessages);

        const system =
            "You generate a tutoring 'Session Pack' as STRICT JSON only. No markdown. No backticks. Output must be valid JSON.";

        const user =
            `Audience: ${normalizedAudience}.\n` +
            `Session focus: ${focus || "(unknown)"}.\n` +
            `Session description: ${description || "(none)"}.\n\n` +
            "Chat transcript (may be truncated):\n" +
            (transcript || "(no chat messages)") +
            "\n\n" +
            "Return this exact JSON shape:\n" +
            "{\n" +
            "  \"summary\": string,\n" +
            "  \"actionItems\": string[],\n" +
            "  \"misconceptions\": string[],\n" +
            "  \"quiz\": [{\"question\": string, \"answer\": string, \"hint\": string}]\n" +
            "}\n" +
            "Make it grounded in the transcript; don't invent names/events not present.";

        const client = new OpenAI({ apiKey: openAiKey });
        const model = (process.env.OPENAI_MODEL || "gpt-4o-mini").trim();

        try {
            const completion = await client.chat.completions.create({
                model,
                temperature: 0.2,
                messages: [
                    { role: "system", content: system },
                    { role: "user", content: user },
                ],
            });

            const content = completion?.choices?.[0]?.message?.content || "";

            const stripCodeFences = (text) => {
                const t = String(text || "").trim();
                if (t.startsWith("```")) {
                    return t.replace(/^```[a-zA-Z]*\n?/, "").replace(/```\s*$/, "").trim();
                }
                return t;
            };

            const parsed = JSON.parse(stripCodeFences(content));
            const isStringArray = (v) => Array.isArray(v) && v.every((x) => typeof x === "string");
            const isQuizArray = (v) =>
                Array.isArray(v) &&
                v.every(
                    (q) =>
                        q &&
                        typeof q.question === "string" &&
                        typeof q.answer === "string" &&
                        typeof q.hint === "string"
                );

            if (
                !parsed ||
                typeof parsed.summary !== "string" ||
                !isStringArray(parsed.actionItems) ||
                !isStringArray(parsed.misconceptions) ||
                !isQuizArray(parsed.quiz)
            ) {
                console.warn("[ai] Invalid AI response shape; falling back to mock");
                return res.json(buildMockPack({ sessionId: numericSessionId, audience: normalizedAudience }));
            }

            return res.json({
                sessionId: numericSessionId,
                audience: normalizedAudience,
                summary: parsed.summary,
                actionItems: parsed.actionItems,
                misconceptions: parsed.misconceptions,
                quiz: parsed.quiz,
            });
        } catch (err) {
            console.error("[ai] generation failed; falling back to mock:", err?.message || err);
            return res.json(buildMockPack({ sessionId: numericSessionId, audience: normalizedAudience }));
        }
    })
);


app.get(
    "/api/health/user-email/:id",
    asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
        return res.status(400).json({ message: "Invalid id" });
    }

    try {
        const r = await pool.query("SELECT email FROM users WHERE id = $1", [id]);
        if (r.rowCount === 0) {
            console.log(`[db] user-email: id=${id} not found`);
            return res.status(404).json({ message: "User not found" });
        }

        console.log(`[db] user-email: id=${id} email=${r.rows[0].email}`);
        return res.json({ id, email: r.rows[0].email });
    } catch (err) {
        console.error(`[db] user-email query failed (id=${id}):`, err);
        return res.status(503).json({ message: "Database unavailable", error: err.code || err.message });
    }
})
);

// Demo login endpoints (used for recruiter-friendly one-click demo links)
app.get(
    "/api/demo/student",
    asyncHandler(async (_req, res) => {
        let id = Number(process.env.DEMO_STUDENT_ID);
        if (!Number.isInteger(id) || id <= 0) {
            const email = String(process.env.DEMO_STUDENT_EMAIL || "student1@example.com").trim();
            const idResult = await pool.query(
                "SELECT id FROM users WHERE email = $1 AND user_type = 'student'",
                [email]
            );
            if (idResult.rowCount === 0) {
                return res.status(404).json({ message: "Demo student not found" });
            }
            id = Number(idResult.rows[0].id);
        }

        const r = await pool.query(`${STUDENT_SELECT_COLUMNS} AND s.user_id = $1`, [id]);
        if (r.rowCount === 0) {
            return res.status(404).json({ message: "Demo student not found" });
        }
        const acc = studentRowToAccount(r.rows[0]);
        acc.notifications = await notificationsForUserId(id);
        return res.json(stripPasswordFromAccount(acc));
    })
);

app.get(
    "/api/demo/tutor",
    asyncHandler(async (_req, res) => {
        let id = Number(process.env.DEMO_TUTOR_ID);
        if (!Number.isInteger(id) || id <= 0) {
            const email = String(process.env.DEMO_TUTOR_EMAIL || "tutor1@example.com").trim();
            const idResult = await pool.query(
                "SELECT id FROM users WHERE email = $1 AND user_type = 'tutor'",
                [email]
            );
            if (idResult.rowCount === 0) {
                return res.status(404).json({ message: "Demo tutor not found" });
            }
            id = Number(idResult.rows[0].id);
        }

        const r = await pool.query(`${TUTOR_SELECT_COLUMNS} AND t.user_id = $1`, [id]);
        if (r.rowCount === 0) {
            return res.status(404).json({ message: "Demo tutor not found" });
        }
        const acc = tutorRowToAccount(r.rows[0]);
        acc.notifications = await notificationsForUserId(id);
        return res.json(stripPasswordFromAccount(acc));
    })
);

// Vanity demo links (one-click, no credentials exposed)
app.get("/demo/student", (_req, res) => res.redirect(302, "/login?demo=student"));
app.get("/demo/tutor", (_req, res) => res.redirect(302, "/login?demo=tutor"));









const Tables = Object.freeze({
    ACCOUNTS: accountsFilePath,
    REPORTS: reportsFilePath,
    SESSIONS: sessionsFilePath,
    UNIVERSITIES: universityFilePath,
    RESOURCES: resourcesFilePath
});

// Read data from the JSON file
const readData = (table) => {
    try {
        return JSON.parse(fs.readFileSync(table, "utf8"));
    } catch (err) {
        console.error("Error reading data:", err);
        return [];
    }
};

// Write data to the JSON file
const writeData = (data, table) => {
    try {
        fs.writeFileSync(table, JSON.stringify(data, null, 2));
    } catch (err) {
        console.error("Error writing data:", err);
    }
};

// app.put("/api/tutor/description/:id", (req, res) => {
//     const { id } = req.params;
//     const { description } = req.body;
//     const data = readData(Tables.ACCOUNTS);
//     const item = data.tutors.find((item) => item.id == id);
//     if (item) {
//         item.description = description;
//         //tried replacing but doesn't work. May need to just remove the user and add back
//         // let index = data.tutors.findIndex((tutor) => tutor.id == id);
//         data.tutors[index].description = description;
//         writeData(data, Tables.ACCOUNTS);
//         res.json(item);
//     } else {
//         res.status(404).json({ message: "Item not found" });
//     }
// });

app.get("/api/student/id", (req, res) => {
    // Use the SERIAL sequence (atomic) to avoid race conditions from MAX(id)+1.
    pool.query("SELECT nextval(pg_get_serial_sequence('users','id')) AS next_id")
        .then((r) => res.json(Number(r.rows[0].next_id)))
        .catch((err) => {
            console.error("[db] next student id query failed:", err);
            res.status(503).json({ message: "Database unavailable" });
        });
});

app.get("/api/tutor/id", (req, res) => {
    // Use the SERIAL sequence (atomic) to avoid race conditions from MAX(id)+1.
    pool.query("SELECT nextval(pg_get_serial_sequence('users','id')) AS next_id")
        .then((r) => res.json(Number(r.rows[0].next_id)))
        .catch((err) => {
            console.error("[db] next tutor id query failed:", err);
            res.status(503).json({ message: "Database unavailable" });
        });
});

// Get all items for tutor accounts
app.get(
    "/api/tutor",
    asyncHandler(async (req, res) => {
        const r = await pool.query(`${TUTOR_SELECT_COLUMNS} ORDER BY t.user_id ASC`);
        return res.json(r.rows.map(tutorRowToAccount));
    })
);

// Get all available banner types
app.get(
    "/api/banner-types",
    asyncHandler(async (req, res) => {
        const r = await pool.query("SELECT key, cdn_url FROM banner_types ORDER BY key ASC");
        return res.json(r.rows.map(bannerTypeRowToDto));
    })
);

app.get(
    "/api/tutor/:id",
    asyncHandler(async (req, res) => {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) {
            return res.status(400).json({ message: "Invalid id" });
        }

        const r = await pool.query(`${TUTOR_SELECT_COLUMNS} AND t.user_id = $1`, [id]);
        if (r.rowCount === 0) {
            return res.status(404).json({ message: "Item not found" });
        }

        const acc = tutorRowToAccount(r.rows[0]);
        acc.notifications = await notificationsForUserId(id);
        return res.json(acc);
    })
);

// Add a new item to tutor accounts
app.post(
    "/api/tutor",
    asyncHandler(async (req, res) => {
        const body = req.body || {};
        const tutor = body.tutor || {};

        const id = Number(body.id);
        const hasClientId = Number.isInteger(id);
        const email = body.email;
        const password = body.password;
        const isAdmin = Boolean(body.isAdmin);
        const isApproved = Boolean(body.isApproved);
        const proofdoc = body.proofdoc ?? null;

        const name = tutor.name;
        const age = tutor.age ?? null;
        const birthday = typeof tutor.birthday === "string" && tutor.birthday.trim() === "" ? null : tutor.birthday ?? null;
        const language = tutor.language ?? null;
        const education = tutor.education ?? tutor.major ?? null;
        const phone = tutor.phone ?? null;
        const description = tutor.description ?? null;
        const profile_pic = tutor.profile_pic ?? tutor.profilePic ?? null;
        const banner_key = tutor.banner_key ?? tutor.bannerKey ?? 'banner';
        const approved_courses = Array.isArray(tutor.courses) ? tutor.courses : [];
        const ratingRaw = tutor.rating ?? 0;
        const costRaw = tutor.costPerHour ?? tutor.cost_per_hour ?? tutor.cost ?? 0;
        const rating = ratingRaw === null || ratingRaw === "" ? 0 : Number(ratingRaw);
        const costPerHour = costRaw === null || costRaw === "" ? 0 : Number(costRaw);

        if (typeof email !== "string" || email.trim() === "") {
            return res.status(400).json({ message: "Invalid email" });
        }
        if (typeof password !== "string") {
            return res.status(400).json({ message: "Invalid password" });
        }
        if (typeof name !== "string" || name.trim() === "") {
            return res.status(400).json({ message: "Invalid tutor name" });
        }
        if (banner_key !== null && banner_key !== undefined && typeof banner_key !== 'string') {
            return res.status(400).json({ message: "Invalid banner_key" });
        }
        if (!Array.isArray(approved_courses) || !approved_courses.every((c) => typeof c === "string")) {
            return res.status(400).json({ message: "Invalid courses" });
        }
        if (!Number.isFinite(rating) || rating < 0) {
            return res.status(400).json({ message: "Invalid rating" });
        }
        if (!Number.isFinite(costPerHour) || costPerHour < 0) {
            return res.status(400).json({ message: "Invalid costPerHour" });
        }

        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            let createdUserId;
            if (hasClientId) {
                const u = await client.query(
                    "INSERT INTO users (id, email, password, is_admin, is_approved, proof_doc, user_type) VALUES ($1, $2, $3, $4, $5, $6, 'tutor') RETURNING id",
                    [id, email, password, isAdmin, isApproved, proofdoc]
                );
                createdUserId = u.rows[0].id;
            } else {
                const u = await client.query(
                    "INSERT INTO users (email, password, is_admin, is_approved, proof_doc, user_type) VALUES ($1, $2, $3, $4, $5, 'tutor') RETURNING id",
                    [email, password, isAdmin, isApproved, proofdoc]
                );
                createdUserId = u.rows[0].id;
            }

            // Keep the users.id sequence aligned even if callers insert explicit ids.
            await client.query(
                "SELECT setval(pg_get_serial_sequence('users','id'), (SELECT COALESCE(MAX(id), 1) FROM users), true)"
            );

            await client.query(
                "INSERT INTO tutors (user_id, name, age, birthday, language, education, phone, description, profile_pic, banner_key, approved_courses, rating, \"costPerHour\") VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::text[], $12, $13)",
                [
                    createdUserId,
                    name,
                    age,
                    birthday,
                    language,
                    education,
                    phone,
                    description,
                    profile_pic,
                    banner_key,
                    approved_courses,
                    rating,
                    costPerHour,
                ]
            );

            await client.query("COMMIT");

            const r = await pool.query(`${TUTOR_SELECT_COLUMNS} AND t.user_id = $1`, [createdUserId]);
            const acc = tutorRowToAccount(r.rows[0]);
            acc.notifications = await notificationsForUserId(createdUserId);
            return res.status(201).json(acc);
        } catch (err) {
            await client.query("ROLLBACK");
            if (err && err.code === "23505") {
                if (err.constraint === "users_email_key") {
                    return res.status(409).json({ message: "Email already exists" });
                }
                if (err.constraint === "users_pkey") {
                    return res.status(409).json({ message: "User id already exists" });
                }
                return res.status(409).json({ message: "Duplicate key" });
            }
            throw err;
        } finally {
            client.release();
        }
    })
);

// Update tutor banner selection
app.put(
    "/api/tutor/banner/:id",
    asyncHandler(async (req, res) => {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) {
            return res.status(400).json({ message: "Invalid id" });
        }

        const body = req.body || {};
        const banner_key = body.banner_key ?? body.bannerKey;
        if (typeof banner_key !== 'string' || banner_key.trim() === '') {
            return res.status(400).json({ message: "Invalid banner_key" });
        }

        const exists = await pool.query("SELECT 1 FROM banner_types WHERE key = $1", [banner_key]);
        if (exists.rowCount === 0) {
            return res.status(400).json({ message: "Unknown banner_key" });
        }

        const updated = await pool.query(
            "UPDATE tutors SET banner_key = $2 WHERE user_id = $1 RETURNING user_id",
            [id, banner_key]
        );
        if (updated.rowCount === 0) {
            return res.status(404).json({ message: "Item not found" });
        }

        const r = await pool.query(`${TUTOR_SELECT_COLUMNS} AND t.user_id = $1`, [id]);
        const acc = tutorRowToAccount(r.rows[0]);
        acc.notifications = await notificationsForUserId(id);
        return res.json(acc);
    })
);

// Delete an account item by ID
app.delete(
    "/api/tutor/:id",
    asyncHandler(async (req, res) => {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) {
            return res.status(400).json({ message: "Invalid id" });
        }

        const del = await pool.query(
            "DELETE FROM users WHERE id = $1 AND user_type = 'tutor' RETURNING id",
            [id]
        );
        if (del.rowCount === 0) {
            return res.status(404).json({ message: "Item not found" });
        }
        return res.json({ message: `Item with ID ${id} deleted` });
    })
);
// Get all items for student accounts
app.get(
    "/api/student",
    asyncHandler(async (req, res) => {
        const r = await pool.query(`${STUDENT_SELECT_COLUMNS} ORDER BY s.user_id ASC`);
        return res.json(r.rows.map(studentRowToAccount));
    })
);

app.get(
    "/api/student/:id",
    asyncHandler(async (req, res) => {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) {
            return res.status(400).json({ message: "Invalid id" });
        }

        const r = await pool.query(`${STUDENT_SELECT_COLUMNS} AND s.user_id = $1`, [id]);
        if (r.rowCount === 0) {
            return res.status(404).json({ message: "Item not found" });
        }

        const acc = studentRowToAccount(r.rows[0]);
        acc.notifications = await notificationsForUserId(id);
        return res.json(acc);
    })
);


// Add a new item to student accounts
app.post(
    "/api/student",
    asyncHandler(async (req, res) => {
        const body = req.body || {};
        const student = body.student || {};

        const id = Number(body.id);
        const hasClientId = Number.isInteger(id);
        const email = body.email;
        const password = body.password;
        const isAdmin = Boolean(body.isAdmin);
        const isApproved = Boolean(body.isApproved);
        const proofdoc = body.proofdoc ?? null;

        const name = student.name;
        const age = student.age ?? null;
        const major = student.major ?? null;
        const profile_pic = student.profile_pic ?? student.profilePic ?? null;
        const birthday = typeof student.birthday === "string" && student.birthday.trim() === "" ? null : student.birthday ?? null;
        const language = student.language ?? null;

        if (typeof email !== "string" || email.trim() === "") {
            return res.status(400).json({ message: "Invalid email" });
        }
        if (typeof password !== "string") {
            return res.status(400).json({ message: "Invalid password" });
        }
        if (typeof name !== "string" || name.trim() === "") {
            return res.status(400).json({ message: "Invalid student name" });
        }

        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            let createdUserId;
            if (hasClientId) {
                const u = await client.query(
                    "INSERT INTO users (id, email, password, is_admin, is_approved, proof_doc, user_type) VALUES ($1, $2, $3, $4, $5, $6, 'student') RETURNING id",
                    [id, email, password, isAdmin, isApproved, proofdoc]
                );
                createdUserId = u.rows[0].id;
            } else {
                const u = await client.query(
                    "INSERT INTO users (email, password, is_admin, is_approved, proof_doc, user_type) VALUES ($1, $2, $3, $4, $5, 'student') RETURNING id",
                    [email, password, isAdmin, isApproved, proofdoc]
                );
                createdUserId = u.rows[0].id;
            }

            // Keep the users.id sequence aligned even if callers insert explicit ids.
            await client.query(
                "SELECT setval(pg_get_serial_sequence('users','id'), (SELECT COALESCE(MAX(id), 1) FROM users), true)"
            );

            await client.query(
                "INSERT INTO students (user_id, name, age, major, profile_pic, birthday, language) VALUES ($1, $2, $3, $4, $5, $6, $7)",
                [createdUserId, name, age, major, profile_pic, birthday, language]
            );

            const notificationRows = Array.isArray(body.notifications) ? body.notifications : [];
            for (const n of notificationRows) {
                if (!n || typeof n.message !== "string") continue;
                await client.query(
                    "INSERT INTO notifications (user_id, message, category) VALUES ($1, $2, $3)",
                    [createdUserId, n.message, typeof n.category === "string" ? n.category : null]
                );
            }

            await client.query("COMMIT");

            const r = await pool.query(`${STUDENT_SELECT_COLUMNS} AND s.user_id = $1`, [createdUserId]);
            const acc = studentRowToAccount(r.rows[0]);
            acc.notifications = await notificationsForUserId(createdUserId);
            return res.status(201).json(acc);
        } catch (err) {
            await client.query("ROLLBACK");
            if (err && err.code === "23505") {
                if (err.constraint === "users_email_key") {
                    return res.status(409).json({ message: "Email already exists" });
                }
                if (err.constraint === "users_pkey") {
                    return res.status(409).json({ message: "User id already exists" });
                }
                return res.status(409).json({ message: "Duplicate key" });
            }
            throw err;
        } finally {
            client.release();
        }
    })
);

// Delete a student account item by ID
app.delete(
    "/api/student/:id",
    asyncHandler(async (req, res) => {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) {
            return res.status(400).json({ message: "Invalid id" });
        }

        const del = await pool.query(
            "DELETE FROM users WHERE id = $1 AND user_type = 'student' RETURNING id",
            [id]
        );
        if (del.rowCount === 0) {
            return res.status(404).json({ message: "Item not found" });
        }
        return res.json({ message: `Item with ID ${id} deleted` });
    })
);

app.delete(
    "/api/student/:id/notification/:nid",
    asyncHandler(async (req, res) => {
        const id = Number(req.params.id);
        const nid = Number(req.params.nid);
        if (!Number.isInteger(id) || !Number.isInteger(nid)) {
            return res.status(400).json({ message: "Invalid id" });
        }

        const del = await pool.query(
            "DELETE FROM notifications WHERE id = $2 AND user_id = $1 RETURNING id",
            [id, nid]
        );
        if (del.rowCount === 0) {
            return res.status(404).json({ message: "Item not found" });
        }

        const remaining = await notificationsForUserId(id);
        return res.json(remaining);
    })
);

// app.put("/api/tutor/description/:id", (req, res) => {
//     const { id } = req.params;
//     const { description } = req.body;
//     const data = readData(Tables.ACCOUNTS);
//     const item = data.tutors.find((item) => item.id == id);
//     if (item) {
//         item.description = description;
//         writeData(data, Tables.ACCOUNTS);
//         res.json(item);
//     } else {
//         res.status(404).json({ message: "Item not found" });
//     }
// });

app.put(
    "/api/tutor/description/:id",
    asyncHandler(async (req, res) => {
        const id = Number(req.params.id);
        const { description } = req.body || {};

        if (!Number.isInteger(id)) {
            return res.status(400).json({ message: "Invalid id" });
        }
        if (typeof description !== "string") {
            return res.status(400).json({ message: "Invalid description" });
        }

        const upd = await pool.query(
            "UPDATE tutors SET description = $2 WHERE user_id = $1 RETURNING user_id",
            [id, description]
        );
        if (upd.rowCount === 0) {
            return res.status(404).json({ message: "Item not found" });
        }

        const r = await pool.query(`${TUTOR_SELECT_COLUMNS} AND t.user_id = $1`, [id]);
        const acc = tutorRowToAccount(r.rows[0]);
        acc.notifications = await notificationsForUserId(id);
        return res.json(acc);
    })
);

app.put(
    "/api/student/password/:id",
    asyncHandler(async (req, res) => {
        const id = Number(req.params.id);
        const { password } = req.body || {};

        if (!Number.isInteger(id)) {
            return res.status(400).json({ message: "Invalid id" });
        }
        if (typeof password !== "string") {
            return res.status(400).json({ message: "Invalid password" });
        }

        const upd = await pool.query(
            "UPDATE users SET password = $2 WHERE id = $1 AND user_type = 'student' RETURNING id",
            [id, password]
        );
        if (upd.rowCount === 0) {
            return res.status(404).json({ message: "Item not found" });
        }

        const r = await pool.query(`${STUDENT_SELECT_COLUMNS} AND s.user_id = $1`, [id]);
        const acc = studentRowToAccount(r.rows[0]);
        acc.notifications = await notificationsForUserId(id);
        return res.json(acc);
    })
);

app.put("/api/tutor/rating/:id", (req, res) => {
    const { id } = req.params;
    const { rating } = req.body;
    const data = readData(Tables.ACCOUNTS);
    const item = data.tutors.find((item) => item.id == id);
    if (item) {
        item.rating = rating;
        writeData(data, Tables.ACCOUNTS);
        res.json(item);
    } else {
        res.status(404).json({ message: "Item not found" });
    }
});

app.put(
    "/api/tutor/courses/:id",
    asyncHandler(async (req, res) => {
        const id = Number(req.params.id);
        const { courses } = req.body || {};

        if (!Number.isInteger(id)) {
            return res.status(400).json({ message: "Invalid id" });
        }
        if (!Array.isArray(courses) || !courses.every((c) => typeof c === "string")) {
            return res.status(400).json({ message: "Invalid courses" });
        }

        const upd = await pool.query(
            "UPDATE tutors SET approved_courses = COALESCE(approved_courses, '{}'::text[]) || $2::text[] WHERE user_id = $1 RETURNING user_id",
            [id, courses]
        );
        if (upd.rowCount === 0) {
            return res.status(404).json({ message: "Item not found" });
        }

        const r = await pool.query(`${TUTOR_SELECT_COLUMNS} AND t.user_id = $1`, [id]);
        const acc = tutorRowToAccount(r.rows[0]);
        acc.notifications = await notificationsForUserId(id);
        return res.json(acc);
    })
);

//TABLE UNIVERSITY

app.get("/api/university", (req, res) => {
    const data = readData(Tables.UNIVERSITIES);
    res.json(data);
});

app.get("/api/university/:name", (req, res) => {
    const { name } = req.params;
    const data = readData(Tables.UNIVERSITIES);
    const item = data.find((item) => item.name.toLowerCase() === name.toLowerCase());
    if (item) {
        res.json(item);
    } else {
        res.status(404).json({ message: "Item not found" });
    }
});

//SESSIONS

const fetchSessionsWhere = async (whereSql, params) => {
    const r = await pool.query(
        `
        SELECT
            se.*,
            t.profile_pic AS tutor_profile_pic,
            s.profile_pic AS student_profile_pic
        FROM sessions se
        LEFT JOIN tutors t ON t.user_id = se.tutor_id
        LEFT JOIN students s ON s.user_id = se.student_id
        ${whereSql}
        ORDER BY se.id ASC
        `,
        params
    );
    let dtos = r.rows.map(sessionRowToDto);
    dtos = await hydrateResourceNamesForSessions(dtos);
    return dtos;
};

const parseSessionBodyToDb = (body) => {
    const b = body || {};

    const toIntOrNull = (value) => {
        if (value === null || value === undefined) return null;
        if (typeof value === "string" && value.trim() === "") return null;
        const n = Number(value);
        return Number.isInteger(n) ? n : null;
    };

    const toNumberOrNull = (value) => {
        if (value === null || value === undefined) return null;
        if (typeof value === "string" && value.trim() === "") return null;
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    };

    const studentName = b.student ?? b.student_name ?? null;
    const tutorName = b.tutor ?? b.tutor_name ?? null;
    const studentId = toIntOrNull(b.studentId ?? b.student_id);
    const tutorId = toIntOrNull(b.tutorId ?? b.tutor_id);

    const focus = b.focus ?? null;
    const profilePic = b.profilePic ?? b.profile_pic ?? null;
    const status = b.status ?? null;

    // Only set times once accepted. Pending/declined should not set them.
    // Active sessions: set start_time, but DO NOT set end_time until the course is ended.
    const shouldHaveTimes = status !== "pending" && status !== "declined";
    const startTime = shouldHaveTimes ? coerceTimestampOrNull(b.startTime ?? b.start_time) : null;
    const endTime =
        shouldHaveTimes && status !== "active" ? coerceTimestampOrNull(b.endTime ?? b.end_time) : null;

    const duration = toNumberOrNull(b.duration);
    const progress = toNumberOrNull(b.progress);
    const reportId = toIntOrNull(b.reportId ?? b.report_id);

    const classLink = b.classLink ?? b.class_link ?? null;
    // Pending connection-request message is stored in reason
    const reason = b.reason ?? b.message ?? null;

    const description = b.description ?? null;
    const chatMessages = Array.isArray(b.chatMessages) ? b.chatMessages : [];
    const resources = Array.isArray(b.resources) ? b.resources.map((x) => String(x)) : [];

    return {
        studentId,
        tutorId,
        studentName,
        tutorName,
        focus,
        profilePic,
        status,
        startTime,
        endTime,
        duration,
        progress,
        reportId,
        description,
        classLink,
        reason,
        chatMessages,
        resources,
    };
};

app.get(
    "/api/session",
    asyncHandler(async (req, res) => {
        const sessions = await fetchSessionsWhere("", []);
        return res.json(sessions);
    })
);

app.get(
    "/api/session/id",
    asyncHandler(async (req, res) => {
        const r = await pool.query("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM sessions");
        return res.json(Number(r.rows[0].next_id));
    })
);

app.get(
    "/api/session/active/:name",
    asyncHandler(async (req, res) => {
        const { name } = req.params;
        const sessions = await fetchSessionsWhere(
            "WHERE status = 'active' AND student_name = $1",
            [name]
        );
        return res.json(sessions);
    })
);

app.get(
    "/api/session/tutor/active/:name",
    asyncHandler(async (req, res) => {
        const { name } = req.params;
        const sessions = await fetchSessionsWhere(
            "WHERE status = 'active' AND tutor_name = $1",
            [name]
        );
        return res.json(sessions);
    })
);

app.get(
    "/api/session/pending/:name",
    asyncHandler(async (req, res) => {
        const { name } = req.params;
        const sessions = await fetchSessionsWhere(
            "WHERE status = 'pending' AND student_name = $1",
            [name]
        );
        return res.json(sessions);
    })
);

app.get(
    "/api/session/tutor/pending/:name",
    asyncHandler(async (req, res) => {
        const { name } = req.params;
        const sessions = await fetchSessionsWhere(
            "WHERE status = 'pending' AND tutor_name = $1",
            [name]
        );
        return res.json(sessions);
    })
);

app.get(
    "/api/session/canceled/:name",
    asyncHandler(async (req, res) => {
        const { name } = req.params;
        const sessions = await fetchSessionsWhere(
            "WHERE status = 'declined' AND student_name = $1",
            [name]
        );
        return res.json(sessions);
    })
);

app.get(
    "/api/session/tutor/canceled/:name",
    asyncHandler(async (req, res) => {
        const { name } = req.params;
        const sessions = await fetchSessionsWhere(
            "WHERE status = 'declined' AND tutor_name = $1",
            [name]
        );
        return res.json(sessions);
    })
);

app.get(
    "/api/session/:id",
    asyncHandler(async (req, res) => {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) {
            return res.status(400).json({ message: "Invalid id" });
        }

        const r = await pool.query(
            `
            SELECT
                se.*,
                t.profile_pic AS tutor_profile_pic,
                s.profile_pic AS student_profile_pic
            FROM sessions se
            LEFT JOIN tutors t ON t.user_id = se.tutor_id
            LEFT JOIN students s ON s.user_id = se.student_id
            WHERE se.id = $1
            `,
            [id]
        );
        if (r.rowCount === 0) {
            return res.status(404).json({ message: "Item not found" });
        }

        let dto = sessionRowToDto(r.rows[0]);
        const hydrated = await hydrateResourceNamesForSessions([dto]);
        dto = hydrated[0];
        return res.json(dto);
    })
);

app.delete(
    "/api/session/:id",
    asyncHandler(async (req, res) => {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) {
            return res.status(400).json({ message: "Invalid id" });
        }

        // End course: do not delete. Mark completed and set end_time.
        const upd = await pool.query(
            "UPDATE sessions SET status = 'completed', end_time = NOW() WHERE id = $1 RETURNING *",
            [id]
        );
        if (upd.rowCount === 0) {
            return res.status(404).json({ message: "Item not found" });
        }

        const r = await pool.query(
            `
            SELECT
                se.*,
                t.profile_pic AS tutor_profile_pic,
                s.profile_pic AS student_profile_pic
            FROM sessions se
            LEFT JOIN tutors t ON t.user_id = se.tutor_id
            LEFT JOIN students s ON s.user_id = se.student_id
            WHERE se.id = $1
            `,
            [id]
        );

        let dto = sessionRowToDto(r.rows[0]);
        const hydrated = await hydrateResourceNamesForSessions([dto]);
        dto = hydrated[0];
        return res.json(dto);
    })
);

app.get(
    "/api/session/tutor/:id",
    asyncHandler(async (req, res) => {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) {
            return res.status(400).json({ message: "Invalid id" });
        }
        const sessions = await fetchSessionsWhere("WHERE tutor_id = $1", [id]);
        return res.json(sessions);
    })
);

app.get(
    "/api/session/student/:id",
    asyncHandler(async (req, res) => {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) {
            return res.status(400).json({ message: "Invalid id" });
        }
        const sessions = await fetchSessionsWhere("WHERE student_id = $1", [id]);
        return res.json(sessions);
    })
);

app.get(
    "/api/session/chat/:id",
    asyncHandler(async (req, res) => {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) {
            return res.status(400).json({ message: "Invalid id" });
        }

        const r = await pool.query(
            "SELECT chat_messages FROM sessions WHERE id = $1",
            [id]
        );
        if (r.rowCount === 0) {
            return res.status(404).json({ message: "Item not found" });
        }

        const MAX_CHAT_MESSAGES = 6;
        const chat = Array.isArray(r.rows[0].chat_messages)
            ? r.rows[0].chat_messages
            : r.rows[0].chat_messages || [];
        return res.json(chat.slice(-MAX_CHAT_MESSAGES));
    })
);

app.post(
    "/api/session/chat/:id",
    asyncHandler(async (req, res) => {
        const id = Number(req.params.id);
        const { sender, message } = req.body || {};

        const MAX_CHAT_MESSAGES = 6;

        if (!Number.isInteger(id)) {
            return res.status(400).json({ message: "Invalid id" });
        }
        if (typeof sender !== "string" || typeof message !== "string") {
            return res.status(400).json({ message: "Invalid chat message" });
        }

        const payload = JSON.stringify([{ sender, message }]);

        // Atomic: only append if the current chat history has < MAX_CHAT_MESSAGES
        const upd = await pool.query(
            "UPDATE sessions SET chat_messages = COALESCE(chat_messages, '[]'::jsonb) || $2::jsonb WHERE id = $1 AND jsonb_array_length(COALESCE(chat_messages, '[]'::jsonb)) < $3 RETURNING chat_messages",
            [id, payload, MAX_CHAT_MESSAGES]
        );

        if (upd.rowCount === 0) {
            // Distinguish not-found from limit-reached
            const check = await pool.query(
                "SELECT jsonb_array_length(COALESCE(chat_messages, '[]'::jsonb)) AS n FROM sessions WHERE id = $1",
                [id]
            );
            if (check.rowCount === 0) {
                return res.status(404).json({ message: "Item not found" });
            }
            const n = Number(check.rows[0].n || 0);
            if (n >= MAX_CHAT_MESSAGES) {
                return res.status(429).json({ message: "Limit of 6 messages in chat history" });
            }
            return res.status(503).json({ message: "Unable to send chat message" });
        }

        const chat = Array.isArray(upd.rows[0].chat_messages)
            ? upd.rows[0].chat_messages
            : upd.rows[0].chat_messages || [];
        return res.json(chat);
    })
);

const insertSession = async (explicitId, body) => {
    const db = parseSessionBodyToDb(body);
    const id = explicitId ?? (Number.isInteger(Number(body?.id)) ? Number(body.id) : null);

    if (db.status === "active") {
        db.startTime = db.startTime ?? new Date().toISOString();
        db.endTime = null;
    }

    if (id !== null && !Number.isInteger(id)) {
        return { status: 400, json: { message: "Invalid id" } };
    }

    // Prevent duplicate pending sessions (legacy behavior)
    if (db.status === "pending") {
        if (db.studentId !== null && db.tutorId !== null) {
            const ex = await pool.query(
                "SELECT 1 FROM sessions WHERE status = 'pending' AND student_id = $1 AND tutor_id = $2 LIMIT 1",
                [db.studentId, db.tutorId]
            );
            if (ex.rowCount > 0) {
                return {
                    status: 400,
                    json: { message: "A pending session already exists between this student and tutor." },
                };
            }
        } else if (db.studentName && db.tutorName) {
            const ex = await pool.query(
                "SELECT 1 FROM sessions WHERE status = 'pending' AND student_name = $1 AND tutor_name = $2 LIMIT 1",
                [db.studentName, db.tutorName]
            );
            if (ex.rowCount > 0) {
                return {
                    status: 400,
                    json: { message: "A pending session already exists between this student and tutor." },
                };
            }
        }
    }

    const chatJson = JSON.stringify(db.chatMessages);

    let r;
    if (id !== null) {
        r = await pool.query(
            "INSERT INTO sessions (id, student_id, tutor_id, student_name, tutor_name, focus, profile_pic, status, start_time, end_time, duration, progress, report_id, description, class_link, reason, chat_messages, resources) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18::text[]) RETURNING *",
            [
                id,
                db.studentId,
                db.tutorId,
                db.studentName,
                db.tutorName,
                db.focus,
                db.profilePic,
                db.status,
                db.startTime,
                db.endTime,
                db.duration,
                db.progress,
                db.reportId,
                db.description,
                db.classLink,
                db.reason,
                chatJson,
                db.resources,
            ]
        );
    } else {
        r = await pool.query(
            "INSERT INTO sessions (student_id, tutor_id, student_name, tutor_name, focus, profile_pic, status, start_time, end_time, duration, progress, report_id, description, class_link, reason, chat_messages, resources) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::text[]) RETURNING *",
            [
                db.studentId,
                db.tutorId,
                db.studentName,
                db.tutorName,
                db.focus,
                db.profilePic,
                db.status,
                db.startTime,
                db.endTime,
                db.duration,
                db.progress,
                db.reportId,
                db.description,
                db.classLink,
                db.reason,
                chatJson,
                db.resources,
            ]
        );
    }

    let dto = sessionRowToDto(r.rows[0]);
    const hydrated = await hydrateResourceNamesForSessions([dto]);
    dto = hydrated[0];
    return { status: 201, json: dto };
};

app.post(
    "/api/session",
    asyncHandler(async (req, res) => {
        const result = await insertSession(null, req.body);
        return res.status(result.status).json(result.json);
    })
);

// Legacy client behavior: POST /api/session/:id
app.post(
    "/api/session/:id",
    asyncHandler(async (req, res) => {
        const id = Number(req.params.id);
        const result = await insertSession(id, req.body);
        return res.status(result.status).json(result.json);
    })
);

app.post(
    "/api/session/update/:id",
    asyncHandler(async (req, res) => {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) {
            return res.status(400).json({ message: "Invalid id" });
        }

        const existing = await pool.query("SELECT * FROM sessions WHERE id = $1", [id]);
        if (existing.rowCount === 0) {
            return res.status(404).json({ message: "Item not found" });
        }

        const body = req.body || {};
        const patch = parseSessionBodyToDb(body);

        const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
        const useDescription = has("description") || has("message");
        const useChat = has("chatMessages") || has("chat_messages");
        const useResources = has("resources");
        const useStart = has("startTime") || has("start_time");
        const useEnd = has("endTime") || has("end_time");
        const useReport = has("reportId") || has("report_id");

        const merged = {
            student_id: (has("studentId") || has("student_id")) ? patch.studentId : existing.rows[0].student_id,
            tutor_id: (has("tutorId") || has("tutor_id")) ? patch.tutorId : existing.rows[0].tutor_id,
            student_name: (has("student") || has("student_name")) ? patch.studentName : existing.rows[0].student_name,
            tutor_name: (has("tutor") || has("tutor_name")) ? patch.tutorName : existing.rows[0].tutor_name,
            focus: has("focus") ? patch.focus : existing.rows[0].focus,
            profile_pic: (has("profilePic") || has("profile_pic")) ? patch.profilePic : existing.rows[0].profile_pic,
            status: has("status") ? patch.status : existing.rows[0].status,
            start_time: useStart ? patch.startTime : existing.rows[0].start_time,
            end_time: useEnd ? patch.endTime : existing.rows[0].end_time,
            duration: has("duration") ? patch.duration : existing.rows[0].duration,
            progress: has("progress") ? patch.progress : existing.rows[0].progress,
            report_id: useReport ? patch.reportId : existing.rows[0].report_id,
            description: useDescription ? patch.description : existing.rows[0].description,
            class_link: (has("classLink") || has("class_link")) ? patch.classLink : existing.rows[0].class_link,
            reason: (has("reason") || has("message")) ? patch.reason : existing.rows[0].reason,
            chat_messages: useChat ? patch.chatMessages : (existing.rows[0].chat_messages || []),
            resources: useResources ? patch.resources : (existing.rows[0].resources || []),
        };

        // Enforce a rejection message when declining a pending connection request.
        const previousStatus = existing.rows[0].status;
        if (previousStatus === "pending" && merged.status === "declined") {
            const reasonText = typeof merged.reason === "string" ? merged.reason.trim() : "";
            if (!reasonText) {
                return res.status(400).json({
                    message: "A reason is required to decline a connection request.",
                });
            }
            merged.reason = reasonText;
        }

        if (merged.status === "pending" || merged.status === "declined") {
            merged.start_time = null;
            merged.end_time = null;
        }

        // When accepting a connection request (active), keep/set start_time but force end_time NULL.
        if (merged.status === "active") {
            merged.start_time = merged.start_time ?? new Date().toISOString();
            merged.end_time = null;
        }

        const upd = await pool.query(
            "UPDATE sessions SET student_id=$2, tutor_id=$3, student_name=$4, tutor_name=$5, focus=$6, profile_pic=$7, status=$8, start_time=$9, end_time=$10, duration=$11, progress=$12, report_id=$13, description=$14, class_link=$15, reason=$16, chat_messages=$17::jsonb, resources=$18::text[] WHERE id=$1 RETURNING *",
            [
                id,
                merged.student_id,
                merged.tutor_id,
                merged.student_name,
                merged.tutor_name,
                merged.focus,
                merged.profile_pic,
                merged.status,
                merged.start_time,
                merged.end_time,
                merged.duration,
                merged.progress,
                merged.report_id,
                merged.description,
                merged.class_link,
                merged.reason,
                JSON.stringify(merged.chat_messages),
                Array.isArray(merged.resources) ? merged.resources.map((x) => String(x)) : [],
            ]
        );

        let dto = sessionRowToDto(upd.rows[0]);
        const hydrated = await hydrateResourceNamesForSessions([dto]);
        dto = hydrated[0];
        return res.json(dto);
    })
);

app.get("/api/reports/:id", (req, res) => {
    const { id } = req.params;
    const data = readData(Tables.REPORTS);
    const item = data.reports.find((item) => item.id == id);
    if (item) {
        res.json(item);
    } else {
        res.status(404).json({ message: "Item not found" });
    }
});

app.get("/api/reports/:tutorId", (req, res) => {
    const { tutorId } = req.params;
    const data = readData(Tables.REPORTS);
    const items = data.reports.filter((item) => item.tutorId == tutorId);
    if (items) {
        res.json(items);
    } else {
        res.status(404).json({ message: "Item not found" });
    }
});

app.post("/api/reports", (req, res) => {
    const newItem = req.body;
    const data = readData(Tables.REPORTS);
    data.reports.push(newItem);
    writeData(data, Tables.REPORTS);
    res.status(201).json(newItem);
});

// Centralized error handler (prevents unhandled async errors from crashing the process)
app.use((err, req, res, next) => {
    console.error("[http] Unhandled error:", err);
    if (res.headersSent) return next(err);
    return res.status(500).json({ message: "Internal server error" });
});

// serve react app
app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/build", "index.html"));
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

function getResourcesFromId(id) {
    const data = readData(Tables.RESOURCES);
    const resource = data.resources.find(resource => resource.id === id);
    return resource.name;
}

function writeResources() {
    const data = readData(Tables.SESSIONS);
    data.sessions.forEach(session => {
        if (session.resources) {
            session.resources = session.resources.map(resource =>
                typeof resource === 'number' ? getResourcesFromId(resource) : resource
            );
        }
    });
    writeData(data, Tables.SESSIONS);
}
