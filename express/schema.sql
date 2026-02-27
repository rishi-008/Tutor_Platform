-- Create tables
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    is_approved BOOLEAN DEFAULT FALSE,
    proof_doc TEXT,
    user_type VARCHAR(10) NOT NULL CHECK (user_type IN ('student', 'tutor'))
);

CREATE TABLE IF NOT EXISTS students (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    age INTEGER,
    major VARCHAR(255),
    birthday DATE,
    language VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS tutors (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    age INTEGER,
    birthday DATE,
    language VARCHAR(100),
    education VARCHAR(255),
    phone VARCHAR(50),
    description TEXT,
    profile_pic TEXT,
    approved_courses TEXT[],
    rating NUMERIC(3,2) DEFAULT 0,
    "costPerHour" NUMERIC(10,2) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    category VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES users(id),
    tutor_id INTEGER REFERENCES users(id),
    student_name VARCHAR(255),
    tutor_name VARCHAR(255),
    focus VARCHAR(255),
    profile_pic TEXT,
    status VARCHAR(50),
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    duration INTEGER,
    progress INTEGER,
    report_id INTEGER,
    description TEXT,
    class_link TEXT,
    reason TEXT,
    chat_messages JSONB,
    resources TEXT[]
);

CREATE TABLE IF NOT EXISTS resources (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    bytes TEXT
);

CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    session_id INTEGER REFERENCES sessions(id),
    content JSONB
);

CREATE TABLE IF NOT EXISTS universities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS university_tutors (
    university_id INTEGER REFERENCES universities(id) ON DELETE CASCADE,
    tutor_id INTEGER REFERENCES tutors(user_id) ON DELETE CASCADE,
    PRIMARY KEY (university_id, tutor_id)
);

CREATE TABLE IF NOT EXISTS university_courses (
    university_id INTEGER REFERENCES universities(id) ON DELETE CASCADE,
    course_name VARCHAR(255) NOT NULL,
    PRIMARY KEY (university_id, course_name)
);