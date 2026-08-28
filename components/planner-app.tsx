"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { dueDate, formatDate } from "../lib/template";
import { repository } from "../lib/repository";
import { isCollaborationEnabled } from "../lib/collaboration";
import { clientSupabase } from "../lib/client-supabase";
import { memberPermissions } from "../lib/member-permissions.mjs";
import type { User } from "@supabase/supabase-js";
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
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!isCollaborationEnabled);
  const [bundles, setBundles] = useState<PlanBundle[]>([]);
  const [current, setCurrent] = useState<PlanBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isCollaborationEnabled || !clientSupabase) { setAuthReady(true); return; }
    clientSupabase.auth.getUser().then(({ data }) => { setUser(data.user); setAuthReady(true); });
    const { data } = clientSupabase.auth.onAuthStateChange((_event, session) => { setUser(session?.user || null); setAuthReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  const refreshList = useCallback(async () => {
    try { setBundles(await repository.listPlans()); } catch (err) { setError(err instanceof Error ? err.message : "계획을 불러오지 못했습니다."); }
  }, []);
  const openToken = useCallback(async (token: string, showLoading = true) => {
    if (showLoading) setLoading(true); setError("");
    try { setCurrent(await repository.getBundle(token)); } catch (err) { setError(err instanceof Error ? err.message : "계획을 찾지 못했습니다."); }
    finally { if (showLoading) setLoading(false); }
  }, []);
  useEffect(() => {
    if (!authReady || (isCollaborationEnabled && !user)) return;
    const token = new URLSearchParams(window.location.search).get("plan");
    if (token) openToken(token); else refreshList().finally(() => setLoading(false));
  }, [authReady, user?.id, openToken, refreshList]);
  useEffect(() => {
    if (!current) return;
    return repository.subscribe(current.plan.id, () => openToken(current.plan.shareToken, false));
  }, [current?.plan.id, current?.plan.shareToken, openToken]);

  const navigate = (bundle: PlanBundle | null) => {
    setCurrent(bundle);
    const url = new URL(window.location.href);
    if (bundle) url.searchParams.set("plan", bundle.plan.shareToken); else url.searchParams.delete("plan");
    window.history.pushState({}, "", url);
    if (!bundle) refreshList();
  };

  if (!authReady) return <main className="shell loading">로그인 상태를 확인하는 중입니다…</main>;
  if (isCollaborationEnabled && !clientSupabase) return <main className="shell loading">로그인 환경 변수가 설정되지 않았습니다.</main>;
  if (isCollaborationEnabled && !user) return <LoginScreen />;
  if (loading) return <main className="shell loading">이사 계획을 불러오는 중입니다…</main>;
  if (current) return <PlanView bundle={current} userId={user?.id} onBack={() => navigate(null)} onRefresh={async () => { setCurrent(await repository.getBundle(current.plan.shareToken)); }} />;
  return <Dashboard bundles={bundles} error={error} onLogout={async () => { await clientSupabase?.auth.signOut(); setBundles([]); setCurrent(null); setLoading(true); }} onOpen={(bundle) => navigate(bundle)} onCreated={(bundle) => { setBundles((all) => [bundle, ...all]); navigate(bundle); }} />;
}

function LoginScreen() {
  const [email, setEmail] = useState(""); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  const emailLogin = async (event: FormEvent) => { event.preventDefault(); if (!clientSupabase) return; try { setBusy(true); setError(""); const { error } = await clientSupabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } }); if (error) throw error; setMessage("이메일로 로그인 링크를 보냈습니다. 받은 편지함을 확인해 주세요."); } catch (err) { setError(err instanceof Error ? err.message : "로그인 링크를 보내지 못했습니다."); } finally { setBusy(false); } };
  const googleLogin = async () => { if (!clientSupabase) return; setBusy(true); setError(""); const { error } = await clientSupabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.href } }); if (error) { setError(error.message); setBusy(false); } };
  return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">함께 준비하는 이사</p><h1>이사 플래너</h1><p>로그인하면 어느 기기에서든 내 이사 계획을 확인할 수 있습니다.</p><button className="google-button" disabled={busy} onClick={googleLogin}>G&nbsp;&nbsp;Google로 계속하기</button><div className="auth-divider"><span>또는 이메일</span></div><form className="form" onSubmit={emailLogin}><label>이메일 주소<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="name@example.com" /></label><button className="primary" disabled={busy}>{busy ? "보내는 중…" : "이메일로 로그인 링크 받기"}</button></form>{message && <p className="notice">{message}</p>}{error && <p className="error">{error}</p>}</section></main>;
}

