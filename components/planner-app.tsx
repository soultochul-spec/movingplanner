"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { dueDate, formatDate } from "../lib/template";
import { repository } from "../lib/repository";
import { isCollaborationEnabled } from "../lib/collaboration";
import type { Category, Member, Plan, PlanBundle, Priority, Task } from "../lib/types";

const categories: Category[] = ["행정", "업체/예약", "짐 정리", "공과금", "계약/정산", "입주"];
const priorities: Priority[] = ["높음", "보통", "낮음"];
const getSessionId = () => {
  const key = "moving-planner-session";
  const value = localStorage.getItem(key) || crypto.randomUUID();
  localStorage.setItem(key, value);
  return value;
};
const relativeText = (days: number) => days === 0 ? "D-day" : days > 0 ? `D+${days}` : `D${days}`;
const dDay = (date: string) => Math.round((new Date(`${date}T12:00:00+09:00`).getTime() - new Date().setHours(0, 0, 0, 0)) / 86_400_000);

export default function PlannerApp() {
  const [bundles, setBundles] = useState<PlanBundle[]>([]);
  const [current, setCurrent] = useState<PlanBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refreshList = useCallback(async () => {
    try { setBundles(await repository.listPlans()); } catch (err) { setError(err instanceof Error ? err.message : "계획을 불러오지 못했습니다."); }
  }, []);
  const openToken = useCallback(async (token: string) => {
    setLoading(true); setError("");
    try { setCurrent(await repository.getBundle(token)); } catch (err) { setError(err instanceof Error ? err.message : "계획을 찾지 못했습니다."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("plan");
    if (token) openToken(token); else refreshList().finally(() => setLoading(false));
  }, [openToken, refreshList]);
  useEffect(() => {
    if (!current) return;
    return repository.subscribe(current.plan.id, () => openToken(current.plan.shareToken));
  }, [current?.plan.id, current?.plan.shareToken, openToken]);

  const navigate = (bundle: PlanBundle | null) => {
    setCurrent(bundle);
    const url = new URL(window.location.href);
    if (bundle) url.searchParams.set("plan", bundle.plan.shareToken); else url.searchParams.delete("plan");
    window.history.pushState({}, "", url);
    if (!bundle) refreshList();
  };

  if (loading) return <main className="shell loading">이사 계획을 불러오는 중입니다…</main>;
  if (current) return <PlanView bundle={current} onBack={() => navigate(null)} onRefresh={() => openToken(current.plan.shareToken)} />;
  return <Dashboard bundles={bundles} error={error} onOpen={(bundle) => navigate(bundle)} onCreated={(bundle) => { setBundles((all) => [bundle, ...all]); navigate(bundle); }} />;
}

function Dashboard({ bundles, error, onOpen, onCreated }: { bundles: PlanBundle[]; error: string; onOpen: (bundle: PlanBundle) => void; onCreated: (bundle: PlanBundle) => void }) {
  const [showForm, setShowForm] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const bundle = await repository.createPlan({ name: String(data.get("name")), moveDate: String(data.get("moveDate")), origin: String(data.get("origin")), destination: String(data.get("destination")) });
    onCreated(bundle);
  };
  return <main className="shell">
    <header className="hero"><div><p className="eyebrow">함께 준비하는 이사</p><h1>이사 플래너</h1><p>이사일을 정하고, 모두의 준비를 한곳에서 확인하세요.</p></div><button className="primary" onClick={() => setShowForm(true)}>+ 새 이사 계획</button></header>
    {!isCollaborationEnabled && <p className="notice">현재 이 기기와 브라우저에서만 사용할 수 있는 로컬 모드입니다. 데이터는 이 브라우저에만 저장되며, 초대 링크·공동 편집은 비활성화되어 있습니다.</p>}
    {error && <p className="error">{error}</p>}
    <section className="card-grid">{bundles.map((bundle) => <PlanCard key={bundle.plan.id} bundle={bundle} onClick={() => onOpen(bundle)} />)}</section>
    {!bundles.length && <section className="empty"><span>📦</span><h2>첫 이사 계획을 만들어 보세요</h2><p>D-day를 기준으로 필요한 준비 항목을 자동으로 채워드립니다.</p></section>}
    {showForm && <Modal title="새 이사 계획" onClose={() => setShowForm(false)}><form className="form" onSubmit={submit}><label>계획 이름<input name="name" required placeholder="예: 성수동 새집 이사" /></label><label>이사 D-day<input name="moveDate" type="date" required /></label><label>출발지 <span>(선택)</span><input name="origin" placeholder="예: 마포구 연남동" /></label><label>도착지 <span>(선택)</span><input name="destination" placeholder="예: 성동구 성수동" /></label><button className="primary" type="submit">계획 만들기</button></form></Modal>}
  </main>;
}

function PlanCard({ bundle, onClick }: { bundle: PlanBundle; onClick: () => void }) {
  const complete = bundle.tasks.filter((task) => task.completed).length;
  const upcoming = bundle.tasks.filter((task) => !task.completed && dueDate(bundle.plan.moveDate, task.relativeDays).getTime() >= Date.now()).sort((a, b) => a.relativeDays - b.relativeDays)[0];
  const day = dDay(bundle.plan.moveDate);
  return <button className="plan-card" onClick={onClick}><div className="card-top"><span className="dday">{relativeText(day)}</span><span className="muted">{formatDate(bundle.plan.moveDate)}</span></div><h2>{bundle.plan.name}</h2><p>{bundle.plan.origin || "출발지 미입력"} <b>→</b> {bundle.plan.destination || "도착지 미입력"}</p><div className="progress"><i style={{ width: `${bundle.tasks.length ? complete / bundle.tasks.length * 100 : 0}%` }} /></div><div className="card-bottom"><span>{complete}/{bundle.tasks.length} 완료</span><span>{upcoming ? `다음: ${upcoming.title}` : "모든 항목 완료"}</span></div></button>;
}

function PlanView({ bundle, onBack, onRefresh }: { bundle: PlanBundle; onBack: () => void; onRefresh: () => void }) {
  const [member, setMember] = useState<Member | null>(null);
  const [showJoin, setShowJoin] = useState(false); const [showTask, setShowTask] = useState(false); const [editing, setEditing] = useState<Task | null>(null); const [editingPlan, setEditingPlan] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [filter, setFilter] = useState("전체"); const [category, setCategory] = useState("전체"); const [busy, setBusy] = useState(false);
  useEffect(() => { const storedId = localStorage.getItem(`moving-planner-member-${bundle.plan.id}`); const found = bundle.members.find((item) => item.id === storedId) || bundle.members.find((item) => item.sessionId === getSessionId()); setMember(found || null); setShowJoin(isCollaborationEnabled && !found); }, [bundle.plan.id, bundle.members]);
  const visible = useMemo(() => bundle.tasks.filter((task) => (filter === "전체" || (filter === "완료" ? task.completed : !task.completed)) && (category === "전체" || task.category === category)).sort((a, b) => a.relativeDays - b.relativeDays), [bundle.tasks, filter, category]);
  const progress = bundle.tasks.length ? Math.round(bundle.tasks.filter((task) => task.completed).length / bundle.tasks.length * 100) : 0;
  const save = async (action: () => Promise<void>) => { try { setBusy(true); await action(); onRefresh(); } finally { setBusy(false); } };
  const copyLink = () => navigator.clipboard.writeText(window.location.href);
  return <main className="shell detail"><header className="detail-header"><button className="back" onClick={onBack}>← 모든 계획</button><div className="header-actions">{isCollaborationEnabled && <button className="quiet" onClick={copyLink}>🔗 초대 링크 복사</button>}<button className="quiet" onClick={() => setEditingPlan(true)}>계획 수정</button></div></header>
    <section className="plan-summary"><div><p className="eyebrow">{formatDate(bundle.plan.moveDate)} 이사</p><h1>{bundle.plan.name}</h1><p>{bundle.plan.origin || "출발지 미입력"} → {bundle.plan.destination || "도착지 미입력"}</p></div><div className="countdown"><strong>{relativeText(dDay(bundle.plan.moveDate))}</strong><span>이사까지</span></div></section>
    <section className="stats"><div><span>전체 진행률</span><strong>{progress}%</strong><div className="progress"><i style={{ width: `${progress}%` }} /></div></div><button className="member-stat" onClick={() => setShowMembers(true)}><span>참여자 · 관리</span><strong>{bundle.members.length}명</strong><p>{bundle.members.map((item) => item.displayName).join(" · ") || "사용자를 추가해 보세요"}</p></button><div><span>남은 할 일</span><strong>{bundle.tasks.filter((task) => !task.completed).length}개</strong><p>마감일 기준으로 정렬됩니다.</p></div></section>
    <section className="tasks"><div className="task-toolbar"><div><h2>준비 체크리스트</h2><p>체크하면 모두에게 바로 반영됩니다.</p></div><button className="primary" onClick={() => { setEditing(null); setShowTask(true); }}>+ 항목 추가</button></div><div className="filters"><select value={filter} onChange={(event) => setFilter(event.target.value)}><option>전체</option><option>예정</option><option>완료</option></select><select value={category} onChange={(event) => setCategory(event.target.value)}><option>전체</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></div><div className="task-list">{visible.map((task) => <TaskRow key={task.id} task={task} plan={bundle.plan} members={bundle.members} disabled={busy} onToggle={() => save(() => repository.saveTask({ ...task, completed: !task.completed, completedBy: !task.completed ? member?.displayName || "이름 미등록" : undefined, completedAt: !task.completed ? new Date().toISOString() : undefined }, bundle.plan.shareToken))} onEdit={() => { setEditing(task); setShowTask(true); }} />)}</div></section>
    {showJoin && isCollaborationEnabled && <JoinModal onJoin={(name) => save(async () => { const next = await repository.joinPlan(bundle.plan.id, name, getSessionId(), bundle.plan.shareToken); setMember(next); setShowJoin(false); })} />}
    {showMembers && <MembersModal members={bundle.members} currentMemberId={member?.id} onClose={() => setShowMembers(false)} onAdd={(name) => save(async () => { const next = await repository.addMember(bundle.plan.id, name, bundle.plan.shareToken); if (!member) { localStorage.setItem(`moving-planner-member-${bundle.plan.id}`, next.id); setMember(next); } })} onSelect={(next) => { localStorage.setItem(`moving-planner-member-${bundle.plan.id}`, next.id); setMember(next); }} />}
    {showTask && <TaskModal task={editing} planId={bundle.plan.id} members={bundle.members} onClose={() => setShowTask(false)} onSave={(task) => save(async () => { if (editing) await repository.saveTask(task, bundle.plan.shareToken); else await repository.addTask(task, bundle.plan.shareToken); setShowTask(false); })} onDelete={editing ? () => save(async () => { await repository.deleteTask(editing, bundle.plan.shareToken); setShowTask(false); }) : undefined} />}
    {editingPlan && <PlanEditModal plan={bundle.plan} onClose={() => setEditingPlan(false)} onSave={(plan) => save(async () => { await repository.savePlan(plan); setEditingPlan(false); })} />}
  </main>;
}

function TaskRow({ task, plan, members, disabled, onToggle, onEdit }: { task: Task; plan: Plan; members: Member[]; disabled: boolean; onToggle: () => void; onEdit: () => void }) {
  const deadline = dueDate(plan.moveDate, task.relativeDays);
  const assignee = members.find((item) => item.id === task.assigneeId)?.displayName;
  const overdue = !task.completed && deadline.getTime() < new Date().setHours(0, 0, 0, 0);
  return <article className={`task ${task.completed ? "done" : ""}`}><input aria-label={`${task.title} 완료`} type="checkbox" checked={task.completed} disabled={disabled} onChange={onToggle} /><div className="task-content"><div className="task-heading"><span className={`category c-${task.category.replace("/", "")}`}>{task.category}</span><h3>{task.title}</h3><span className={`priority ${task.priority}`}>{task.priority}</span></div><p>{task.description}</p><div className="task-meta"><span className={overdue ? "overdue" : ""}>{relativeText(task.relativeDays)} · {formatDate(deadline)}</span>{assignee && <span>담당 {assignee}</span>}{task.completedBy && <span>{task.completedBy}님 완료</span>}</div>{task.note && <p className="note">메모: {task.note}</p>}</div><button className="icon-button" onClick={onEdit} aria-label={`${task.title} 수정`}>···</button></article>;
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}><div className="modal-header"><h2>{title}</h2><button className="close" onClick={onClose} aria-label="닫기">×</button></div>{children}</section></div>;
}

