import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/UserDashboard.css';

function Sidebar({ onSelect, toggleDropdown, isDropdownOpen, courses, onCourseSelect, isTutor, user }) {

    const fallbackAvatar =
        'https://tutor-platform-profile-pics.tor1.cdn.digitaloceanspaces.com/profiles/Placeholder_Profile_Pic.png';

    const userProfilePic =
        user?.tutor?.profile_pic ||
        user?.tutor?.profilePic ||
        user?.student?.profile_pic ||
        user?.student?.profilePic ||
        '';

    const handleImgError = (e) => {
        if (!e?.currentTarget) return;
        if (e.currentTarget.src === fallbackAvatar) return;
        e.currentTarget.src = fallbackAvatar;
    };

    const handleMyCoursesClick = () => {
        onSelect('myCourses');  
        toggleDropdown();  
    };

    return (
        <aside className="sidePanel">
            <div className="profileImageContainer">
                <img
                    src={userProfilePic || fallbackAvatar}
                    alt="Profile"
                    className="profileImage"
                    onError={handleImgError}
                />
                {/* <div className="statusIndicator"></div> */}
            </div>
            <div className="ButtonsContainer">
                <div className="ButtonsGroup">
                    {isTutor ? (
                        <div className="sideButton" onClick={() => onSelect('profile')}>Profile</div>
                    ) : (
                        <div className="sideButton" onClick={() => onSelect('explore')}>Explore</div>
                    )}
                    <div className="sideButton" onClick={() => onSelect('notifications')}>Notifications</div>
                    <div className="sideButton">
                        <button className="sideButton" onClick={handleMyCoursesClick}>
                            My Courses {isDropdownOpen ? '▼' : '▶'} 
                        </button>
                        {isDropdownOpen && (
                            <div className="dropdownMenu">
                                {courses.map(course => (
                                    <div key={course.id} className="dropdownItem" onClick={() => onCourseSelect(course)}>
                                        {course.focus}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                
                <div className="ButtonsGroup">
                    <div className="sideButton" onClick={() => onSelect('settings')}>Settings</div>
                    <Link to="/" className="sideButton">Logout</Link>
                </div>
            </div>
        </aside>
    );
}

export default Sidebar;
