import { Link } from 'react-router-dom';

const TutorCard = ({ tutor: tutorData, user = null }) => {
    const fallbackAvatar =
        'https://tutor-platform-profile-pics.tor1.cdn.digitaloceanspaces.com/profiles/Placeholder_Profile_Pic.png';

    const tutor = tutorData?.tutor ?? tutorData ?? {};

    const tutorProfilePic =
        tutor?.profile_pic ||
        tutor?.profilePic ||
        tutorData?.profile_pic ||
        tutorData?.profilePic ||
        '';

    const tutorName = tutor?.name || 'Tutor';
    const rating = tutor?.rating;
    const education = tutor?.education || '';
    const costPerHour = tutor?.costPerHour;

    const handleImgError = (e) => {
        if (!e?.currentTarget) return;
        if (e.currentTarget.src === fallbackAvatar) return;
        e.currentTarget.src = fallbackAvatar;
    };

    return (
        <>
            <Link className="tpTutorCardLink" to="/tutorProfile" state={{ tutor: tutorData, user }}>
                <div className="tpTutorCard">
                    <div className="tpTutorCardMedia">
                        <img
                            className="tpTutorCardImage"
                            src={tutorProfilePic || fallbackAvatar}
                            alt={`${tutorName} profile`}
                            onError={handleImgError}
                        />
                        <div className="tpTutorCardName">{tutorName}</div>
                        {rating !== undefined && rating !== null ? (
                            <div className="tpTutorCardRating">⭐{rating}/5</div>
                        ) : null}
                    </div>

                    <div className="tpTutorCardMeta">
                        <span>{education}</span>
                        <span>
                            {costPerHour !== undefined && costPerHour !== null ? `$${costPerHour}/hr` : ''}
                        </span>
                    </div>
                </div>
            </Link>

            <style jsx="true">
                {`
                    .tpTutorCardLink {
                        display: block;
                        width: 100%;
                        max-width: 360px;
                        flex: 0 1 360px;
                        color: inherit;
                        text-decoration: none;
                    }

                    .tpTutorCard {
                        display: flex;
                        flex-direction: column;
                        border: 1px solid #ccc;
                        border-radius: 12px;
                        overflow: hidden;
                        background-color: #fff;
                        width: 100%;
                        margin: 0;
                    }

                    .tpTutorCardMedia {
                        position: relative;
                        width: 100%;
                        aspect-ratio: 4 / 3;
                        background: #f0f0f0;
                    }

                    .tpTutorCardImage {
                        height: 100%;
                        width: 100%;
                        object-fit: cover;
                        object-position: 50% 20%;
                        display: block;
                    }

                    .tpTutorCardName {
                        position: absolute;
                        left: 0;
                        right: 0;
                        bottom: 0;
                        padding: 10px 12px;
                        padding-right: 90px;
                        font-size: 22px;
                        font-weight: 700;
                        color: #000;
                        background: rgba(255, 255, 255, 0.72);
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                    }

                    .tpTutorCardRating {
                        position: absolute;
                        right: 12px;
                        bottom: 10px;
                        font-size: 16px;
                        font-weight: 700;
                        color: #ffb300;
                        background-color: #fff;
                        padding: 6px 10px;
                        border-radius: 999px;
                        box-shadow: 0 0 5px rgba(0, 0, 0, 0.1);
                        white-space: nowrap;
                    }

                    .tpTutorCardMeta {
                        padding: 14px 16px;
                        display: flex;
                        justify-content: space-between;
                        color: #000;
                        gap: 10px;
                        flex-wrap: wrap;
                    }

                    .tpTutorCardMeta span:first-child {
                        flex: 1 1 auto;
                        min-width: 0;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        white-space: nowrap;
                    }

                    .tpTutorCardMeta span:last-child {
                        flex: 0 0 auto;
                        white-space: nowrap;
                    }

                    @media (max-width: 360px) {
                        .tpTutorCardName {
                            font-size: 20px;
                            padding-right: 80px;
                        }

                        .tpTutorCardRating {
                            right: 10px;
                            bottom: 10px;
                            font-size: 15px;
                            padding: 6px 9px;
                        }

                        .tpTutorCardMeta {
                            padding: 12px 14px;
                        }
                    }
                `}
            </style>
        </>
    );
};

export default TutorCard;