function JoinModal({ onJoin }: { onJoin: (name: string) => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const name = String(new FormData(event.currentTarget).get("name")).trim(); if (name) onJoin(name); };
  return <Modal title="함께 이사 준비하기" onClose={() => undefined}><p className="modal-copy">이 계획에서 사용할 이름을 입력해 주세요. 이후 누가 완료했는지 함께 확인할 수 있어요.</p><form className="form" onSubmit={submit}><label>표시 이름<input name="name" required maxLength={20} autoFocus placeholder="예: 지은" /></label><button className="primary" type="submit">참여하기</button></form></Modal>;
}

function MembersModal({ members, currentMemberId, onClose, onAdd, onSelect }: { members: Member[]; currentMemberId?: string; onClose: () => void; onAdd: (name: string) => void; onSelect: (member: Member) => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const name = String(new FormData(event.currentTarget).get("name")).trim(); if (name) { onAdd(name); event.currentTarget.reset(); } };
  return <Modal title="참여자 관리" onClose={onClose}><p className="modal-copy">사용자 이름을 추가하고, 현재 이 브라우저에서 작업하는 사람을 선택하세요. 담당자 배정과 완료 기록에 사용됩니다.</p><div className="member-list">{members.map((item) => <button type="button" key={item.id} className={item.id === currentMemberId ? "member active" : "member"} onClick={() => onSelect(item)}><span>{item.displayName}</span>{item.id === currentMemberId && <b>현재 사용자</b>}</button>)}{!members.length && <p className="member-empty">아직 등록된 사용자가 없습니다.</p>}</div><form className="inline-form" onSubmit={submit}><input name="name" required maxLength={20} placeholder="추가할 사용자 이름" /><button className="primary" type="submit">추가</button></form></Modal>;
}

