import React from "react";
import {
    calculateTotalPages,
    displayCoursesBasedOnPageNumberOnModal,
} from "../utils/PendingStudentConnectionRequestUtils";

const placeholderProfilePic =
    "https://tutor-platform-profile-pics.tor1.cdn.digitaloceanspaces.com/Placeholder_Profile_Pic.png";

const firstNonEmptyString = (...values) =>
    values.find((v) => typeof v === "string" && v.trim() !== "");

const getAvatarUrlForViewer = (course, viewer) => {
    const viewerType = viewer === "tutor" ? "tutor" : "student";
    const preferred =
        viewerType === "tutor"
            ? [course?.studentProfilePic, course?.student_profile_pic]
            : [course?.tutorProfilePic, course?.tutor_profile_pic];

    return firstNonEmptyString(
        ...preferred,
        course?.profilePicture,
        course?.profilePic,
        course?.profile_pic,
        placeholderProfilePic
    );
};

const handleAvatarError = (e) => {
    if (e?.currentTarget?.src !== placeholderProfilePic) {
        e.currentTarget.src = placeholderProfilePic;
    }
};

function PendingStudentConnectionRequestModal({
    courses,
    currentPage,
    itemsPerPage,
    setCurrentPage,
    onClose,
    viewer,
}) {
        console.log("These are the props that pending student connection request modal is receiving", { courses, currentPage, itemsPerPage, setCurrentPage, onClose });
    return (
        <div className="modalOverlay">
            <div className="modalContent">
                <div className="modalCourseCards">
                    {displayCoursesBasedOnPageNumberOnModal(
                        courses,
                        currentPage,
                        itemsPerPage
                    ).map((course) => (
                        <div key={course.id} className="courseCard fullLengthCard">
                            <div className="profileSection">
                                <img
                                    src={getAvatarUrlForViewer(course, viewer)}
                                    alt={viewer === "tutor" ? "Student" : "Tutor"}
                                    className="profileImage"
                                    onError={handleAvatarError}
                                />
                            </div>
                            <div className="courseInfo">
                                <p className="studentName">
                                    <b>Student:</b> {course.studentName}
                                </p>
                                <p className="focus">
                                    <b>Focus:</b> {course.focus}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="pagination">
                    <button
                        onClick={() => setCurrentPage(currentPage - 1)}
                        disabled={currentPage === 1}
                    >
                        Previous
                    </button>
                    <span>
                        Page {currentPage} of {calculateTotalPages(courses, itemsPerPage)}
                    </span>
                    <button
                        onClick={() => setCurrentPage(currentPage + 1)}
                        disabled={currentPage === calculateTotalPages(courses, itemsPerPage)}
                    >
                        Next
                    </button>
                </div>
                <button className="closeButton" onClick={() => { onClose(); setCurrentPage(1); }}>
                    Close
                </button>
            </div>
        </div>
    );
}
export default PendingStudentConnectionRequestModal;
