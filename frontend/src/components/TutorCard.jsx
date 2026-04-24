import { Link } from 'react-router-dom';

const TutorCard = (props) => {
    const tutorData = props.tutor;
    const tutor = tutorData.tutor;
    console.log(tutorData);
    const user = props.user || null;

    const fallbackAvatar =
        'https://tutor-platform-profile-pics.tor1.cdn.digitaloceanspaces.com/profiles/Placeholder_Profile_Pic.png';

    const tutorProfilePic = tutor?.profile_pic || tutor?.profilePic || tutorData?.profile_pic || tutorData?.profilePic || '';

    const handleImgError = (e) => {
        if (!e?.currentTarget) return;
        if (e.currentTarget.src === fallbackAvatar) return;
        e.currentTarget.src = fallbackAvatar;
    };
    return (
        <>
            <Link to="/tutorProfile" state={{ tutor: tutorData, user: user }}>
                <div className="tutor-card">
                    <div className="profile-pic-container">
                        <img
                            className="profile-pic"
                            src={tutorProfilePic || fallbackAvatar}
                            alt={`${tutor?.name || 'Tutor'} profile`}
                            onError={handleImgError}
                        />
                        <h3 className="tutor-name">{tutor.name}</h3>
                        <div className="rating">
                            ⭐{tutor.rating}/5
                        </div>
                    </div>
                    <div className="course-details">
                        <span>{tutor.education}</span>
                        <span>${tutor.costPerHour}/hr</span>
                    </div>
                </div>
            </Link>
            <style jsx="true">
                {`  
                    .tutor-card {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        border: 1px solid #ccc;
                        padding: 16px;
                        width: min(300px, 100%);
                        height: 45vh;
                        margin: 16px;
                        background-color: #fff;
                    }
                    .tutor-name {
                        position: absolute;
                        top: 90%;
                        left: 0;
                        right: 0;
                        padding-left: 10px;
                        color: #000;
                        background-color: rgba(255, 255, 255, 0.7);
                        padding: 4px 8px;
                    }
                    .course-details {
                        margin-top: 16px;
                        display: flex;
                        justify-content: space-between;
                        width: 100%;
                        color: #000;
                    }
                    .profile-pic {
                        height: 100%;
                        width: 100%;
                        object-fit: cover;
                        border-radius: 6px;
                    }
                    .profile-pic-container {
                        height: 80%;
                        position: relative;
                    }

                    @media (max-width: 480px) {
                        .tutor-card {
                            margin: 10px;
                            height: auto;
                        }

                        .profile-pic-container {
                            height: 220px;
                            width: 100%;
                        }

                        .tutor-name {
                            top: auto;
                            bottom: 8px;
                        }
                    }
                `}
            </style>
        </>
    );
};

export default TutorCard;