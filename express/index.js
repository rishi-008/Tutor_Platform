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
    const data = readData(Tables.ACCOUNTS);
    let max = 0;
    data.students.forEach(student => {
        max = Math.max(max, student.id);
    });
    res.json(max + 1);
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

        return res.json(tutorRowToAccount(r.rows[0]));
    })
);

// Add a new item to tutor accounts
app.post("/api/tutor", (req, res) => {
    const newItem = req.body;
    const data = readData(Tables.ACCOUNTS);
    data.students = data.students || [];
    data.tutors.push(newItem);
    writeData(data, Tables.ACCOUNTS);
    res.status(201).json(newItem);
});

// Delete an account item by ID
app.delete("/api/tutor/:id", (req, res) => {
    const { id } = req.params;
    let data = readData(Tables.ACCOUNTS);
    const initialLength = data.length;
    data = data.filter((item) => item.id !== id);
    if (data.length < initialLength) {
        writeData(data, Tables.ACCOUNTS);
        res.json({ message: `Item with ID ${id} deleted` });
    } else {
        res.status(404).json({ message: "Item not found" });
    }
});
// Get all items for student accounts
app.get("/api/student", (req, res) => {
    const data = readData(Tables.ACCOUNTS);
    res.json(data.students || []);
});

app.get("/api/student/:id", (req, res) => {
    const { id } = req.params;
    const data = readData(Tables.ACCOUNTS);
    const item = data.students.find((item) => item.id == id);
    if (item) {
        res.json(item);
    } else {
        res.status(404).json({ message: "Item not found" });
    }
});


// Add a new item to student accounts
app.post("/api/student", (req, res) => {
    const newItem = req.body;
    const data = readData(Tables.ACCOUNTS);
    data.students = data.students || [];
    data.students.push(newItem);
    writeData(data, Tables.ACCOUNTS);
    res.status(201).json(newItem);
});

// Delete a student account item by ID
app.delete("/api/student/:id", (req, res) => {
    const { id } = req.params;
    let data = readData(Tables.ACCOUNTS);
    const initialLength = data.students.length;
    data.students = data.students.filter((item) => item.id !== id);
    if (data.students.length < initialLength) {
        writeData(data, Tables.ACCOUNTS);
        res.json({ message: `Item with ID ${id} deleted` });
    } else {
        res.status(404).json({ message: "Item not found" });
    }
});

app.delete("/api/student/:id/notification/:nid", (req, res) => {
    const { id, nid } = req.params;
    let data = readData(Tables.ACCOUNTS);
    const initialLength = data.students.length;
    const student = data.students.find((item) => item.id == id);
    student.notifications = data.students.notifications.filter((item) => item.id !== nid);
    data.students = data.students.filter((item) => item.id !== id);
    data.students.push(student);
    if (data.students.length < initialLength) {
        writeData(data, Tables.ACCOUNTS);
        res.json({ message: `Item with ID ${id} deleted` });
    } else {
        res.status(404).json({ message: "Item not found" });
    }
});

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
        return res.json(tutorRowToAccount(r.rows[0]));
    })
);

app.put("/api/student/password/:id", (req, res) => {
    const { id } = req.params;
    const { password } = req.body;
    const data = readData(Tables.ACCOUNTS);
    const item = data.students.find((item) => item.id == id);
    const updatedStudents = data.students.filter((item) => item.id != id);
    item.password = password;
    updatedStudents.push(item);
    data.students = updatedStudents;
    writeData(data, Tables.ACCOUNTS);
    res.json(item);
});

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
        return res.json(tutorRowToAccount(r.rows[0]));
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