function Dashboard({ bundles, error, onLogout, onOpen, onCreated }: { bundles: PlanBundle[]; error: string; onLogout: () => void; onOpen: (bundle: PlanBundle) => void; onCreated: (bundle: PlanBundle) => void }) {
  const [showForm, setShowForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creating) return;
    const data = new FormData(event.currentTarget);
    try {
      setCreating(true); setCreateError("");
      const bundle = await repository.createPlan({ name: String(data.get("name")), moveDate: String(data.get("moveDate")), origin: String(data.get("origin")), destination: String(data.get("destination")) });
      onCreated(bundle);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "계획을 만들지 못했습니다.");
    } finally {
      setCreating(false);
    }
  };
  return <main className="shell">
    <header className="hero"><div><p className="eyebrow">함께 준비하는 이사</p><h1>이사 플래너</h1><p>이사일을 정하고, 모두의 준비를 한곳에서 확인하세요.</p></div><div className="header-actions"><button className="quiet" onClick={onLogout}>로그아웃</button><button className="primary" onClick={() => setShowForm(true)}>+ 새 이사 계획</button></div></header>
    {error && <p className="error">{error}</p>}
    <section className="card-grid">{bundles.map((bundle) => <PlanCard key={bundle.plan.id} bundle={bundle} onClick={() => onOpen(bundle)} />)}</section>
    {!bundles.length && <section className="empty"><span>📦</span><h2>첫 이사 계획을 만들어 보세요</h2><p>D-day를 기준으로 필요한 준비 항목을 자동으로 채워드립니다.</p></section>}
    {showForm && <Modal title="새 이사 계획" onClose={() => { if (!creating) setShowForm(false); }}><form className="form" onSubmit={submit}><label>계획 이름<input name="name" required disabled={creating} placeholder="예: 성수동 새집 이사" /></label><label>이사 D-day<input name="moveDate" type="date" required disabled={creating} /></label><label>출발지 <span>(선택)</span><input name="origin" disabled={creating} placeholder="예: 마포구 연남동" /></label><label>도착지 <span>(선택)</span><input name="destination" disabled={creating} placeholder="예: 성동구 성수동" /></label>{createError && <p className="error">{createError}</p>}<button className="primary" type="submit" disabled={creating}>{creating ? "계획 만드는 중…" : "계획 만들기"}</button></form></Modal>}
  </main>;
}

function PlanCard({ bundle, onClick }: { bundle: PlanBundle; onClick: () => void }) {
  const complete = bundle.tasks.filter((task) => task.completed).length;
  const upcoming = bundle.tasks.filter((task) => !task.completed && dueDate(bundle.plan.moveDate, task.relativeDays).getTime() >= Date.now()).sort((a, b) => a.relativeDays - b.relativeDays)[0];
  const day = dDay(bundle.plan.moveDate);
  return <button className="plan-card" onClick={onClick}><div className="card-top"><span className="dday">{relativeText(day)}</span><span className="muted">{formatDate(bundle.plan.moveDate)}</span></div><h2>{bundle.plan.name}</h2><p>{bundle.plan.origin || "출발지 미입력"} <b>→</b> {bundle.plan.destination || "도착지 미입력"}</p><div className="progress"><i style={{ width: `${bundle.tasks.length ? complete / bundle.tasks.length * 100 : 0}%` }} /></div><div className="card-bottom"><span>{complete}/{bundle.tasks.length} 완료</span><span>{upcoming ? `다음: ${upcoming.title}` : "모든 항목 완료"}</span></div></button>;
}

