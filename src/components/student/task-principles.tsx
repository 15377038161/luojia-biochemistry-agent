"use client";
import { useState } from "react";
import Image from "next/image";
import { BookOpen, Microscope } from "lucide-react";
import type { ExperimentStep } from "@/domain/agent";
import { Button } from "@/components/ui/button";
import ExperimentProfileCard from "./experiment-profile-card";

const instrumentPhotos = [
  { match: "超声", name: "超声破碎仪", src: "/course-assets/sonicator.jpg", prompt: "观察主机、探头与样品接触部位，说明各部分承担什么功能。" },
  { match: "低温离心", name: "低温离心机", src: "/course-assets/refrigerated-centrifuge.jpg", prompt: "观察转子与样品放置区域，解释为什么要配平及控制温度。" },
  { match: "分光光度", name: "分光光度计", src: "/course-assets/spectrophotometer.jpg", prompt: "寻找样品测量区域，说明空白校正和读数的用途。" },
  { match: "酶标", name: "酶标仪", src: "/course-assets/microplate-reader.jpg", prompt: "结合多孔板测量方式，说明孔位、空白和重复孔怎样安排。" },
];
export default function TaskPrinciples({ step, sessionId, preview }: { step: ExperimentStep; sessionId: string; preview: boolean }) {
  const [section, setSection] = useState("principle");
  const [showExecutionDetails, setShowExecutionDetails] = useState(true);
  const photos = instrumentPhotos.filter(photo => step.instruments.some(name => name.includes(photo.match)));
  return <section className="learning-paper principle-workspace">
    <header className="learning-section-heading"><div><span className="learning-eyebrow">01 / EXPLORE THE EXPERIMENT</span><h2>先理解，再动笔</h2><p>{step.goal}</p></div><BookOpen aria-hidden className="section-mark" /></header>
    <div className="learning-context"><span className="learning-eyebrow">本步任务</span><p>{step.context}</p></div>
    {step.id === 1 && <ExperimentProfileCard sessionId={sessionId} preview={preview} />}
    <nav className="learning-tabs" aria-label="任务学习内容">
      {[["principle", "为什么这样做"], ["instruments", "器材与识别"], ["check", "操作自检"]].map(([key, label]) => <button type="button" aria-current={section === key ? "page" : undefined} key={key} onClick={() => setSection(key)}>{label}</button>)}
    </nav>
    {section === "principle" && <div className="principle-reading"><h3>连接原理与操作</h3>{step.principle.split("。").filter(Boolean).map((text, i) => <article key={i}><span>{String(i + 1).padStart(2, "0")}</span><p>{text}。</p></article>)}
      <details className="learning-disclosure"><summary>把原理转成自己的解释</summary><p>如果改变一个关键条件，结果会怎样变化？为什么？尝试把“因为……所以……”放进你的解释中。</p><p>{step.scientificPractice}</p></details>
      <p className="learning-source">课程来源：{step.source}</p>
    </div>}
    {section === "instruments" && <div><h3 className="mt-5">认识器材，也解释用途</h3><p className="learning-muted">本步涉及：{step.instruments.join("、")}。观察课程实物图，再用自己的话解释识别依据和功能。</p>
      <div className="instrument-gallery">{photos.map(photo => <figure key={photo.src}><Image src={photo.src} alt={photo.name + "课程实物照片"} width={600} height={420} className="instrument-photo" /><figcaption><h4><Microscope size={18} />{photo.name}</h4><p>{photo.prompt}</p><small>来源：教师提供的课程图片</small></figcaption></figure>)}</div>
      {!photos.length && <p className="learning-notice">本步暂未配置相应器材实物图。请结合课程资料，描述器材名称、用途与使用注意事项。</p>}
    </div>}
    {section === "check" && <div className="mt-5"><div className="quiz-toolbar"><h3>操作自检</h3><Button variant="outline" onClick={() => setShowExecutionDetails(value => !value)}>{showExecutionDetails ? "收起全部" : "展开全部"}</Button></div>
      <div className="execution-grid">{[["SOP 参数", step.sopParameters], ["安全事项", step.safetyNotes], ["判断与排错", step.decisionTree], ["设备与记录", [...step.instruments, step.scientificPractice]]].map(([title, lines]) => <article key={String(title)}><h4>{title}</h4>{showExecutionDetails && <ul>{(lines as string[]).map(line => <li key={line}>{line}</li>)}</ul>}</article>)}</div>
    </div>}
  </section>;
}
