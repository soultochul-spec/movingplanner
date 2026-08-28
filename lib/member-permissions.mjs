export function memberPermissions(plan, members, actorId) {
  const current = actorId ? members.find((member) => member.userId === actorId) : undefined;
  const representative = members.find((member) => member.id === plan.representativeId);
  const isRepresentative = Boolean(actorId && representative?.userId === actorId);
  return { current, representative, isRepresentative,
    canAppoint: Boolean(plan.representativeReady && (isRepresentative || (!plan.representativeId && actorId && plan.ownerId === actorId))) };
}

export function removeLocalMember(bundle, memberId, actorId) {
  const { isRepresentative } = memberPermissions(bundle.plan, bundle.members, actorId);
  if (!isRepresentative) throw new Error("대표만 참여자를 삭제할 수 있습니다.");
  if (memberId === bundle.plan.representativeId) throw new Error("대표를 먼저 다른 참여자에게 넘겨 주세요.");
  if (!bundle.members.some((member) => member.id === memberId)) throw new Error("참여자를 찾을 수 없습니다.");
  return { ...bundle, members: bundle.members.filter((member) => member.id !== memberId),
    tasks: bundle.tasks.map((task) => task.assigneeId === memberId ? { ...task, assigneeId: undefined } : task) };
}

export function appointLocalRepresentative(bundle, memberId, actorId) {
  if (!memberPermissions(bundle.plan, bundle.members, actorId).canAppoint) throw new Error("대표를 변경할 권한이 없습니다.");
  const member = bundle.members.find((member) => member.id === memberId);
  if (!member?.userId) throw new Error("본인 계정으로 참여한 사람에게만 대표를 넘길 수 있습니다.");
  return { ...bundle, plan: { ...bundle.plan, representativeId: member.id } };
}
