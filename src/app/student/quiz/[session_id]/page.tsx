'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ChevronRight, Check } from 'lucide-react';
import { clientErrorMessage } from '@/lib/client-request';

interface QuizQuestion {
  question_id: string;
  question_text: string;
  options: Array<{ id: string; text: string }>;
}

interface QuizResult {
  question_id: string;
  user_answer: string | null;
  correct_answer: string;
  is_correct: boolean;
  explanation: string;
}

export default function QuizPage() {
  const router = useRouter();
  const params = useParams();
  const sessionId = params?.session_id as string;

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<QuizResult[] | null>(null);
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    // 从服务端加载已有会话（如果用户刷新页面）
    fetch(`/api/student/quiz/session?session_id=${sessionId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.code === 'OK' && data.data) {
          setQuestions(data.data.questions || []);
          setAnswers(data.data.answers || {});
          if (data.data.results) {
            // 已完成，直接展示结果
            setResults(data.data.results);
            setScore(data.data.results.filter((r: QuizResult) => r.is_correct).length);
            setTotal(data.data.results.length);
          }
        } else {
          setError(data.message || '加载测验失败');
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(clientErrorMessage(err, '加载失败'));
        setLoading(false);
      });
  }, [sessionId]);

  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;
  const hasAnswered = currentQuestion && !!answers[currentQuestion.question_id];

  const handleSelectOption = (optionId: string) => {
    if (!currentQuestion || results) return;
    setAnswers({ ...answers, [currentQuestion.question_id]: optionId });
  };

  const handleNext = () => {
    if (!hasAnswered) {
      alert('请先选择答案再继续');
      return;
    }
    if (isLastQuestion) {
      // 最后一题，弹窗确认提交
      if (confirm('确认提交所有答案吗？提交后将无法修改。')) {
        handleSubmit();
      }
    } else {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/student/quiz/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, answers }),
      });
      const data = await res.json();
      if (data.code === 'OK') {
        setResults(data.data.results);
        setScore(data.data.score);
        setTotal(data.data.total);
        setCurrentIndex(0); // 重置到第一题展示答案
      } else {
        alert(data.message || '提交失败');
      }
    } catch (err) {
      alert(clientErrorMessage(err, '加载失败'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  // 展示结果页
  if (results) {
    const currentResult = results[currentIndex];
    const currentQ = questions[currentIndex];
    return (
      <div className="min-h-screen bg-muted/30 p-6">
        <div className="max-w-3xl mx-auto">
          <div className="rounded-2xl border border-border/60 shadow-card bg-card p-6 mb-6">
            <h2 className="text-xl font-extrabold mb-2">测验完成</h2>
            <p className="text-sm text-muted-foreground">
              得分：<span className="text-primary font-bold text-lg">{score}</span> / {total}
            </p>
          </div>

          <div className="rounded-2xl border border-border/60 shadow-card bg-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold">
                第 {currentIndex + 1} 题 / {questions.length}
              </h3>
              {currentResult.is_correct ? (
                <span className="text-xs font-bold text-primary flex items-center gap-1">
                  <Check className="w-4 h-4" /> 答对了
                </span>
              ) : (
                <span className="text-xs font-bold text-destructive">答错了</span>
              )}
            </div>

            <p className="text-sm font-semibold mb-4">{currentQ.question_text}</p>

            <div className="space-y-2 mb-6">
              {currentQ.options.map((opt) => {
                const isUserAnswer = currentResult.user_answer === opt.id;
                const isCorrect = opt.id === currentResult.correct_answer;
                let className =
                  'rounded-lg border p-3 text-sm transition-colors cursor-default';
                if (isCorrect) {
                  className += ' border-primary bg-primary/10 text-primary font-bold';
                } else if (isUserAnswer && !isCorrect) {
                  className += ' border-destructive bg-destructive/10 text-destructive';
                } else {
                  className += ' border-border/40 text-muted-foreground';
                }
                return (
                  <div key={opt.id} className={className}>
                    {opt.id}. {opt.text}
                  </div>
                );
              })}
            </div>

            <div className="rounded-lg border border-border/40 bg-muted/30 p-4">
              <h4 className="text-xs font-bold mb-2">答案解析</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {currentResult.explanation}
              </p>
            </div>

            <div className="flex gap-3 mt-6">
              {currentIndex > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentIndex(currentIndex - 1)}
                >
                  上一题
                </Button>
              )}
              {currentIndex < questions.length - 1 && (
                <Button size="sm" onClick={() => setCurrentIndex(currentIndex + 1)}>
                  下一题
                </Button>
              )}
              {currentIndex === questions.length - 1 && (
                <Button size="sm" onClick={() => router.push('/student/map')}>
                  返回实验地图
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 答题页
  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="max-w-3xl mx-auto">
        <div className="rounded-2xl border border-border/60 shadow-card bg-card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold">
              第 {currentIndex + 1} 题 / {questions.length}
            </h3>
            <span className="text-xs text-muted-foreground">
              已答 {Object.keys(answers).length} 题
            </span>
          </div>

          <p className="text-sm font-semibold mb-4">{currentQuestion.question_text}</p>

          <div className="space-y-2 mb-6">
            {currentQuestion.options.map((opt) => {
              const isSelected = answers[currentQuestion.question_id] === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => handleSelectOption(opt.id)}
                  className={`w-full rounded-lg border p-3 text-sm text-left transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/10 text-primary font-bold'
                      : 'border-border/40 hover:border-primary/50 hover:bg-muted/50'
                  }`}
                >
                  {opt.id}. {opt.text}
                </button>
              );
            })}
          </div>

          <Button
            onClick={handleNext}
            disabled={!hasAnswered || submitting}
            className="w-full"
            size="lg"
          >
            {submitting
              ? '提交中...'
              : isLastQuestion
                ? '提交答案'
                : '下一题'}
            {!isLastQuestion && <ChevronRight className="w-4 h-4 ml-1" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
