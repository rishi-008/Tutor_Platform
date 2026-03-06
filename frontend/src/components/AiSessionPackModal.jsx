import React, { useEffect, useMemo, useState } from 'react';
import { getAiSessionPack } from '../controllers/SessionController';

function AiSessionPackModal({ isOpen, onClose, courseId, audience }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [pack, setPack] = useState(null);

    const normalizedAudience = useMemo(() => {
        return audience === 'tutor' || audience === 'student' ? audience : 'student';
    }, [audience]);

    useEffect(() => {
        if (!isOpen) return;
        if (!courseId) {
            setError('No session selected.');
            setPack(null);
            setLoading(false);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError('');
        setPack(null);

        getAiSessionPack({ sessionId: courseId, audience: normalizedAudience })
            .then((data) => {
                if (cancelled) return;
                setPack(data);
            })
            .catch((e) => {
                if (cancelled) return;
                setError(e?.message || 'Failed to generate session pack');
            })
            .finally(() => {
                if (cancelled) return;
                setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [isOpen, courseId, normalizedAudience]);

    if (!isOpen) return null;

    return (
        <div
            className="modalOverlay"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            role="dialog"
            aria-modal="true"
        >
            <div className="modalContent">
                <div className="headerRow">
                    <h2>Session Pack</h2>
                    <button className="closeButton" onClick={onClose}>
                        Close
                    </button>
                </div>

                {loading && <p>Generating...</p>}
                {!loading && error && <p className="errorText">{error}</p>}

                {!loading && !error && pack && (
                    <div className="packContent">
                        <section>
                            <h3>Summary</h3>
                            <p>{pack.summary || 'No summary available.'}</p>
                        </section>

                        <section>
                            <h3>Action Items</h3>
                            {Array.isArray(pack.actionItems) && pack.actionItems.length > 0 ? (
                                <ul>
                                    {pack.actionItems.map((item, idx) => (
                                        <li key={idx}>{item}</li>
                                    ))}
                                </ul>
                            ) : (
                                <p>No action items available.</p>
                            )}
                        </section>

                        <section>
                            <h3>Misconceptions</h3>
                            {Array.isArray(pack.misconceptions) && pack.misconceptions.length > 0 ? (
                                <ul>
                                    {pack.misconceptions.map((item, idx) => (
                                        <li key={idx}>{item}</li>
                                    ))}
                                </ul>
                            ) : (
                                <p>No misconceptions available.</p>
                            )}
                        </section>

                        <section>
                            <h3>Quiz</h3>
                            {Array.isArray(pack.quiz) && pack.quiz.length > 0 ? (
                                pack.quiz.map((q, idx) => (
                                    <div className="quizItem" key={idx}>
                                        <p className="question">
                                            <strong>Q{idx + 1}:</strong> {q.question}
                                        </p>
                                        {q.hint ? (
                                            <p className="hint">
                                                <strong>Hint:</strong> {q.hint}
                                            </p>
                                        ) : null}
                                        {q.answer ? (
                                            <p className="answer">
                                                <strong>Answer:</strong> {q.answer}
                                            </p>
                                        ) : null}
                                    </div>
                                ))
                            ) : (
                                <p>No quiz available.</p>
                            )}
                        </section>
                    </div>
                )}
            </div>

            <style jsx>{`
                .modalOverlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    z-index: 1000;
                }

                .modalContent {
                    background: white;
                    padding: 20px;
                    border-radius: 8px;
                    width: 70%;
                    max-width: 900px;
                    max-height: 80%;
                    overflow-y: auto;
                }

                .headerRow {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 10px;
                    margin-bottom: 10px;
                }

                .closeButton {
                    background: grey;
                    color: white;
                    border: none;
                    padding: 10px 15px;
                    border-radius: 5px;
                    cursor: pointer;
                }

                .errorText {
                    color: #dc3545;
                }

                .packContent section {
                    margin-top: 16px;
                }

                .quizItem {
                    background: #f0f0f0;
                    padding: 10px;
                    border-radius: 8px;
                    margin-top: 10px;
                }

                .question {
                    margin: 0;
                }

                .hint,
                .answer {
                    margin: 6px 0 0 0;
                }
            `}</style>
        </div>
    );
}

export default AiSessionPackModal;
