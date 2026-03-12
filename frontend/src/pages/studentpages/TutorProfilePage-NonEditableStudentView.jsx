import React from 'react';
import { Link } from 'react-router-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { putPendingSession } from '../../controllers/SessionController';

const TutorProfilePage = () => {

    const location = useLocation();
    const navigate = useNavigate();
    const state = location.state || {};
    const tutorD = state.tutor || { tutor: {} }; // Ensure tutor is an object if undefined
    const tutor = tutorD.tutor;
    const user = state.user || null; // Ensure user is an object if undefined
    const [isModalOpen, setIsModalOpen] = React.useState(false);
    const [message, setMessage] = React.useState('');

    const placeholderProfilePic = 'https://tutor-platform-profile-pics.tor1.cdn.digitaloceanspaces.com/profiles/Placeholder_Profile_Pic.png';


    const handleModalToggle = () => {
        setIsModalOpen(!isModalOpen);
    };

    const handleBack = () => {
        // Go back to last visited page when possible.
        if (window.history.length > 1) {
            navigate(-1);
            return;
        }
        navigate('/userPortal');
    };

    const handleMessageUpdate = (event) => {
        setMessage(event.target.value);
    };

    const submitConnectionRequest = async () => {
        if (user && tutor) {
            const session = {
                tutor: tutor.name,
                tutorId: tutorD.id,
                student: user.student.name,
                studentId: user.id,
                status: 'pending',
                message: message
            };
            await putPendingSession(session);
            handleModalToggle();
        }
    }
    if (!tutor) {
        return <div>No tutor data available</div>;
    }

    return (
        <>
            <div className="profile-container">

                <button className="backButton" onClick={handleBack} aria-label="Back">&larr;</button>

                <div className="banner">Banner</div>

                {/* <Link to="/userPortal" className="back-button"> Back </Link> */}

                <div className="tutor-info">
                    <img
                        className="profile-pic"
                        src={tutor?.profile_pic || tutor?.profilePic || placeholderProfilePic}
                        alt={`${tutor?.name || 'Tutor'} profile`}
                        onError={(e) => {
                            if (!e?.currentTarget) return;
                            if (e.currentTarget.src === placeholderProfilePic) return;
                            e.currentTarget.src = placeholderProfilePic;
                        }}
                    />
                    <div className="info">
                        <h2>{tutor.name}</h2>
                        <p>Education: {tutor.education}</p>
                        <p>Rating: {tutor.rating}/5</p>
                    </div>
                    <button className="btn-large" onClick={handleModalToggle} disabled={!user}>Send Tutor Connection Request</button>
                </div>

                <div className="about">
                    <h3>About</h3>
                    <p>
                        {tutor.description}
                    </p>
                </div>

                <div className="courses">
                    <h3>Courses Taught</h3>
                    <div className="course-list">
                        {tutor.courses && tutor.courses.length > 0 ? (
                            tutor.courses.map((course, index) => (
                                <span key={index} className="course">{course}</span>
                            ))
                        ) : (
                            <p>No courses available</p>
                        )}
                    </div>
                </div>
                {isModalOpen && (
                    <div className="modal">
                        <div className="modal-content">
                            <span className="close" onClick={handleModalToggle}>&times;</span>
                            <h2>Send Connection Request</h2>
                            <div className="input-container">
                                <textarea
                                    className="message-input"
                                    value={message}
                                    onChange={handleMessageUpdate}
                                    placeholder="Message to tutor"
                                />
                            </div>
                            <button className="btn-large btn-center" onClick={submitConnectionRequest}>Send Request</button>
                        </div>
                    </div>
                )}
            </div>

            <style jsx>
                {`
            /* General Styling */
body, html {
    margin: 0;
    padding: 0;
    font-family: Arial, sans-serif;
    background-color: #f5f5f5;
    height: 100%; /* Full screen height */
    overflow: hidden; /* Prevent scrolling */
}

.btn-center{
    display: block;
    margin: 0 auto;
}

.message-input {
    width: 100%;
    height: 300px;
    padding: 10px;
    border: 1px solid #ccc;
    border-radius: 5px;
    box-sizing: border-box;
    resize: none;
}

.input-container {
    position: relative;
}


.backButton {
    position: absolute;
    top: 20px;
    left: 20px;
    font-size: 1.5rem;
    border: none;
    background: none;
    cursor: pointer;
    z-index: 2;
}

.profile-container {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100vh; /* Full viewport height */
    width: 100%; /* Full width */
    background-color: #fff;
}

/* Banner Section */
.banner {
    background-color: #e0e0e0;
    color: #666;
    text-align: center;
    padding: 50px;
    font-size: 20px;
    font-weight: bold;
    flex: 0 0 15%; /* Fixed height proportional to the screen */
}

/* Tutor Info Section */
.tutor-info {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px;
    border-bottom: 1px solid #ddd;
    flex: 0 0 20%; /* Fixed height proportional to the screen */
}

.profile-pic {
    width: 100px;
    height: 100px;
    background-color: #ccc;
    border-radius: 50%;
    flex-shrink: 0;
    object-fit: cover;
}

.info {
    flex-grow: 1;
    margin-left: 20px;
}

.info h2 {
    margin: 0;
    font-size: 24px;
}

.info p {
    margin: 5px 0;
    color: #555;
}

.btn-large {
    padding: 10px 20px;
    background-color: #007BFF;
    color: #fff;
    border: none;
    border-radius: 5px;
    cursor: pointer;
}

.btn-large:hover {
    background-color: #0056b3;
}

.btn-large:disabled {
    background-color: #ccc;
    cursor: not-allowed;
}

/* About Section */
.about {
    padding: 50px;
    margin: 50px;
    overflow-y: auto; /* Add scrolling if content exceeds space */
}

.about h3 {
    margin-bottom: 5px;
    font-size: 20px;
}

.about p {
    margin: 0;
    line-height: 1.6;
    color: #555;
}

/* Courses Section */
.courses {
    flex: 0 0 15%; /* Fixed height proportional to the screen */
    padding: 20px;
    border-top: 1px solid #ddd;
    background-color: #f8f8f8;
}

.courses h3 {
    margin-bottom: 10px;
    font-size: 20px;
}

.course-list {
    display: flex;
    gap: 10px;
}

.course {
    background-color: #f0f0f0;
    padding: 10px 15px;
    border-radius: 5px;
    font-size: 14px;
    color: #333;
    text-align: center;
    cursor: default;
}

/* Modal Styling */
.modal {
    display: flex;
    justify-content: center;
    align-items: center;
    position: fixed;
    z-index: 1;
    left: 0;
    top: 0;
    width: 100%;
    height: 100%;
    overflow: auto;
    background-color: rgba(0,0,0,0.4);
}

.modal-content {
    background-color: #fefefe;
    padding: 20px;
    border: 1px solid #888;
    width: 80%;
    max-width: 500px;
    border-radius: 10px;
}

.close {
    color: #aaa;
    float: right;
    font-size: 28px;
    font-weight: bold;
    cursor: pointer;
}

.close:hover,
.close:focus {
    color: black;
    text-decoration: none;
    cursor: pointer;
}
            `}
            </style>

        </>
    );
};

export default TutorProfilePage;
