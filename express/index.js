// require('dotenv').config(); Don't need this since using systemd
const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();
const PORT = Number(process.env.PORT) || 3000;

const asyncHandler = (handler) => (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);

app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend/build")));


const accountsFilePath = path.join(__dirname, "api/accounts.json");
const reportsFilePath = path.join(__dirname, "api/reports.json");
const sessionsFilePath = path.join(__dirname, "api/sessions.json");
const resourcesFilePath = path.join(__dirname, "api/resources.json");
const universityFilePath = path.join(__dirname, "api/universities.json");

// const DATABASE_URL = process.env.DATABASE_URL;

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // If you use sslmode=require or DO-managed DB, you may need ssl:
  // ssl: { rejectUnauthorized: false },
});

pool.on("error", (err) => {
    console.error("[db] Pool error:", err);
});

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
        t.major,
        t.phone,
        t.description,
        t.profile_pic,
        t.approved_courses
    FROM tutors t
    JOIN users u ON u.id = t.user_id
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
        rating: 0,
        education: row.major || "",
        costPerHour: 0,
        birthday: row.birthday,
        language: row.language,
        description: row.description,
        courses: row.approved_courses || [],
        major: row.major,
        phone: row.phone,
        age: row.age,
        profile_pic: row.profile_pic,
    },
    isAdmin: row.is_admin,
    notifications: [],
    proofdoc: row.proof_doc,
    isApproved: row.is_approved,
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
    },
    isAdmin: row.is_admin,
    notifications: [],
    proofdoc: row.proof_doc,
    isApproved: row.is_approved,
});

const notificationsForUserId = async (userId) => {
    const r = await pool.query(
        "SELECT id, message, category FROM notifications WHERE user_id = $1 ORDER BY id ASC",
        [userId]
    );
    return r.rows;
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
    pool.query("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM users")
        .then((r) => res.json(Number(r.rows[0].next_id)))
        .catch((err) => {
            console.error("[db] next student id query failed:", err);
            res.status(503).json({ message: "Database unavailable" });
        });
});

