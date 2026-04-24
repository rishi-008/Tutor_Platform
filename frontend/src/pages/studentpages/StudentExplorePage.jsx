import React from "react";
import TutorCard from "../../components/TutorCard";
import { useNavigate } from "react-router-dom";
import { getTutors } from "../../controllers/AccountController";
import { tutorListBasedOnQuery } from "../../controllers/AccountController";
function StudentExplorePage(props) {
  const [tutors, setTutors] = React.useState([]);
  const [queriedTutors, setQueriedTutors] = React.useState([]);
  const [searchedQuery, setSearchedQuery] = React.useState([]);
  const navigate = useNavigate();
  const user = props.user;
  React.useEffect(() => {
    async function fetchData() {
      const tutors = await getTutors();
    //   const sortedTutors = tutors.sort(
    //     (a, b) => b.tutor.rating - a.tutor.rating
    //   );
      setTutors(tutors);
    }
    fetchData();
  }, []);
  return (
    <>
      <div>
        <div className="navbar">
          {/* using useNavigation is aparantly more syntactically correct  */}
          <input
            type="text"
            placeholder="Search Tutors"
            onChange={async (e) => {
              const searchQuery = e.target.value;
              setSearchedQuery(searchQuery);
              const queriedTutors = await tutorListBasedOnQuery(searchQuery);
              setQueriedTutors(queriedTutors);
            }}
          />
          <button
            className="tutorSearchButton"
            onClick={() =>
              navigate("/tutorsearch", { state: { searchQueryResult: queriedTutors, searchedQuery: searchedQuery, user: user } })
            }
          >
            Go to Tutor Search
          </button>
        </div>
        <h1>Top Tutors</h1>
        <div className="Tutor-List">
          {tutors.map((tutor, index) => (
            // Mock data for tutors. Change the values with appropriate tutor data.
            <TutorCard key={index} tutor={tutor} user={user} />
          ))}
        </div>
      </div>

      <style jsx>
        {`
          .navbar {
            display: flex;
            gap: 10px;
            width: 100%;
            padding: 12px 20px;
            margin: 8px 0;
            box-sizing: border-box;
            align-items: center;
            flex-wrap: wrap;
          }

          .navbar input {
            flex: 1;
            min-width: 240px;
            padding: 10px 12px;
            border: 1px solid #ddd;
            border-radius: 8px;
          }

          .tutorSearchButton {
            background-color: #007BFF;
            color: white;
            border: 1px solid #007BFF;
            cursor: pointer;
            padding: 10px 14px;
            border-radius: 8px;
            font-weight: 600;
            white-space: nowrap;
          }

          .tutorSearchButton:hover {
            filter: brightness(0.95);
          }

          .tutorSearchButton:active {
            filter: brightness(0.9);
          }

          .Tutor-List {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 20px;
            padding: 20px;
          }

          @media (max-width: 480px) {
            .navbar {
              padding: 12px 12px;
            }

            .navbar input {
              min-width: 0;
              width: 100%;
              flex: 1 1 100%;
            }

            .tutorSearchButton {
              width: 100%;
            }

            .Tutor-List {
              grid-template-columns: 1fr;
              padding: 12px;
            }
          }
        `}
      </style>
    </>
  );
}

export default StudentExplorePage;
