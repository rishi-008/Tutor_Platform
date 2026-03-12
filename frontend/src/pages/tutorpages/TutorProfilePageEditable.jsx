import React, { useState } from 'react';
import { updateTutorDescription, updateTutorCourses, getTutorById, getBannerTypes, updateTutorBanner } from "../../controllers/AccountController";

const TutorProfilePageEditable = (props) => {
    const [isEditingDescription, setIsEditingDescription] = useState(false);
    const [isEditingCourses, setIsEditingCourses] = useState(false);
    const [description, setDescription] = useState('');
    const [courses, setCourses] = useState([]);
    const [newlyAddedCourses, setNewlyAddedCourses] = useState([]);
    const [tutorInfo, setTutorInfo] = useState({});
       const placeholderProfilePic = 'https://tutor-platform-profile-pics.tor1.cdn.digitaloceanspaces.com/profiles/Placeholder_Profile_Pic.png';
    const defaultBannerUrl = 'https://tutor-platform-profile-pics.tor1.cdn.digitaloceanspaces.com/banners/banner.png';

    const [isBannerModalOpen, setIsBannerModalOpen] = useState(false);
    const [bannerTypes, setBannerTypes] = useState([]);
    const [selectedBannerKey, setSelectedBannerKey] = useState('');

    React.useEffect(() => {
        async function fetchData() {
            const latestTutorInfo = await getTutorById(props.tutor.id);
            setTutorInfo(latestTutorInfo);
            setDescription(latestTutorInfo.tutor.description);
            setCourses(latestTutorInfo.tutor.courses);
            setSelectedBannerKey(latestTutorInfo?.tutor?.banner_key || latestTutorInfo?.tutor?.bannerKey || 'banner');
        }
        fetchData();
    }, [props?.tutor?.id]);

    const openBannerModal = async () => {
        setIsBannerModalOpen(true);
        try {
            const types = await getBannerTypes();
            setBannerTypes(types);
        } catch (e) {
            setBannerTypes([]);
        }
    };

    const closeBannerModal = () => {
        setIsBannerModalOpen(false);
    };

    const saveBannerSelection = async () => {
        if (!selectedBannerKey) return;
        await updateTutorBanner(props.tutor.id, selectedBannerKey);
        const latestTutorInfo = await getTutorById(props.tutor.id);
        setTutorInfo(latestTutorInfo);
        closeBannerModal();
    };

    const handleEditDescriptionClick = () => {
        setIsEditingDescription(true);
    };

    const handleSaveDescriptionClick = () => {
        setIsEditingDescription(false);
        console.log("this is the description it should be changed to", description);
        updateTutorDescription(props.tutor.id, description);
        // Save the updated description to the tutor object or send it to the server
    };

    const handleEditCoursesClick = () => {
        setIsEditingCourses(true);
    };

    const handleSaveCoursesClick = () => {
        console.log("these are the coursews we're sending and should be updated: ", newlyAddedCourses);
        setIsEditingCourses(false);
        updateTutorCourses(props.tutor.id, newlyAddedCourses);
        // Save the updated courses to the tutor object or send it to the server
    };

    const handleDescriptionChange = (event) => {
        setDescription(event.target.value);
    };

    const handleCoursesChange = (index, event) => {
        const newCourses = [...courses];
        newCourses[index] = event.target.value;
        setNewlyAddedCourses(newCourses.filter(course => !courses.includes(course)));
        setCourses(newCourses);
    };

    const handleAddCourse = () => {
        setCourses([...courses, '']);
    };

    const handleRemoveCourse = (index) => {
        const newCourses = courses.slice(0, index).concat(courses.slice(index + 1));
        setCourses(newCourses);
        setNewlyAddedCourses(newCourses.filter(course => !courses.includes(course)));
    };

    const tutor = tutorInfo.tutor || { tutor: {} };

    if (!tutor) {
        return <div>No tutor data available</div>;
    }

    return (
        <>
            <div className="profile-container">
                <div className="banner">
                    <img
                        className="banner-image"
                        src={tutor?.banner_url || tutor?.bannerUrl || defaultBannerUrl}
                        alt="Tutor banner"
                        onError={(e) => {
                            if (!e?.currentTarget) return;
                            if (e.currentTarget.src === defaultBannerUrl) return;
                            e.currentTarget.src = defaultBannerUrl;
                        }}
                    />
                    <button className="actionButton" onClick={openBannerModal}>Edit</button>
                </div>
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
                </div>
                <div className="content">
                    <div className="about"></div>
                    {isEditingDescription ? (
                        <textarea className="large-textarea" value={description} onChange={handleDescriptionChange} />
                    ) : (
                        <p>{description}</p>
                    )}
                    {isEditingDescription ? (
                        <button className="actionButton primary" onClick={handleSaveDescriptionClick}>Save</button>
                    ) : (
                        <button className="actionButton" onClick={handleEditDescriptionClick}>Edit</button>
                    )}
                </div>
                <div className="courses">
                    <h3>Courses Taught</h3>
                    <div className="course-list">
                        {isEditingCourses ? (
                            <>
                                {courses.map((course, index) => (
                                    <div key={index} className="course-edit">
                                        <input
                                            type="text"
                                            value={course}
                                            onChange={(event) => handleCoursesChange(index, event)}
                                        />
                                        <button className="actionButton danger" onClick={() => handleRemoveCourse(index)}>Remove</button>
                                    </div>
                                ))}
                                <button className="actionButton" onClick={handleAddCourse}>Add Course</button>
                                <button className="actionButton primary" onClick={handleSaveCoursesClick}>Save</button>
                            </>
                        ) : (
                            courses.length > 0 ? (
                                courses.map((course, index) => (
                                    <span key={index} className="course">{course}</span>
                                ))
                            ) : (
                                <p>No courses available</p>
                            )
                        )}
                    </div>
                    {!isEditingCourses && <button className="actionButton" onClick={handleEditCoursesClick}>Edit</button>}
                </div>
            </div>

            {isBannerModalOpen && (
                <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Select banner">
                    <div className="modalContent">
                        <div className="modalHeader">
                            <h2>Select a banner</h2>
                            <button className="modalClose" onClick={closeBannerModal} aria-label="Close">×</button>
                        </div>

                        <div className="bannerGrid">
                            {(bannerTypes.length ? bannerTypes : [
                                { key: 'banner', cdn_url: defaultBannerUrl },
                                { key: 'banner2', cdn_url: 'https://tutor-platform-profile-pics.tor1.cdn.digitaloceanspaces.com/banners/banner2.png' },
                            ]).map((b) => (
                                <button
                                    key={b.key}
                                    type="button"
                                    className={`bannerOption ${selectedBannerKey === b.key ? 'selected' : ''}`}
                                    onClick={() => setSelectedBannerKey(b.key)}
                                >
                                    <img className="bannerPreview" src={b.cdn_url} alt={b.key} />
                                </button>
                            ))}
                        </div>

                        <div className="modalActions">
                            <button className="modalButton" onClick={closeBannerModal}>Cancel</button>
                            <button className="modalButton primary" onClick={saveBannerSelection} disabled={!selectedBannerKey}>Save</button>
                        </div>
                    </div>
                </div>
            )}

            <style jsx>{`
                body, html {
                    margin: 0;
                    padding: 0;
                    font-family: Arial, sans-serif;
                    background-color: #f5f5f5;
                    height: 100%;
                }
                .profile-container {
                    display: flex;
                    flex-direction: column;
                    height: 100vh;
                    background-color: #fff;
                }
                .banner {
                    background-color: #e0e0e0;
                    position: relative;
                    height: 140px;
                    overflow: hidden;
                    padding: 0;
                    line-height: 0;
                }
                .banner-image {
                    width: 100% !important;
                    height: 100% !important;
                    display: block;
                    object-fit: cover;
                    object-position: center;
                }
                .actionButton {
                    padding: 10px 14px;
                    border-radius: 8px;
                    border: 1px solid #ddd;
                    background: white;
                    cursor: pointer;
                    font-weight: 600;
                }

                .banner .actionButton {
                    position: absolute;
                    top: 12px;
                    right: 12px;
                }

                /* Re-use the same button look for the rest of the page */
                .content > .actionButton,
                .courses > .actionButton {
                    margin-top: 10px;
                }

                .course-edit .actionButton {
                    padding: 8px 12px;
                    margin-top: 0;
                }

                .actionButton.primary {
                    background: #007BFF;
                    color: white;
                    border-color: #007BFF;
                }

                .actionButton.danger {
                    background: #dc3545;
                    color: white;
                    border-color: #dc3545;
                }

                .actionButton:hover {
                    filter: brightness(0.97);
                }

                .actionButton:active {
                    filter: brightness(0.93);
                }
                .tutor-info {
                    display: flex;
                    align-items: center;
                    padding: 20px;
                    border-bottom: 1px solid #ddd;
                }
                .profile-pic {
                    width: 100px;
                    height: 100px;
                    background-color: #ccc;
                    border-radius: 50%;
                    display: block;
                    aspect-ratio: 1 / 1;
                    object-fit: cover;
                    object-position: 50% 12%;
                }

                .modalOverlay {
                    position: fixed;
                    inset: 0;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 24px;
                    z-index: 1000;
                }
                .modalContent {
                    width: min(720px, 100%);
                    background: #fff;
                    border-radius: 10px;
                    padding: 16px;
                }
                .modalHeader {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 12px;
                }
                .modalHeader h2 {
                    margin: 0;
                    font-size: 18px;
                }
                .modalClose {
                    border: none;
                    background: transparent;
                    cursor: pointer;
                    font-size: 22px;
                    line-height: 1;
                }
                .bannerGrid {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 12px;
                    margin: 12px 0;
                }
                .bannerOption {
                    padding: 0;
                    border: 2px solid #ddd;
                    border-radius: 10px;
                    overflow: hidden;
                    background: #fff;
                    cursor: pointer;
                }
                .bannerOption.selected {
                    border-color: #007BFF;
                }
                .bannerPreview {
                    width: 100%;
                    height: 120px;
                    display: block;
                    object-fit: cover;
                }
                .modalActions {
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                    margin-top: 8px;
                }
                .modalButton {
                    padding: 10px 14px;
                    border-radius: 8px;
                    border: 1px solid #ddd;
                    background: white;
                    cursor: pointer;
                }
                .modalButton.primary {
                    background: #007BFF;
                    color: white;
                    border-color: #007BFF;
                }
                .modalButton:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
                .info {
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
                .content {
                    padding: 20px;
                }
                .about {
                    margin-bottom: 20px;
                }
                .courses {
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
                    flex-direction: column;
                    gap: 10px;
                }
                .course {
                    background-color: #f0f0f0;
                    padding: 10px;
                    border-radius: 5px;
                    font-size: 14px;
                    color: #333;
                    text-align: center;
                }
                .course-edit {
                    display: flex;
                    gap: 10px;
                }
                .course-edit input {
                    flex-grow: 1;
                    padding: 10px;
                    font-size: 14px;
                    border: 1px solid #ccc;
                    border-radius: 5px;
                }
                .large-textarea {
                    width: 100%;
                    height: 200px;
                    padding: 10px;
                    font-size: 16px;
                    border: 1px solid #ccc;
                    border-radius: 5px;
                }
            `}</style>
        </>
    );
};

export default TutorProfilePageEditable;