function TaskModal({ task, planId, members, onClose, onSave, onDelete }: { task: Task | null; planId: string; members: Member[]; onClose: () => void; onSave: (task: Task) => void; onDelete?: () => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget); const now = new Date().toISOString();
    onSave({ id: task?.id || crypto.randomUUID(), planId, title: String(data.get("title")).trim(), description: String(data.get("description")).trim(), category: String(data.get("category")) as Category, relativeDays: Number(data.get("relativeDays")), priority: String(data.get("priority")) as Priority, assigneeId: String(data.get("assigneeId")) || undefined, completed: task?.completed || false, completedBy: task?.completedBy, completedAt: task?.completedAt, note: String(data.get("note")).trim(), createdAt: task?.createdAt || now });
  };
  return <Modal title={task ? "준비 항목 수정" : "준비 항목 추가"} onClose={onClose}><form className="form" onSubmit={submit}><label>할 일<input name="title" required defaultValue={task?.title} /></label><label>설명<textarea name="description" defaultValue={task?.description} rows={2} /></label><div className="form-row"><label>분류<select name="category" defaultValue={task?.category || categories[0]}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label>기준일<select name="relativeDays" defaultValue={task?.relativeDays ?? -7}>{[-56, -49, -42, -35, -28, -21, -14, -7, -3, -2, -1, 0, 1, 7, 14].map((day) => <option value={day} key={day}>{relativeText(day)}</option>)}</select></label></div><div className="form-row"><label>우선순위<select name="priority" defaultValue={task?.priority || "보통"}>{priorities.map((item) => <option key={item}>{item}</option>)}</select></label><label>담당자<select name="assigneeId" defaultValue={task?.assigneeId || ""}><option value="">미지정</option>{members.map((item) => <option value={item.id} key={item.id}>{item.displayName}</option>)}</select></label></div><label>메모<textarea name="note" defaultValue={task?.note} rows={2} placeholder="예약번호, 연락처, 참고사항" /></label><div className="form-actions">{onDelete && <button type="button" className="danger" onClick={onDelete}>삭제</button>}<button className="primary" type="submit">저장</button></div></form></Modal>;
}

function PlanEditModal({ plan, onClose, onSave }: { plan: Plan; onClose: () => void; onSave: (plan: Plan) => void }) {
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const data = new FormData(event.currentTarget); onSave({ ...plan, name: String(data.get("name")), moveDate: String(data.get("moveDate")), origin: String(data.get("origin")), destination: String(data.get("destination")) }); };
  return <Modal title="이사 계획 수정" onClose={onClose}><p className="modal-copy">D-day를 바꾸면 모든 준비 항목의 실제 마감일도 자동으로 바뀝니다.</p><form className="form" onSubmit={submit}><label>계획 이름<input name="name" required defaultValue={plan.name} /></label><label>이사 D-day<input name="moveDate" type="date" required defaultValue={plan.moveDate} /></label><label>출발지 <span>(선택)</span><input name="origin" defaultValue={plan.origin} /></label><label>도착지 <span>(선택)</span><input name="destination" defaultValue={plan.destination} /></label><button className="primary" type="submit">변경 저장</button></form></Modal>;
}
