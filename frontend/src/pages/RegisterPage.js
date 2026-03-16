import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../styles/RegisterPage.css';
import { registerStudent, registerTutor, uploadProfilePic } from '../controllers/AccountController';

const MAX_PROFILE_PIC_BYTES = 2 * 1024 * 1024; // 2MB

function RegisterPage() {
  const [userData, setUserData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    birthday: '',
    major: '',
    language: '',
    isTutor: false,
    notifications: true,
    isApproved: true,
    proofdoc: null,
    profilePicFile: null,
  });

  const [studentData, setStudentData] = useState({
    id: 0,
    email: '',
    student: {
      name: '',
      age: 0,
      major: '',
      birthday: '',
      sessions: []
    },
    isAdmin: false,
    notifications: true,
    isApproved: true,
    proofdoc: null,
    isApproved: true
  });

  const [tutorData, setTutorData] = useState({
    id: 0,
    email: '',
    tutor: {
      name: '',
      rating: 0,
      education: '',
      costPerHour: 0,
      birthday: '',
      language: '',
      description: '',
      courses: []
    },
    isAdmin: false,
    notifications: true,
    isApproved: true,
    proofdoc: null,
    isApproved: true
  });


  const [isTutor, setIsTutor] = useState(false);

  const [error, setError] = useState('');

  const [passwordInput, setPasswordInput] = useState({
    password: '',
    confirmPassword: ''
  });

  const validatePassword = (password) => {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
    if (
      password.length < minLength ||
      !hasUpperCase ||
      !hasLowerCase ||
      !hasNumber ||
      !hasSpecialChar
    ) {
      return false;
    }
    return true;
  };
  

  const [showUploadForm, setShowUploadForm] = useState(false);

  const [submissionComplete, setSubmissionComplete] = useState(false);

  const navigate = useNavigate();

  React.useEffect(() => {
    setStudentData({ id: 0, email: userData.email, password: userData.password, student: { name: `${userData.firstName} ${userData.lastName}`, birthday: userData.birthday, major: userData.major, age: 0, courses: [] }, isAdmin: false, notifications: [] });
    setTutorData({ email: userData.email, password: userData.password, tutor: { name: `${userData.firstName} ${userData.lastName}`, birthday: userData.birthday, major: userData.major, language: userData.language }, isAdmin: false, notifications: [], isApproved: false, proofdoc: userData.proofdoc });
  }, [userData]);

  React.useEffect(() => {
    setUserData(prev => ({ ...prev, password: passwordInput.password }));
  }, [passwordInput]);

  React.useEffect(() => {
  }, [showUploadForm]);

  React.useEffect(() => {
    if (submissionComplete) {
      const timer = setTimeout(() => {
        navigate('/login');
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [submissionComplete]);

  const majors = [
    "Computer Science", "Engineering", "Biology", "Business"
  ];

  const languages = [
    "English", "Spanish", "French", "Chinese", "Arabic", "Farsi", "Urdu", "Hindi"
  ];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setUserData(prev => ({ ...prev, [name]: value }));
  };

  const handlePasswordChange = (e) => {
    const { name, value } = e.target;
    setPasswordInput(prev => ({ ...prev, [name]: value }));
  };

  const handleToggle = () => {
    setIsTutor(prev => !prev);
  };

  const handleFileChange = (event) => {
    setUserData(prev => ({ ...prev, proofdoc: event.target.files[0] }));
    console.log(event.target.files[0]);
  };

  const handleProfilePicChange = (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      setUserData(prev => ({ ...prev, profilePicFile: null }));
      return;
    }
    if (file.size > MAX_PROFILE_PIC_BYTES) {
      setError('Profile picture must be 2MB or smaller.');
      event.target.value = '';
      setUserData(prev => ({ ...prev, profilePicFile: null }));
      return;
    }
    if (!String(file.type || '').startsWith('image/')) {
      setError('Profile picture must be an image file.');
      event.target.value = '';
      setUserData(prev => ({ ...prev, profilePicFile: null }));
      return;
    }
    setError('');
    setUserData(prev => ({ ...prev, profilePicFile: file }));
  };

  // Function to handle uploading the proof document
  const handleProofSubmit = async (event) => {
    event.preventDefault();
    const idRes = await fetch('/api/tutor/id');
    const reservedId = await idRes.json();

    let profilePicUrl = null;
    if (userData.profilePicFile) {
      try {
        profilePicUrl = await uploadProfilePic(userData.profilePicFile, { userType: 'tutor', id: reservedId });
      } catch (e) {
        setError(e?.message || 'Profile picture upload failed');
        return;
      }
    }

    const payload = {
      ...tutorData,
      id: reservedId,
      tutor: {
        ...(tutorData.tutor || {}),
        profile_pic: profilePicUrl || tutorData?.tutor?.profile_pic || tutorData?.tutor?.profilePic || '',
      },
    };

    await registerTutor(payload);
    setSubmissionComplete(true);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (passwordInput.password !== passwordInput.confirmPassword) {
      setError(
        "Password confirmation does not match with password."
      );
      return;
    }
    if (!validatePassword(passwordInput.password)){
      setError(
        "Password must be at least 8 characters long and include uppercase letters, lowercase letters, numbers, and special characters."
      );
      return;
    }
    setError("");

    setUserData(prev => ({ ...prev, password: passwordInput.password }));
    if (isTutor) {
      console.log('Tutor Data:', tutorData);
      setTutorData(prev => ({ ...prev, password: passwordInput.password }));
      setShowUploadForm(true);
    } else {
      console.log('Student Data:', studentData);
      setStudentData(prev => ({ ...prev, password: passwordInput.password }));
      const idRes = await fetch('/api/student/id');
      const reservedId = await idRes.json();

      let profilePicUrl = null;
      if (userData.profilePicFile) {
        try {
          profilePicUrl = await uploadProfilePic(userData.profilePicFile, { userType: 'student', id: reservedId });
        } catch (e) {
          setError(e?.message || 'Profile picture upload failed');
          return;
        }
      }

      const payload = {
        ...studentData,
        id: reservedId,
        student: {
          ...(studentData.student || {}),
          profile_pic: profilePicUrl || studentData?.student?.profile_pic || studentData?.student?.profilePic || '',
        },
      };

      await registerStudent(payload);
      navigate('/login');
    }
  };


  return (
    <div className="register-container">
      {!showUploadForm ? (
        <div className="register-card">
          <button
            type="button"
            className="auth-back-button"
            onClick={() => navigate('/')}
            aria-label="Back to home"
          >
            &larr;
          </button>
          <h2>Register to Tutor Connect</h2>
          {error && <p className="register-error">{error}</p>}
          <form onSubmit={handleSubmit}>
            <input type="text" name="firstName" placeholder="First Name" required onChange={handleChange} />
            <input type="text" name="lastName" placeholder="Last Name" required onChange={handleChange} />
            <input type="email" name="email" placeholder="Email" required onChange={handleChange} />
            <input type="password" name="password" placeholder="Password" required onChange={handlePasswordChange} />
            <input type="password" name="confirmPassword" placeholder="Confirm Password" required onChange={handlePasswordChange} />
            <input type="date" name="birthday" placeholder="Birthday" required onChange={handleChange} />
            <select name="major" required onChange={handleChange}>
              <option value="">Select Major</option>
              {majors.map(major => <option key={major} value={major}>{major}</option>)}
            </select>
            <select name="language" required onChange={handleChange}>
              <option value="">Select Language</option>
              {languages.map(language => <option key={language} value={language}>{language}</option>)}
            </select>

            <label className="upload-label">Profile Picture (optional)</label>
            <input
              type="file"
              accept="image/*"
              onChange={handleProfilePicChange}
            />
            <div className="toggle-container">
              <label className="toggle-label">I register as a tutor</label>
              <div className="toggle-switch" onClick={handleToggle}>
                <input type="checkbox" checked={isTutor} readOnly />
                <span className="slider"></span>
              </div>
            </div>
            <button type="submit" className="register-button">Register</button>
          </form>
          <div className="link-to-login">
            <p><Link to="/login" className="link">I already have an account</Link></p>
          </div>
        </div>
      ) : submissionComplete ? (
        <div className="register-card">
          <button
            type="button"
            className="auth-back-button"
            onClick={() => navigate('/')}
            aria-label="Back to home"
          >
            &larr;
          </button>
          <h2>Thank You!</h2>
          <p>Once admin approves your document, you will have access to your account.</p>
        </div>
      ) : (
        <div className="register-card">
          <button
            type="button"
            className="auth-back-button"
            onClick={() => navigate('/')}
            aria-label="Back to home"
          >
            &larr;
          </button>
          <h2>Upload Proof of Qualification</h2>
          <form onSubmit={handleProofSubmit}>
            <input type="file" accept=".jpg,.png" onChange={handleFileChange} required />
            <button type="submit" className="register-button">Submit Proof</button>
          </form>
        </div>
      )}
    </div>
  );
};

export default RegisterPage;