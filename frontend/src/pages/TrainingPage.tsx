import { useEffect, useState } from "react";
import TrainingConfigView from "../components/TrainingConfig";
import TrainingSession from "../components/TrainingSession";
import TrainingResults from "../components/TrainingResults";
import { api } from "../services/api";

type Phase = "config" | "session" | "results";

export default function TrainingPage() {
  const [phase, setPhase] = useState<Phase>("config");
  const [session, setSession] = useState<any>(null);
  const [resumePrompt, setResumePrompt] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  // Check for existing session on mount
  useEffect(() => {
    const savedId = localStorage.getItem("training_session_id");
    if (savedId) {
      api
        .resumeTraining(savedId)
        .then((data) => {
          setResumePrompt(data);
        })
        .catch((err) => {
          localStorage.removeItem("training_session_id");
          // 410 = all topics deleted, show nothing
          if (err?.status === 410 || err?.message?.includes("deleted")) {
            console.warn("Training session expired: topics were deleted");
          }
        });
    }
  }, []);

  const handleStart = async (config: any) => {
    setLoading(true);
    try {
      const data = await api.startTraining(config);
      setSession(data);
      localStorage.setItem("training_session_id", data.sessionId);
      setPhase("session");
    } catch (err: any) {
      alert(err.message || "Error al iniciar el entrenamiento");
    } finally {
      setLoading(false);
    }
  };

  const handleResume = () => {
    if (!resumePrompt) return;
    setSession(resumePrompt);
    setResumePrompt(null);
    setPhase("session");
  };

  const handleDismissResume = () => {
    const savedId = localStorage.getItem("training_session_id");
    if (savedId) {
      api.finishTraining(savedId).catch(() => {});
      localStorage.removeItem("training_session_id");
    }
    setResumePrompt(null);
  };

  const handleFinish = async (finishedSession: any) => {
    setSession(finishedSession);
    try {
      const result = await api.finishTraining(finishedSession.sessionId);
      if (result.metrics) {
        setSession((prev: any) => ({ ...prev, metrics: result.metrics }));
      }
    } catch {
      // Metrics already in session from /answer calls
    }
    localStorage.removeItem("training_session_id");
    setPhase("results");
  };

  const handleRestart = () => {
    setSession(null);
    setPhase("config");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="animate-spin inline-block w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full mb-4" />
          <p className="text-gray-500 dark:text-gray-400">
            Preparando entrenamiento...
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {phase === "config" && (
        <TrainingConfigView
          onStart={handleStart}
          resumePrompt={resumePrompt}
          onResume={handleResume}
          onDismissResume={handleDismissResume}
        />
      )}
      {phase === "session" && session && (
        <TrainingSession session={session} onFinish={handleFinish} />
      )}
      {phase === "results" && session && (
        <TrainingResults session={session} onRestart={handleRestart} />
      )}
    </>
  );
}