app.get("/api/tutor/id", (req, res) => {
    pool.query("SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM users")
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
        const major = tutor.major ?? null;
        const phone = tutor.phone ?? null;
        const description = tutor.description ?? null;
        const profile_pic = tutor.profile_pic ?? tutor.profilePic ?? null;
        const approved_courses = Array.isArray(tutor.courses) ? tutor.courses : [];

        if (typeof email !== "string" || email.trim() === "") {
            return res.status(400).json({ message: "Invalid email" });
        }
        if (typeof password !== "string") {
            return res.status(400).json({ message: "Invalid password" });
        }
        if (typeof name !== "string" || name.trim() === "") {
            return res.status(400).json({ message: "Invalid tutor name" });
        }
        if (!Array.isArray(approved_courses) || !approved_courses.every((c) => typeof c === "string")) {
            return res.status(400).json({ message: "Invalid courses" });
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

            await client.query(
                "INSERT INTO tutors (user_id, name, age, birthday, language, major, phone, description, profile_pic, approved_courses) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::text[])",
                [createdUserId, name, age, birthday, language, major, phone, description, profile_pic, approved_courses]
            );

            await client.query("COMMIT");

            const r = await pool.query(`${TUTOR_SELECT_COLUMNS} AND t.user_id = $1`, [createdUserId]);
            const acc = tutorRowToAccount(r.rows[0]);
            acc.notifications = await notificationsForUserId(createdUserId);
            return res.status(201).json(acc);
        } catch (err) {
            await client.query("ROLLBACK");
            if (err && err.code === "23505") {
                return res.status(409).json({ message: "Email already exists" });
            }
            throw err;
        } finally {
            client.release();
        }
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

            await client.query(
                "INSERT INTO students (user_id, name, age, major, birthday, language) VALUES ($1, $2, $3, $4, $5, $6)",
                [createdUserId, name, age, major, birthday, language]
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
                return res.status(409).json({ message: "Email already exists" });
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

app.get("/api/session", (req, res) => {
    const data = readData(Tables.SESSIONS);
    if (data) {
        writeResources();
        res.json(data.sessions);
    }
});

app.get("/api/session/id", (req, res) => {
    const data = readData(Tables.SESSIONS);
    let max = 0;
    data.sessions.forEach(session => {
        max = Math.max(max, session.id);
    });
    res.json(max + 1);
});

app.get("/api/session/active/:name", (req, res) => {
    const { name } = req.params;
    const data = readData(Tables.SESSIONS);
    const items = data.sessions.filter((item) => item.status === "active" && item.student === name);
    res.json(items);
});

app.get("/api/session/tutor/active/:name", (req, res) => {
    const { name } = req.params;
    const data = readData(Tables.SESSIONS);
    const items = data.sessions.filter((item) => item.status === "active" && item.tutor === name);
    res.json(items);
});

app.get("/api/session/pending/:name", (req, res) => {
    const { name } = req.params;
    const data = readData(Tables.SESSIONS);
    const items = data.sessions.filter((item) => item.status === "pending" && item.student === name);
    res.json(items);
});

app.get("/api/session/tutor/pending/:name", (req, res) => {
    const { name } = req.params;
    const data = readData(Tables.SESSIONS);
    const items = data.sessions.filter((item) => item.status === "pending" && item.tutor === name);
    res.json(items);
});

app.get("/api/session/canceled/:name", (req, res) => {
    const { name } = req.params;
    const data = readData(Tables.SESSIONS);
    const items = data.sessions.filter((item) => item.status === "declined" && item.student === name);
    res.json(items);
});

app.get("/api/session/tutor/canceled/:name", (req, res) => {
    const { name } = req.params;
    const data = readData(Tables.SESSIONS);
    const items = data.sessions.filter((item) => item.status === "declined" && item.tutor === name);
    res.json(items);
});

app.get("/api/session/:id", (req, res) => {
    const { id } = req.params;
    const data = readData(Tables.SESSIONS);
    const item = data.sessions.find((item) => item.id === id);
    if (item) {
        res.json(item);
    } else {
        res.status(404).json({ message: "Item not found" });
    }
});

app.delete("/api/session/:id", (req, res) => {
    const { id } = req.params;
    let data = readData(Tables.SESSIONS);
    const initialLength = data.sessions.length;
    data.sessions = data.sessions.filter((item) => item.id !== id);
    if (data.sessions.length < initialLength) {
        writeData(data, Tables.SESSIONS);
        res.json({ message: `Item with ID ${id} deleted` });
    } else {
        res.status(404).json({ message: "Item not found" });
    }
});

app.get("/api/session/tutor/:id", (req, res) => {
    const { id } = req.params;
    const data = readData(Tables.SESSIONS);
    const items = data.sessions.filter((item) => item.tutorId === id);
    if (items) {
        res.json(items);
    } else {
        res.status(404).json({ message: "Tutor's courses not found" });
    }
});

app.get("/api/session/student/:id", (req, res) => {
    const { id } = req.params;
    const data = readData(Tables.SESSIONS);
    const items = data.sessions.filter((item) => item.studentId === id);
    if (items) {
        res.json(items);
    } else {
        res.status(404).json({ message: "Student's courses not found" });
    }
});

app.get("/api/session/chat/:id", (req, res) => {
    const { id } = req.params;
    const data = readData(Tables.SESSIONS);
    const item = data.sessions.find((item) => item.id == id);
    if (item) {
        res.json(item.chatMessages);
    } else {
        res.status(404).json({ message: "Item not found" });
    }
});

app.post("/api/session/chat/:id", (req, res) => {
    const { id } = req.params;
    const { sender, message } = req.body;
    const data = readData(Tables.SESSIONS);
    const item = data.sessions.find((item) => item.id == id);
    if (item) {
        item.chatMessages.push({ sender, message });
        writeData(data, Tables.SESSIONS);
        res.json(item.chatMessages);
    } else {
        res.status(404).json({ message: "Item not found" });
    }
});

app.post("/api/session", (req, res) => {
    const newItem = req.body;
    const data = readData(Tables.SESSIONS);
    const sessions = data.sessions;
    const existingSession = sessions.find(session =>
        session.status === "pending" &&
        session.student === newItem.student &&
        session.tutor === newItem.tutor
    );

    if (existingSession) {
        res.status(400).json({ message: "A pending session already exists between this student and tutor." });
    } else {
        sessions.push(newItem);
        writeData(data, Tables.SESSIONS);
        res.status(201).json(newItem);
    }
});

app.post("/api/session/update/:id", (req, res) => {
    const { id } = req.params;
    const updatedItem = req.body;
    const data = readData(Tables.SESSIONS);
    const item = data.sessions.find((item) => item.id == id);
    if (item) {
        let index = data.sessions.findIndex((session) => session.id == id);
        data.sessions[index] = updatedItem;
        writeData(data, Tables.SESSIONS);
        res.json(updatedItem);
    } else {
        res.status(404).json({ message: "Item not found" });
    }
});

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
