"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import QuizPanel from "@/components/student/quiz-panel";
import PageBackground from "@/components/page-background";
import StudentTopbar from "@/components/student/student-topbar";
import type { ApiResult } from "@/domain/agent";
export default function QuizPage() {
  const { session_id: id } = useParams<{ session_id: string }>();
  const router = useRouter();
  const [stepNo, setStepNo] = useState<number | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/student/quiz/session?session_id=" + encodeURIComponent(id))
      .then(r => r.json() as Promise<ApiResult<{ stepNo: number }>>).then(result => {
        if (cancelled) return;
        if (result.ok) setStepNo(result.data.stepNo); else setError(result.error.message);
      }).catch(() => { if (!cancelled) setError("读取失败，请刷新后重试。"); });
    return () => { cancelled = true; };
  }, [id]);
  return <div className="watercolor-student-task"><PageBackground /><StudentTopbar title="知识检验" subtitle="逐题思考 · 独立作答" onBack={() => router.push("/student/map")} backLabel="实验地图" />
    <main className="relative mx-auto max-w-6xl px-4 pb-12">{error && <p role="alert" className="learning-notice is-error">{error}</p>}{stepNo ? <QuizPanel stepNo={stepNo} initialId={id} onContinue={() => router.push("/student/step/" + stepNo + "?stage=2")} /> : !error && <p className="learning-paper">正在读取学习记录…</p>}</main>
  </div>;
}