function PlanView({ bundle, userId, onBack, onRefresh }: { bundle: PlanBundle; userId?: string; onBack: () => void; onRefresh: () => Promise<void> }) {
  const [localId, setLocalId] = useState<string>();
  useEffect(() => { setLocalId(getSessionId()); }, []);
  const actorId = isCollaborationEnabled ? userId : localId;
  const permissions = memberPermissions(bundle.plan, bundle.members, actorId);
  const member = permissions.current || (!bundle.plan.representativeReady ? bundle.members.find((item) => item.sessionId === localId) : undefined);
  const [showJoin, setShowJoin] = useState(false); const [showTask, setShowTask] = useState(false); const [editing, setEditing] = useState<Task | null>(null); const [editingPlan, setEditingPlan] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [operationError, setOperationError] = useState("");
  const [filter, setFilter] = useState("전체"); const [category, setCategory] = useState("전체"); const [busy, setBusy] = useState(false);
  useEffect(() => { if (actorId) setShowJoin(!member); }, [actorId, member]);
  const visible = useMemo(() => bundle.tasks.filter((task) => (filter === "전체" || (filter === "완료" ? task.completed : !task.completed)) && (category === "전체" || task.category === category)).sort((a, b) => a.relativeDays - b.relativeDays), [bundle.tasks, filter, category]);
  const progress = bundle.tasks.length ? Math.round(bundle.tasks.filter((task) => task.completed).length / bundle.tasks.length * 100) : 0;
  const save = async (action: () => Promise<void>) => {
    if (busy) return false;
    try { setBusy(true); setOperationError(""); await action(); await onRefresh(); return true; }
    catch (err) { setOperationError(err instanceof Error ? err.message : "변경을 저장하지 못했습니다."); return false; }
    finally { setBusy(false); }
  };
  const copyLink = () => navigator.clipboard.writeText(window.location.href);
  return <main className="shell detail"><header className="detail-header"><button className="back" onClick={onBack}>← 모든 계획</button><div className="header-actions">{isCollaborationEnabled && <button className="quiet" onClick={copyLink}>🔗 초대 링크 복사</button>}<button className="quiet" onClick={() => setEditingPlan(true)}>계획 수정</button></div></header>
    <section className="plan-summary"><div><p className="eyebrow">{formatDate(bundle.plan.moveDate)} 이사</p><h1>{bundle.plan.name}</h1><p>{bundle.plan.origin || "출발지 미입력"} → {bundle.plan.destination || "도착지 미입력"}</p></div><div className="countdown"><strong>{relativeText(dDay(bundle.plan.moveDate))}</strong><span>이사까지</span></div></section>
    <section className="stats"><div><span>전체 진행률</span><strong>{progress}%</strong><div className="progress"><i style={{ width: `${progress}%` }} /></div></div><button className="member-stat" onClick={() => setShowMembers(true)}><span>참여자 · 관리</span><strong>{bundle.members.length}명</strong><p>{bundle.members.map((item) => item.displayName).join(" · ") || "사용자를 추가해 보세요"}</p></button><div><span>남은 할 일</span><strong>{bundle.tasks.filter((task) => !task.completed).length}개</strong><p>마감일 기준으로 정렬됩니다.</p></div></section>
    <section className="tasks"><div className="task-toolbar"><div><h2>준비 체크리스트</h2><p>체크하면 모두에게 바로 반영됩니다.</p></div><button className="primary" onClick={() => { setEditing(null); setShowTask(true); }}>+ 항목 추가</button></div><div className="filters"><select value={filter} onChange={(event) => setFilter(event.target.value)}><option>전체</option><option>예정</option><option>완료</option></select><select value={category} onChange={(event) => setCategory(event.target.value)}><option>전체</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></div><div className="task-list">{visible.map((task) => <TaskRow key={task.id} task={task} plan={bundle.plan} members={bundle.members} disabled={busy} onToggle={() => save(() => repository.saveTask({ ...task, completed: !task.completed, completedBy: !task.completed ? member?.displayName || "이름 미등록" : undefined, completedAt: !task.completed ? new Date().toISOString() : undefined }, bundle.plan.shareToken))} onEdit={() => { setEditing(task); setShowTask(true); }} />)}</div></section>
    {operationError && !showMembers && !showJoin && <p className="error" role="alert">{operationError}</p>}
    {showJoin && <JoinModal busy={busy} error={operationError} onJoin={async (name) => { if (await save(async () => { await repository.joinPlan(bundle.plan.id, name, getSessionId(), bundle.plan.shareToken); })) setShowJoin(false); }} />}
    {showMembers && <MembersModal members={bundle.members} plan={bundle.plan} actorId={actorId} busy={busy} error={operationError} onClose={() => setShowMembers(false)}
      onAdd={(name) => save(async () => { await repository.addMember(bundle.plan.id, name, bundle.plan.shareToken); })}
      onDelete={(target) => save(async () => { await repository.deleteMember(bundle.plan.id, target.id, bundle.plan.shareToken); })}
      onAppoint={(target) => save(async () => { await repository.setRepresentative(bundle.plan.id, target.id, bundle.plan.shareToken); })} />}
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

function JoinModal({ onJoin, busy, error }: { onJoin: (name: string) => void; busy: boolean; error: string }) {
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const name = String(new FormData(event.currentTarget).get("name")).trim(); if (name) onJoin(name); };
  return <Modal title="함께 이사 준비하기" onClose={() => undefined}><p className="modal-copy">본인 이름을 등록해 주세요. 로그인 계정에 연결되며, 계획 작성자는 첫 대표가 됩니다. 기존에 이름만 등록했다면 본인 계정으로 다시 참여해 주세요.</p><form className="form" onSubmit={submit}><label>표시 이름<input name="name" required maxLength={20} disabled={busy} autoFocus placeholder="예: 지은" /></label>{error && <p className="error" role="alert">{error}</p>}<button className="primary" disabled={busy} type="submit">{busy ? "등록 중…" : "참여하기"}</button></form></Modal>;
}

function MembersModal({ members, plan, actorId, busy, error, onClose, onAdd, onDelete, onAppoint }: {
  members: Member[]; plan: Plan; actorId?: string; busy: boolean; error: string; onClose: () => void;
  onAdd: (name: string) => Promise<boolean>; onDelete: (member: Member) => Promise<boolean>; onAppoint: (member: Member) => Promise<boolean>;
}) {
  const permissions = memberPermissions(plan, members, actorId);
  const [pending, setPending] = useState<{ action: "delete" | "representative"; member: Member } | null>(null);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const name = String(new FormData(form).get("name")).trim();
    if (name && await onAdd(name)) form.reset();
  };
  const confirm = async () => {
    if (!pending) return;
    const success = await (pending.action === "delete" ? onDelete(pending.member) : onAppoint(pending.member));
    if (success) setPending(null);
  };
  return <Modal title="참여자 관리" onClose={() => { if (!busy) onClose(); }}>
    <p className="modal-copy">대표만 참여자를 삭제하거나 대표를 넘길 수 있습니다. 대표 권한은 이름 선택이 아닌 로그인 계정으로 확인합니다.</p>
    {!plan.representativeReady && <p className="notice">대표 기능을 사용하려면 Supabase에서 대표 권한 DB 업데이트를 적용해야 합니다.</p>}
    {plan.representativeReady && !permissions.representative && <p className="notice">대표 미지정 · 계획 작성자가 본인 이름으로 참여하거나 대표를 지정해 주세요.</p>}
    <div className="member-list">{members.map((item) => <div key={item.id} className={item.id === permissions.current?.id ? "member active" : "member"}>
      <div className="member-label"><span>{item.displayName}</span>{item.id === permissions.current?.id && <b>나</b>}{item.id === plan.representativeId && <b className="representative-badge">대표</b>}{!item.userId && <small>이름만 등록</small>}</div>
      <div className="member-actions">
        {permissions.canAppoint && item.userId && item.id !== plan.representativeId && <button className="quiet" disabled={busy || !!pending} onClick={() => setPending({ action: "representative", member: item })}>{plan.representativeId ? "대표 넘기기" : "대표로 지정"}</button>}
        {permissions.isRepresentative && item.id !== plan.representativeId && <button className="danger" disabled={busy || !!pending} onClick={() => setPending({ action: "delete", member: item })}>삭제</button>}
      </div>
    </div>)}{!members.length && <p className="member-empty">아직 등록된 사용자가 없습니다.</p>}</div>
    {pending && <section className="member-confirm" aria-label={pending.action === "delete" ? "참여자 삭제 확인" : "대표 변경 확인"}>
      <p>{pending.action === "delete" ? `${pending.member.displayName}님을 삭제할까요? 담당자 배정만 해제되고 할 일과 완료 기록은 남습니다.` : `${pending.member.displayName}님을 대표로 지정할까요? 기존 대표의 삭제 권한은 즉시 해제됩니다.`}</p>
      <div className="form-actions"><button className="quiet" disabled={busy} onClick={() => setPending(null)}>취소</button><button className={pending.action === "delete" ? "danger" : "primary"} disabled={busy} onClick={confirm}>{busy ? "처리 중…" : "확인"}</button></div>
    </section>}
    {error && <p className="error" role="alert">{error}</p>}
    <form className="inline-form" onSubmit={submit}><input name="name" aria-label="추가할 사용자 이름" required maxLength={20} disabled={busy} placeholder="추가할 사용자 이름" /><button className="primary" disabled={busy} type="submit">추가</button></form>
    <p className="modal-copy member-help">여기서 추가한 이름은 담당자 배정용입니다. 대표를 맡을 사람은 초대 링크에서 본인 계정으로 참여해 주세요. 참여자 삭제는 계정 차단이 아닙니다.</p>
  </Modal>;
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
